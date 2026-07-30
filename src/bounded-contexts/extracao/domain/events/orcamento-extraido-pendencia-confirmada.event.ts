import type { CondicoesComerciaisPayload } from '../value-objects/condicoes-comerciais.vo.js';
import type { ItemOrcamentoPayload } from '../value-objects/item-orcamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoExtraidoComPendenciaConfirmadaPayload extends DomainEventEnvelope {
  readonly itens: readonly ItemOrcamentoPayload[];
  readonly condicoesComerciais: CondicoesComerciaisPayload;
}

/**
 * Publicado quando humano confirma explicitamente que 1+ campo obrigatório
 * não está disponível no documento — decisão definitiva, não é falha
 * silenciosa (Princípio IV satisfeito por decisão humana explícita e
 * auditável). Campos pendentes permanecem `extraido: false`/`valor: null`.
 */
export class OrcamentoExtraidoComPendenciaConfirmada implements OrcamentoExtraidoComPendenciaConfirmadaPayload {
  static readonly detailType = 'OrcamentoExtraidoComPendenciaConfirmada' as const;
  readonly detailType = OrcamentoExtraidoComPendenciaConfirmada.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly itens: readonly ItemOrcamentoPayload[],
    readonly condicoesComerciais: CondicoesComerciaisPayload,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
