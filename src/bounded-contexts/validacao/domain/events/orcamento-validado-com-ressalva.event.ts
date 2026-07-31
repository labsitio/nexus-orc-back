import type { InconsistenciaDetectadaPayload } from '../value-objects/inconsistencia-detectada.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoValidadoComRessalvaPayload extends DomainEventEnvelope {
  readonly inconsistencias: readonly InconsistenciaDetectadaPayload[];
}

/**
 * Publicado quando humano decide `ACEITE_COM_RESSALVA` — decisão definitiva,
 * não é falha silenciosa (Princípio IV satisfeito por decisão humana
 * explícita e auditável, mesmo padrão de `OrcamentoExtraidoComPendenciaConfirmada`
 * da spec 002). `inconsistencias` lista as inconsistências aceitas com ressalva.
 */
export class OrcamentoValidadoComRessalva implements OrcamentoValidadoComRessalvaPayload {
  static readonly detailType = 'OrcamentoValidadoComRessalva' as const;
  readonly detailType = OrcamentoValidadoComRessalva.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly inconsistencias: readonly InconsistenciaDetectadaPayload[],
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
