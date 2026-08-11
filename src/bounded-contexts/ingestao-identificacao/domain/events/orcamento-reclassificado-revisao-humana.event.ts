import type { ResultadoClassificacaoPayload } from '../value-objects/resultado-classificacao.vo.js';
import type { ReferenciaS3Params } from '../value-objects/referencia-s3.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoReclassificadoPorRevisaoHumanaPayload extends DomainEventEnvelope {
  readonly resultado: ResultadoClassificacaoPayload;
  readonly referenciaBruta: ReferenciaS3Params;
}

/**
 * Publicado após confirmação humana explícita via API — reaproveita o shape
 * de `OrcamentoClassificado` com `agenteOrigem: 'HUMANO'`; é o próprio evento
 * de auditoria da correção manual (plan.md).
 *
 * `referenciaBruta` (ADR-003, `plan.md:122,125`): ponteiro S3 do documento
 * bruto, copiado do agregado `Orcamento` — mesmo campo que
 * `OrcamentoClassificado` já carrega, sempre fez parte do shape reaproveitado
 * (issue #744, escopo adicional). Mudança aditiva/compatível, `schemaVersion`
 * permanece `2` (convenção 7) — este evento nunca teve consumidor antes de
 * #744/#745, não há consumidor a quebrar.
 */
export class OrcamentoReclassificadoPorRevisaoHumana implements OrcamentoReclassificadoPorRevisaoHumanaPayload {
  static readonly detailType = 'OrcamentoReclassificadoPorRevisaoHumana' as const;
  readonly detailType = OrcamentoReclassificadoPorRevisaoHumana.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly resultado: ResultadoClassificacaoPayload,
    readonly referenciaBruta: ReferenciaS3Params,
    readonly tenantId: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
