import type { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import { ErroDominio } from './errors/erro-dominio.js';
import type { Canal } from './value-objects/canal.vo.js';
import type { OrcamentoId } from './value-objects/orcamento-id.vo.js';
import type { ReferenciaS3 } from './value-objects/referencia-s3.vo.js';
import type { ResultadoClassificacao } from './value-objects/resultado-classificacao.vo.js';
import { TentativaClassificacao } from './value-objects/tentativa-classificacao.vo.js';

/** Limiar mínimo de confiança para aprovar classificação sem revisão humana (spec.md). */
export const LIMIAR_CONFIANCA = 80;

export const STATUS_ORCAMENTO = ['RECEBIDO', 'CLASSIFICADO', 'PENDENTE_REVISAO_HUMANA'] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

export class ReferenciaBrutaImutavelError extends ErroDominio {
  constructor() {
    super('referenciaBruta não pode ser sobrescrita após a criação do orçamento');
  }
}

export class TransicaoInvalidaError extends ErroDominio {
  constructor(statusAtual: StatusOrcamento, acao: string) {
    super(`Transição inválida: "${acao}" a partir do status ${statusAtual}`);
  }
}

/**
 * (spec 007, T014) `tenantId` é imutável fora do construtor de criação —
 * mesmo padrão de `TenantIdImutavelError` do BC Busca & Indexação
 * (`indice-orcamento.aggregate.ts`). Não existe setter nem método de
 * atualização legítimo: `atualizarTenantId` sempre lança.
 */
export class TenantIdImutavelError extends ErroDominio {
  constructor() {
    super('TenantIdImutavelError: tenantId não pode ser sobrescrito após a criação do orçamento');
  }
}

export interface OrcamentoProps {
  readonly id: OrcamentoId;
  readonly canal: Canal;
  readonly recebidoEm: Date;
  readonly referenciaBruta: ReferenciaS3;
  readonly referenciaExterna?: string;
  readonly status: StatusOrcamento;
  readonly resultadoAtual?: ResultadoClassificacao;
  readonly historico: readonly TentativaClassificacao[];
  /**
   * (spec 007, T014 — expand/contract) Opcional nesta PR: torná-lo
   * obrigatório aqui quebraria a compilação de todos os sites de construção
   * de `Orcamento` (#279, #280, #281), que ainda não preenchem o campo. Uma
   * PR de contrato futura torna `tenantId` obrigatório nos 4 BCs de uma vez
   * (título da issue #277) — ver ADR-008.
   */
  readonly tenantId?: TenantId;
}

export interface ReceberOrcamentoParams {
  readonly id: OrcamentoId;
  readonly canal: Canal;
  readonly referenciaBruta: ReferenciaS3;
  readonly recebidoEm?: Date;
  readonly referenciaExterna?: string;
  readonly tenantId?: TenantId;
}

/**
 * Agregado raiz do BC Ingestão & Identificação (escopo local — nunca contém
 * itens/preços/condições comerciais, isso pertence ao BC Extração, spec 002).
 */
export class Orcamento {
  private readonly _id: OrcamentoId;
  private readonly _canal: Canal;
  private readonly _recebidoEm: Date;
  private readonly _referenciaBruta: ReferenciaS3;
  private readonly _referenciaExterna: string | undefined;
  private _status: StatusOrcamento;
  private _resultadoAtual: ResultadoClassificacao | undefined;
  private readonly _historico: TentativaClassificacao[];
  private readonly _tenantId: TenantId | undefined;

  private constructor(props: OrcamentoProps) {
    this._id = props.id;
    this._canal = props.canal;
    this._recebidoEm = props.recebidoEm;
    this._referenciaBruta = props.referenciaBruta;
    this._referenciaExterna = props.referenciaExterna;
    this._status = props.status;
    this._resultadoAtual = props.resultadoAtual;
    this._historico = [...props.historico];
    this._tenantId = props.tenantId;
  }

  /** Cria o agregado no momento em que o Gateway de Ingestão recebe o arquivo bruto. */
  static receber(params: ReceberOrcamentoParams): Orcamento {
    return new Orcamento({
      id: params.id,
      canal: params.canal,
      recebidoEm: params.recebidoEm ?? new Date(),
      referenciaBruta: params.referenciaBruta,
      referenciaExterna: params.referenciaExterna,
      status: 'RECEBIDO',
      resultadoAtual: undefined,
      historico: [],
      tenantId: params.tenantId,
    });
  }

  /** Reconstrói o agregado a partir de estado persistido (uso do repositório). */
  static reconstituir(props: OrcamentoProps): Orcamento {
    return new Orcamento(props);
  }

  get id(): OrcamentoId {
    return this._id;
  }

  get canal(): Canal {
    return this._canal;
  }

  get recebidoEm(): Date {
    return this._recebidoEm;
  }

  get referenciaBruta(): ReferenciaS3 {
    return this._referenciaBruta;
  }

  get referenciaExterna(): string | undefined {
    return this._referenciaExterna;
  }

  get status(): StatusOrcamento {
    return this._status;
  }

  get resultadoAtual(): ResultadoClassificacao | undefined {
    return this._resultadoAtual;
  }

  get historico(): readonly TentativaClassificacao[] {
    return this._historico;
  }

  /**
   * (spec 007, T014 — expand/contract) `undefined` até #279/#280/#281
   * passarem a preencher o campo na construção; a PR de contrato torna a
   * ausência impossível nos 4 BCs de uma vez.
   */
  get tenantId(): TenantId | undefined {
    return this._tenantId;
  }

  /** Nenhum código deste contexto pode sobrescrever a referência ao dado bruto (Princípio III). */
  atualizarReferenciaBruta(): never {
    throw new ReferenciaBrutaImutavelError();
  }

  /** `tenantId` é imutável fora do construtor de criação — nunca há via legítima de atualização. */
  atualizarTenantId(_novoTenantId: TenantId): never {
    throw new TenantIdImutavelError();
  }

  /**
   * Registra o resultado do Agente Classificador. Confiança >= LIMIAR_CONFIANCA
   * aprova (`CLASSIFICADO`); abaixo disso escalona direto para revisão humana —
   * nunca há reprocessamento automático por IA (spec.md).
   */
  registrarTentativaClassificador(resultado: ResultadoClassificacao): void {
    if (this._status !== 'RECEBIDO') {
      throw new TransicaoInvalidaError(this._status, 'registrarTentativaClassificador');
    }
    this._historico.push(TentativaClassificacao.sucesso(resultado.agenteOrigem, resultado));
    this._resultadoAtual = resultado;
    this._status = resultado.nivelConfianca.atingeLimiar(LIMIAR_CONFIANCA)
      ? 'CLASSIFICADO'
      : 'PENDENTE_REVISAO_HUMANA';
  }

  /**
   * Confirmação humana explícita — só é transição válida a partir de
   * `PENDENTE_REVISAO_HUMANA`; nunca apaga histórico, apenas anexa.
   */
  registrarConfirmacaoHumana(resultado: ResultadoClassificacao): void {
    if (this._status !== 'PENDENTE_REVISAO_HUMANA') {
      throw new TransicaoInvalidaError(this._status, 'registrarConfirmacaoHumana');
    }
    this._historico.push(TentativaClassificacao.sucesso(resultado.agenteOrigem, resultado));
    this._resultadoAtual = resultado;
    this._status = 'CLASSIFICADO';
  }
}
