import type { AgenteOrigemDecisao } from '../value-objects/decisao-roteamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoEncaminhadoParaCompradorPayload extends DomainEventEnvelope {
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly criterio: string;
  /** `null` apenas quando `agenteOrigem === 'HUMANO'`. */
  readonly nivelConfianca: number | null;
}

/**
 * Publicado quando `acao === 'ENCAMINHAR_COMPRADOR'` é registrada com
 * confiança suficiente (Orquestrador) ou decisão humana explícita — nunca
 * confundir com `DecisaoWorkflowEscalonadaParaComprador`: este é um desfecho
 * decidido, não uma ausência de decisão (plan.md, "Domain Events").
 */
export class OrcamentoEncaminhadoParaComprador implements OrcamentoEncaminhadoParaCompradorPayload {
  static readonly detailType = 'OrcamentoEncaminhadoParaComprador' as const;
  readonly detailType = OrcamentoEncaminhadoParaComprador.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly agenteOrigem: AgenteOrigemDecisao,
    readonly criterio: string,
    readonly nivelConfianca: number | null,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
