import { ErroDominio } from '../errors/erro-dominio.js';
import type { ContextoValidacao } from './contexto-validacao.vo.js';
import type { NivelConfianca } from './nivel-confianca.vo.js';

export const ACOES_ROTEAMENTO = ['APROVAR', 'ENCAMINHAR_COMPRADOR', 'SOLICITAR_REENVIO'] as const;
export type AcaoRoteamento = (typeof ACOES_ROTEAMENTO)[number];

export const AGENTES_ORIGEM_DECISAO = ['ORQUESTRADOR', 'HUMANO'] as const;
export type AgenteOrigemDecisao = (typeof AGENTES_ORIGEM_DECISAO)[number];

export class AprovacaoSemValidacaoError extends ErroDominio {
  constructor() {
    super(
      'Decisão de APROVAR exige contextoValidacao com resultado VALIDADO ou VALIDADO_COM_RESSALVA',
    );
  }
}

export class ReenvioSemFundamentoError extends ErroDominio {
  constructor() {
    super(
      'Decisão de SOLICITAR_REENVIO exige motivoDadoAusente não vazio, referenciando inconsistência/pendência concreta',
    );
  }
}

export class CriterioAusenteError extends ErroDominio {
  constructor() {
    super('Decisão automática (agenteOrigem !== HUMANO) exige criterio não vazio');
  }
}

export interface CriarDecisaoRoteamentoInput {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: NivelConfianca | null;
  readonly criterio: string;
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
  /**
   * Não persistido no VO (ver Value Objects, plan.md — campos de
   * `DecisaoRoteamento` não incluem `contextoValidacao`); usado apenas para
   * validar a invariante "nunca aprovar sem validação bem-sucedida" no
   * momento da construção.
   */
  readonly contextoValidacao?: ContextoValidacao;
}

const RESULTADOS_VALIDACAO_APROVAVEIS = new Set(['VALIDADO', 'VALIDADO_COM_RESSALVA']);

/**
 * VO mais crítico da spec 005: nenhuma instância inválida é representável.
 * Estruturalmente impede aprovação sem validação bem-sucedida, reenvio sem
 * fundamento e decisão automática sem critério auditável.
 */
export class DecisaoRoteamento {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: NivelConfianca | null;
  readonly criterio: string;
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;

  private constructor(input: CriarDecisaoRoteamentoInput) {
    this.acao = input.acao;
    this.nivelConfianca = input.nivelConfianca;
    this.criterio = input.criterio;
    this.agenteOrigem = input.agenteOrigem;
    this.requerIntegracaoExterna = input.requerIntegracaoExterna;
    this.motivoDadoAusente = input.motivoDadoAusente;
  }

  static criar(input: CriarDecisaoRoteamentoInput): DecisaoRoteamento {
    if (
      input.acao === 'APROVAR' &&
      !(
        input.contextoValidacao &&
        RESULTADOS_VALIDACAO_APROVAVEIS.has(input.contextoValidacao.resultado)
      )
    ) {
      throw new AprovacaoSemValidacaoError();
    }

    if (input.acao === 'SOLICITAR_REENVIO' && !input.motivoDadoAusente?.trim()) {
      throw new ReenvioSemFundamentoError();
    }

    if (input.agenteOrigem !== 'HUMANO' && !input.criterio?.trim()) {
      throw new CriterioAusenteError();
    }

    return new DecisaoRoteamento(input);
  }

  /**
   * Reidrata uma `DecisaoRoteamento` a partir de estado persistido
   * (Infrastructure), sem revalidar as invariantes de negócio — dado já
   * persistido já as satisfez no momento em que `criar` foi chamado. Nunca
   * usar no caminho de decisão (Application), só em leitura/reconstituição
   * de agregado (evita que uma mudança futura nas regras de `criar` quebre
   * a releitura de decisão histórica que já era válida quando tomada).
   */
  static reconstituir(
    input: Omit<CriarDecisaoRoteamentoInput, 'contextoValidacao'>,
  ): DecisaoRoteamento {
    return new DecisaoRoteamento(input);
  }
}
