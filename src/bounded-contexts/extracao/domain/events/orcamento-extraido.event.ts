import type { CondicoesComerciaisPayload } from '../value-objects/condicoes-comerciais.vo.js';
import type { ItemOrcamentoPayload } from '../value-objects/item-orcamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoExtraidoPayload extends DomainEventEnvelope {
  readonly itens: readonly ItemOrcamentoPayload[];
  readonly condicoesComerciais: CondicoesComerciaisPayload;
}

/**
 * Publicado quando `ExtracaoOrcamento` transita para `EXTRAIDO` — Extrator
 * (todos os campos obrigatórios OK) ou confirmação humana com valor real.
 * Consumido pelo futuro BC Validação (spec 003) e por Acompanhamento.
 */
export class OrcamentoExtraido implements OrcamentoExtraidoPayload {
  static readonly detailType = 'OrcamentoExtraido' as const;
  readonly detailType = OrcamentoExtraido.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly itens: readonly ItemOrcamentoPayload[],
    readonly condicoesComerciais: CondicoesComerciaisPayload,
    readonly tenantId?: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
