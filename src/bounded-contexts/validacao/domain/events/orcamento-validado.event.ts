import type { DomainEventEnvelope } from './domain-event.js';

export type OrcamentoValidadoPayload = DomainEventEnvelope;

/**
 * Publicado quando `OrcamentoValidacao` transita para `VALIDADO` (primeira
 * tentativa ou após correção humana). Consumido pelo futuro BC Orquestração
 * (005) e por Acompanhamento.
 */
export class OrcamentoValidado implements OrcamentoValidadoPayload {
  static readonly detailType = 'OrcamentoValidado' as const;
  readonly detailType = OrcamentoValidado.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
