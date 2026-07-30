import type { DomainEventEnvelope } from './domain-event.js';

export interface ExtracaoEscalonadaParaRevisaoHumanaPayload extends DomainEventEnvelope {
  readonly motivo: string;
}

/**
 * Publicado diretamente pelo caso de uso de extração (`ExtrairDadosOrcamento`)
 * quando o Extrator não atinge confiança suficiente em 1+ campo obrigatório —
 * sem agente revisor de IA (ADR-003). Alimenta a fila de escalonamento
 * humano própria deste BC.
 */
export class ExtracaoEscalonadaParaRevisaoHumana implements ExtracaoEscalonadaParaRevisaoHumanaPayload {
  static readonly detailType = 'ExtracaoEscalonadaParaRevisaoHumana' as const;
  readonly detailType = ExtracaoEscalonadaParaRevisaoHumana.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly motivo: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
