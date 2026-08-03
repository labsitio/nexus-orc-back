import type { InconsistenciaDetectadaPayload } from '../value-objects/inconsistencia-detectada.vo.js';
import type { ItemParaValidacaoPayload } from '../value-objects/item-para-validacao.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoValidadoComRessalvaPayload extends DomainEventEnvelope {
  readonly inconsistencias: readonly InconsistenciaDetectadaPayload[];
  readonly itens: readonly ItemParaValidacaoPayload[];
  readonly condicoesComerciais: string;
}

/**
 * Publicado quando humano decide `ACEITE_COM_RESSALVA` — decisão definitiva,
 * não é falha silenciosa (Princípio IV satisfeito por decisão humana
 * explícita e auditável, mesmo padrão de `OrcamentoExtraidoComPendenciaConfirmada`
 * da spec 002). `inconsistencias` lista as inconsistências aceitas com ressalva.
 *
 * **Amendment ADR-003 (spec 004, T006)**: `itens`/`condicoesComerciais`
 * passam a compor o payload — mesmo racional de `OrcamentoValidado` (ADR-004
 * da spec 004: `VALIDADO_COM_RESSALVA` é elegível para indexação, nunca
 * "menos válido"). `schemaVersion` sobe para `2`.
 */
export class OrcamentoValidadoComRessalva implements OrcamentoValidadoComRessalvaPayload {
  static readonly detailType = 'OrcamentoValidadoComRessalva' as const;
  readonly detailType = OrcamentoValidadoComRessalva.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly inconsistencias: readonly InconsistenciaDetectadaPayload[],
    readonly itens: readonly ItemParaValidacaoPayload[],
    readonly condicoesComerciais: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
