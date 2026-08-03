import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoIndexadoPayload extends DomainEventEnvelope {
  readonly modeloEmbedding: string;
}

/**
 * Publicado quando `IndiceOrcamento` transita para `INDEXADO` (primeira
 * tentativa ou retentativa bem-sucedida) — plan.md, seção Domain Events.
 * `modeloEmbedding` confirma qual modelo gerou o vetor persistido. Consumido
 * por Acompanhamento para rastreabilidade (Princípio I); nenhum consumidor
 * de decisão de negócio declarado nas specs conhecidas.
 */
export class OrcamentoIndexado implements OrcamentoIndexadoPayload {
  static readonly detailType = 'OrcamentoIndexado' as const;
  readonly detailType = OrcamentoIndexado.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly tenantId: string,
    readonly modeloEmbedding: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
