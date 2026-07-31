import type { ResultadoClassificacaoPayload } from '../value-objects/resultado-classificacao.vo.js';
import type { ReferenciaS3Params } from '../value-objects/referencia-s3.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoClassificadoPayload extends DomainEventEnvelope {
  readonly resultado: ResultadoClassificacaoPayload;
  readonly referenciaBruta: ReferenciaS3Params;
}

/**
 * Publicado quando o Classificador atinge confiança >= 80% (`agenteOrigem: 'CLASSIFICADOR'`).
 * Único evento que o futuro BC Extração (spec 002) precisa assinar.
 *
 * `referenciaBruta` (ADR-003, `plan.md`): ponteiro S3 do documento bruto,
 * copiado do agregado `Orcamento` no momento da publicação — mudança
 * aditiva/compatível, `schemaVersion` permanece `1` (convenção 7). Extração
 * nunca consulta a Ingestão para obter esse ponteiro (Princípio II).
 */
export class OrcamentoClassificado implements OrcamentoClassificadoPayload {
  static readonly detailType = 'OrcamentoClassificado' as const;
  readonly detailType = OrcamentoClassificado.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly resultado: ResultadoClassificacaoPayload,
    readonly referenciaBruta: ReferenciaS3Params,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
