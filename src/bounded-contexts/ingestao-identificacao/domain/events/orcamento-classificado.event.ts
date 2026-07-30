import type { ResultadoClassificacaoPayload } from "../value-objects/resultado-classificacao.vo.js";
import type { DomainEventEnvelope } from "./domain-event.js";

export interface OrcamentoClassificadoPayload extends DomainEventEnvelope {
  readonly resultado: ResultadoClassificacaoPayload;
}

/**
 * Publicado quando o Classificador atinge confiança >= 80% (`agenteOrigem: 'CLASSIFICADOR'`).
 * Único evento que o futuro BC Extração (spec 002) precisa assinar.
 */
export class OrcamentoClassificado implements OrcamentoClassificadoPayload {
  static readonly detailType = "OrcamentoClassificado" as const;
  readonly detailType = OrcamentoClassificado.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly resultado: ResultadoClassificacaoPayload,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
