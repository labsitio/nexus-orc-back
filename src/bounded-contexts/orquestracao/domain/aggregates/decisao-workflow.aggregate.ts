import { ErroDominio } from '../errors/erro-dominio.js';
import type { ContextoClassificacao } from '../value-objects/contexto-classificacao.vo.js';
import type { ContextoExtracao } from '../value-objects/contexto-extracao.vo.js';
import type { ContextoValidacao } from '../value-objects/contexto-validacao.vo.js';
import type {
  AcaoRoteamento,
  AgenteOrigemDecisao,
} from '../value-objects/decisao-roteamento.vo.js';
import { DecisaoRoteamento } from '../value-objects/decisao-roteamento.vo.js';
import type { NivelConfianca } from '../value-objects/nivel-confianca.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import { TentativaDecisaoWorkflow } from '../value-objects/tentativa-decisao-workflow.vo.js';

export const STATUS_DECISAO_WORKFLOW = [
  'AGUARDANDO_CONTEXTO',
  'CONTEXTO_CONSOLIDADO',
  'DECIDIDO',
  'PENDENTE_REVISAO_HUMANA',
] as const;
export type StatusDecisaoWorkflow = (typeof STATUS_DECISAO_WORKFLOW)[number];

/** Parâmetro operacional — abaixo disso o Orquestrador nunca decide sozinho (plan.md, "Fora de escopo" do spec.md). */
export const LIMIAR_CONFIANCA = 80;

export class ContextoImutavelError extends ErroDominio {
  constructor(campo: string) {
    super(
      `DecisaoWorkflow: "${campo}" já registrado com valor divergente — reentrega de evento com payload diferente do original`,
    );
  }
}

export class ContextoIncompletoError extends ErroDominio {
  constructor(camposAusentes: readonly string[]) {
    super(`DecisaoWorkflow: contexto incompleto, aguardando: ${camposAusentes.join(', ')}`);
  }
}

export class TransicaoInvalidaDecisaoWorkflowError extends ErroDominio {
  constructor(statusAtual: StatusDecisaoWorkflow, acao: string) {
    super(`Transição inválida: "${acao}" a partir do status ${statusAtual}`);
  }
}

/** Resultado reportado pelo `AgenteOrquestradorGateway` — ainda não é uma `DecisaoRoteamento` válida (depende do limiar de confiança ser atingido). */
export interface ResultadoOrquestrador {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: NivelConfianca;
  readonly criterio: string;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
}

/** Decisão humana explícita registrada a partir de `PENDENTE_REVISAO_HUMANA` — nunca exige `nivelConfianca`. */
export interface DecisaoHumanaInput {
  readonly acao: AcaoRoteamento;
  readonly criterio: string;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
}

export interface DecisaoWorkflowProps {
  readonly orcamentoId: OrcamentoId;
  readonly contextoClassificacao?: ContextoClassificacao;
  readonly contextoExtracao?: ContextoExtracao;
  readonly contextoValidacao?: ContextoValidacao;
  readonly status: StatusDecisaoWorkflow;
  readonly decisaoAtual?: DecisaoRoteamento;
  readonly historico: readonly TentativaDecisaoWorkflow[];
}

/**
 * Agregado raiz do BC Orquestração (plan.md). Identidade correlata a
 * `OrcamentoId` (mesmo valor gerado pela Ingestão, spec 001) — este BC nunca
 * gera um novo identificador, apenas reutiliza.
 *
 * Consolida os 3 contextos upstream (classificação/extração/validação) antes
 * de qualquer decisão — nunca decide com contexto parcial (`consolidarContexto`
 * lança `ContextoIncompletoError`, tratado pela Application como sinal de
 * reprocessamento, ver ADR-001 do plan.md). Reentrega de evento com payload
 * divergente do já registrado lança `ContextoImutavelError` — cada contexto é
 * imutável uma vez preenchido, reaplicar o mesmo evento é idempotente.
 *
 * Nenhuma decisão de aprovação é tomada sem confiança suficiente reportada
 * pelo Orquestrador (`nivelConfianca >= LIMIAR_CONFIANCA`) ou sem decisão
 * humana explícita a partir de `PENDENTE_REVISAO_HUMANA` — nunca por
 * exaustão/tempo/volume (Princípio IV, NON-NEGOTIABLE).
 */
export class DecisaoWorkflow {
  private _contextoClassificacao: ContextoClassificacao | undefined;
  private _contextoExtracao: ContextoExtracao | undefined;
  private _contextoValidacao: ContextoValidacao | undefined;
  private _status: StatusDecisaoWorkflow;
  private _decisaoAtual: DecisaoRoteamento | undefined;
  private readonly _historico: TentativaDecisaoWorkflow[];

  private constructor(
    readonly orcamentoId: OrcamentoId,
    props: DecisaoWorkflowProps,
  ) {
    this._contextoClassificacao = props.contextoClassificacao;
    this._contextoExtracao = props.contextoExtracao;
    this._contextoValidacao = props.contextoValidacao;
    this._status = props.status;
    this._decisaoAtual = props.decisaoAtual;
    this._historico = [...props.historico];
  }

  /** Cria o agregado no momento em que o primeiro dos 3 eventos upstream chega. */
  static criar(orcamentoId: OrcamentoId): DecisaoWorkflow {
    return new DecisaoWorkflow(orcamentoId, {
      orcamentoId,
      status: 'AGUARDANDO_CONTEXTO',
      historico: [],
    });
  }

  /** Reidrata o agregado a partir de estado persistido (Infrastructure). */
  static reconstituir(props: DecisaoWorkflowProps): DecisaoWorkflow {
    return new DecisaoWorkflow(props.orcamentoId, props);
  }

  get contextoClassificacao(): ContextoClassificacao | undefined {
    return this._contextoClassificacao;
  }

  get contextoExtracao(): ContextoExtracao | undefined {
    return this._contextoExtracao;
  }

  get contextoValidacao(): ContextoValidacao | undefined {
    return this._contextoValidacao;
  }

  get status(): StatusDecisaoWorkflow {
    return this._status;
  }

  get decisaoAtual(): DecisaoRoteamento | undefined {
    return this._decisaoAtual;
  }

  /** Histórico append-only — cópia defensiva, nunca expõe o array mutável interno. */
  get historico(): readonly TentativaDecisaoWorkflow[] {
    return [...this._historico];
  }

  /** Idempotente: reaplicar o mesmo contexto não duplica nem sobrescreve; nunca dispara decisão por si só. */
  registrarContextoClassificacao(contexto: ContextoClassificacao): void {
    if (this._contextoClassificacao && !this._contextoClassificacao.equals(contexto)) {
      throw new ContextoImutavelError('contextoClassificacao');
    }
    this._contextoClassificacao = contexto;
  }

  /** Idempotente: reaplicar o mesmo contexto não duplica nem sobrescreve; nunca dispara decisão por si só. */
  registrarContextoExtracao(contexto: ContextoExtracao): void {
    if (this._contextoExtracao && !this._contextoExtracao.equals(contexto)) {
      throw new ContextoImutavelError('contextoExtracao');
    }
    this._contextoExtracao = contexto;
  }

  /** Idempotente: reaplicar o mesmo contexto não duplica nem sobrescreve; nunca dispara decisão por si só. */
  registrarContextoValidacao(contexto: ContextoValidacao): void {
    if (this._contextoValidacao && !this._contextoValidacao.equals(contexto)) {
      throw new ContextoImutavelError('contextoValidacao');
    }
    this._contextoValidacao = contexto;
  }

  /**
   * Só transita para `CONTEXTO_CONSOLIDADO` quando os 3 contextos estão
   * presentes; caso contrário permanece `AGUARDANDO_CONTEXTO` e lança
   * `ContextoIncompletoError` — nunca uma decisão parcial (ADR-001).
   */
  consolidarContexto(): void {
    const camposAusentes: string[] = [];
    if (!this._contextoClassificacao) camposAusentes.push('contextoClassificacao');
    if (!this._contextoExtracao) camposAusentes.push('contextoExtracao');
    if (!this._contextoValidacao) camposAusentes.push('contextoValidacao');

    if (camposAusentes.length > 0) {
      throw new ContextoIncompletoError(camposAusentes);
    }

    this._status = 'CONTEXTO_CONSOLIDADO';
  }

  /**
   * Só pode ser chamado a partir de `CONTEXTO_CONSOLIDADO`. Confiança abaixo
   * de `LIMIAR_CONFIANCA` transita direto para `PENDENTE_REVISAO_HUMANA`
   * (escalonamento ao comprador, sem segundo agente de IA), nunca decide.
   * Confiança suficiente aplica as invariantes de `DecisaoRoteamento.criar`
   * (nunca aprovar sem validação bem-sucedida, nunca reenvio sem fundamento,
   * nunca decisão automática sem critério auditável) e transita para
   * `DECIDIDO`. Se `DecisaoRoteamento.criar` lançar, nenhuma mutação de
   * estado ocorre — a validação acontece antes de qualquer atribuição.
   */
  registrarTentativaOrquestrador(resultado: ResultadoOrquestrador): void {
    if (this._status !== 'CONTEXTO_CONSOLIDADO') {
      throw new TransicaoInvalidaDecisaoWorkflowError(
        this._status,
        'registrarTentativaOrquestrador',
      );
    }

    if (!resultado.nivelConfianca.atingeLimiar(LIMIAR_CONFIANCA)) {
      this._historico.push(
        TentativaDecisaoWorkflow.de({
          agente: 'ORQUESTRADOR',
          timestamp: new Date(),
          motivoInsucesso: `nivelConfianca ${resultado.nivelConfianca.valor} abaixo do limiar ${LIMIAR_CONFIANCA}`,
        }),
      );
      this._status = 'PENDENTE_REVISAO_HUMANA';
      return;
    }

    const decisao = DecisaoRoteamento.criar({
      acao: resultado.acao,
      nivelConfianca: resultado.nivelConfianca,
      criterio: resultado.criterio,
      agenteOrigem: 'ORQUESTRADOR',
      requerIntegracaoExterna: resultado.requerIntegracaoExterna,
      motivoDadoAusente: resultado.motivoDadoAusente,
      contextoValidacao: this._contextoValidacao,
    });

    this._historico.push(
      TentativaDecisaoWorkflow.de({
        agente: 'ORQUESTRADOR',
        timestamp: new Date(),
        resultado: decisao,
      }),
    );
    this._decisaoAtual = decisao;
    this._status = 'DECIDIDO';
  }

  /**
   * Só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`; humano pode
   * escolher qualquer uma das 3 ações sem exigência de `nivelConfianca`, mas
   * `criterio` (justificativa) ainda MUST ser não vazia — mesma regra de
   * fundamento obrigatório para `SOLICITAR_REENVIO`. Nunca apaga `historico`,
   * apenas anexa.
   */
  registrarDecisaoHumana(decisao: DecisaoHumanaInput): void {
    if (this._status !== 'PENDENTE_REVISAO_HUMANA') {
      throw new TransicaoInvalidaDecisaoWorkflowError(this._status, 'registrarDecisaoHumana');
    }

    const decisaoRoteamento = DecisaoRoteamento.criar({
      acao: decisao.acao,
      nivelConfianca: null,
      criterio: decisao.criterio,
      agenteOrigem: 'HUMANO' satisfies AgenteOrigemDecisao,
      requerIntegracaoExterna: decisao.requerIntegracaoExterna,
      motivoDadoAusente: decisao.motivoDadoAusente,
      contextoValidacao: this._contextoValidacao,
    });

    this._historico.push(
      TentativaDecisaoWorkflow.de({
        agente: 'HUMANO',
        timestamp: new Date(),
        resultado: decisaoRoteamento,
      }),
    );
    this._decisaoAtual = decisaoRoteamento;
    this._status = 'DECIDIDO';
  }
}
