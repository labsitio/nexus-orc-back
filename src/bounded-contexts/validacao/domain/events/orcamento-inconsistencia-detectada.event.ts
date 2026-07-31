import type { InconsistenciaDetectadaPayload } from '../value-objects/inconsistencia-detectada.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoInconsistenciaDetectadaPayload extends DomainEventEnvelope {
  readonly inconsistencias: readonly InconsistenciaDetectadaPayload[];
}

/**
 * Publicado quando 1+ regra determinística falha (primeira tentativa ou
 * reavaliação pós-correção que ainda falha). `inconsistencias` reflete
 * sempre a tentativa atual — nunca acumulado de tentativas anteriores.
 * Diferente dos equivalentes de 001/002, é publicado publicamente desde a
 * primeira falha (não há camada de IA revisora interna, ADR-001) — é o
 * evento consumido por Acompanhamento para exibir "pendente de validação
 * (inconsistência)".
 */
export class OrcamentoInconsistenciaDetectada implements OrcamentoInconsistenciaDetectadaPayload {
  static readonly detailType = 'OrcamentoInconsistenciaDetectada' as const;
  readonly detailType = OrcamentoInconsistenciaDetectada.detailType;
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
