import type { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import { ErroDominio } from './errors/erro-dominio.js';
import type { DadosExtraidosParaValidacao } from './value-objects/dados-extraidos-para-validacao.vo.js';
import type { InconsistenciaDetectada } from './value-objects/inconsistencia-detectada.vo.js';
import type { OrcamentoId } from './value-objects/orcamento-id.vo.js';
import { TentativaValidacao } from './value-objects/tentativa-validacao.vo.js';

export const STATUS_VALIDACAO = [
  'PENDENTE',
  'VALIDADO',
  'PENDENTE_REVISAO_HUMANA',
  'VALIDADO_COM_RESSALVA',
] as const;
export type StatusValidacao = (typeof STATUS_VALIDACAO)[number];

export class DadosExtraidosImutavelError extends ErroDominio {
  constructor(campo: string) {
    super(`"${campo}" não pode ser sobrescrito após a criação de OrcamentoValidacao`);
  }
}

export class TransicaoInvalidaValidacaoError extends ErroDominio {
  constructor(statusAtual: StatusValidacao, acao: string) {
    super(`Transição inválida: "${acao}" a partir do status ${statusAtual}`);
  }
}

/**
 * (issue #649) `tenantId` é imutável fora do construtor de criação — mesmo
 * padrão de `TenantIdImutavelError` do BC Extração
 * (`extracao-orcamento.aggregate.ts`, issue #648).
 */
export class TenantIdImutavelError extends ErroDominio {
  constructor() {
    super('tenantId não pode ser sobrescrito após a criação de OrcamentoValidacao');
  }
}

/**
 * Decisão humana registrada a partir de `PENDENTE_REVISAO_HUMANA`.
 * `CORRECAO_APLICADA` reavalia as regras com as inconsistências
 * recalculadas pela Application sobre os dados corrigidos (nunca autoaprova
 * — se ainda houver inconsistência, permanece em revisão humana).
 * `ACEITE_COM_RESSALVA` é decisão terminal, aceita explicitamente apesar da(s)
 * inconsistência(s) remanescente(s).
 */
export type DecisaoHumanaValidacao =
  | {
      readonly tipo: 'CORRECAO_APLICADA';
      readonly inconsistencias: readonly InconsistenciaDetectada[];
      readonly justificativa?: string;
    }
  | { readonly tipo: 'ACEITE_COM_RESSALVA'; readonly justificativa?: string };

export interface OrcamentoValidacaoProps {
  readonly orcamentoId: OrcamentoId;
  readonly dadosExtraidos: DadosExtraidosParaValidacao;
  readonly status: StatusValidacao;
  readonly inconsistencias: readonly InconsistenciaDetectada[];
  readonly historico: readonly TentativaValidacao[];
  /**
   * (issue #649 — expand/contract, ADR-008) Opcional até a #632 tornar
   * `tenantId` obrigatório nos 4 BCs de uma vez. Vem do envelope
   * `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (spec 002),
   * que ainda publica `tenantId` opcional.
   */
  readonly tenantId?: TenantId;
}

/**
 * Agregado raiz do BC Validação — 1:1 com o `orcamentoId` da Ingestão,
 * própria identidade correlata (mesmo padrão de duplicação aceito na
 * spec 002). Nunca decide sozinho aceitar campo com pendência confirmada
 * pela Extração: cada BC responde sua própria pergunta de negócio.
 */
export class OrcamentoValidacao {
  private readonly _orcamentoId: OrcamentoId;
  private readonly _dadosExtraidos: DadosExtraidosParaValidacao;
  private _status: StatusValidacao;
  private _inconsistencias: readonly InconsistenciaDetectada[];
  private readonly _historico: TentativaValidacao[];
  private readonly _tenantId: TenantId | undefined;

  private constructor(props: OrcamentoValidacaoProps) {
    this._orcamentoId = props.orcamentoId;
    this._dadosExtraidos = props.dadosExtraidos;
    this._status = props.status;
    this._inconsistencias = [...props.inconsistencias];
    this._historico = [...props.historico];
    this._tenantId = props.tenantId;
  }

  /** Cria o agregado no momento em que `OrcamentoExtraido` é traduzido pelo ACL. */
  static criar(
    orcamentoId: OrcamentoId,
    dadosExtraidos: DadosExtraidosParaValidacao,
    tenantId?: TenantId,
  ): OrcamentoValidacao {
    return new OrcamentoValidacao({
      orcamentoId,
      dadosExtraidos,
      status: 'PENDENTE',
      inconsistencias: [],
      historico: [],
      tenantId,
    });
  }

  /** Reconstrói o agregado a partir de estado persistido (uso do repositório). */
  static reconstituir(props: OrcamentoValidacaoProps): OrcamentoValidacao {
    return new OrcamentoValidacao(props);
  }

  get orcamentoId(): OrcamentoId {
    return this._orcamentoId;
  }

  get dadosExtraidos(): DadosExtraidosParaValidacao {
    return this._dadosExtraidos;
  }

  get status(): StatusValidacao {
    return this._status;
  }

  get inconsistencias(): readonly InconsistenciaDetectada[] {
    return [...this._inconsistencias];
  }

  get historico(): readonly TentativaValidacao[] {
    return [...this._historico];
  }

  /**
   * (issue #649 — expand/contract) `undefined` até a #632 tornar a ausência
   * impossível nos 4 BCs de uma vez.
   */
  get tenantId(): TenantId | undefined {
    return this._tenantId;
  }

  /** `dadosExtraidos` nunca é sobrescrito — correção passa por `registrarDecisaoHumana`. */
  atualizarDadosExtraidos(): never {
    throw new DadosExtraidosImutavelError('dadosExtraidos');
  }

  /** `tenantId` é imutável fora do construtor de criação — nunca há via legítima de atualização. */
  atualizarTenantId(): never {
    throw new TenantIdImutavelError();
  }

  /**
   * Avalia o resultado das 4 regras determinísticas de consistência (T010).
   * Só válida a partir de `PENDENTE` — nunca existe uma segunda tentativa
   * automática (ADR-001); a única forma de reavaliar após inconsistência é
   * `registrarDecisaoHumana`. Todas as regras passando → `VALIDADO`; 1+
   * regra falhando → `PENDENTE_REVISAO_HUMANA` direto, nunca parcialmente.
   */
  avaliarRegrasDeConsistencia(inconsistencias: readonly InconsistenciaDetectada[]): void {
    if (this._status !== 'PENDENTE') {
      throw new TransicaoInvalidaValidacaoError(this._status, 'avaliarRegrasDeConsistencia');
    }
    this.aplicarResultadoAvaliacao(inconsistencias);
  }

  /**
   * Só válida a partir de `PENDENTE_REVISAO_HUMANA`. Nunca apaga `historico`,
   * apenas anexa — decisão humana é sempre auditável.
   */
  registrarDecisaoHumana(decisao: DecisaoHumanaValidacao): void {
    if (this._status !== 'PENDENTE_REVISAO_HUMANA') {
      throw new TransicaoInvalidaValidacaoError(this._status, 'registrarDecisaoHumana');
    }

    if (decisao.tipo === 'CORRECAO_APLICADA') {
      this.aplicarResultadoAvaliacao(decisao.inconsistencias, decisao.justificativa);
      return;
    }

    this._historico.push(
      TentativaValidacao.de(
        'ACEITE_COM_RESSALVA',
        this._inconsistencias,
        new Date(),
        decisao.justificativa,
      ),
    );
    this._status = 'VALIDADO_COM_RESSALVA';
  }

  private aplicarResultadoAvaliacao(
    inconsistencias: readonly InconsistenciaDetectada[],
    justificativa?: string,
  ): void {
    this._inconsistencias = [...inconsistencias];

    if (inconsistencias.length === 0) {
      this._historico.push(TentativaValidacao.de('VALIDADO', [], new Date(), justificativa));
      this._status = 'VALIDADO';
      return;
    }

    this._historico.push(
      TentativaValidacao.de('INCONSISTENTE', inconsistencias, new Date(), justificativa),
    );
    this._status = 'PENDENTE_REVISAO_HUMANA';
  }
}
