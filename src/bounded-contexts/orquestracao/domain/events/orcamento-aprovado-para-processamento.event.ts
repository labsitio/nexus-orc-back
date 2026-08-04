import type { AgenteOrigemDecisao } from '../value-objects/decisao-roteamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoAprovadoParaProcessamentoPayload extends DomainEventEnvelope {
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly criterio: string;
  /** `null` apenas quando `agenteOrigem === 'HUMANO'` (decisão humana não exige confiança reportada). */
  readonly nivelConfianca: number | null;
}

/**
 * Publicado quando `DecisaoRoteamento.acao === 'APROVAR'` é registrada
 * (Orquestrador ou decisão humana — `agenteOrigem` distingue). Consumido
 * pelas etapas de negócio subsequentes (fora de escopo desta spec) e por
 * Acompanhamento (plan.md, "Domain Events").
 */
export class OrcamentoAprovadoParaProcessamento implements OrcamentoAprovadoParaProcessamentoPayload {
  static readonly detailType = 'OrcamentoAprovadoParaProcessamento' as const;
  readonly detailType = OrcamentoAprovadoParaProcessamento.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly agenteOrigem: AgenteOrigemDecisao,
    readonly criterio: string,
    readonly nivelConfianca: number | null,
    readonly tenantId: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
