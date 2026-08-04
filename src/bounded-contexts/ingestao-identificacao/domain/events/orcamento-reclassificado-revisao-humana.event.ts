import type { ResultadoClassificacaoPayload } from '../value-objects/resultado-classificacao.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoReclassificadoPorRevisaoHumanaPayload extends DomainEventEnvelope {
  readonly resultado: ResultadoClassificacaoPayload;
}

/**
 * Publicado após confirmação humana explícita via API — reaproveita o shape
 * de `OrcamentoClassificado` com `agenteOrigem: 'HUMANO'`; é o próprio evento
 * de auditoria da correção manual (plan.md).
 */
export class OrcamentoReclassificadoPorRevisaoHumana implements OrcamentoReclassificadoPorRevisaoHumanaPayload {
  static readonly detailType = 'OrcamentoReclassificadoPorRevisaoHumana' as const;
  readonly detailType = OrcamentoReclassificadoPorRevisaoHumana.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly resultado: ResultadoClassificacaoPayload,
    readonly tenantId: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
