/**
 * Contrato comum a todo Domain Event deste BC (plan.md, convenção herdada).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.extracao`.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  /**
   * Tenant dono do orçamento (spec-007, T040 — expand/contract).
   * Opcional e `schemaVersion` mantido em `1` de propósito: os sites de
   * emissão deste BC ainda não preenchem este campo. Uma PR de contract
   * futura torna `tenantId` obrigatório e sobe `schemaVersion` para `2`
   * nos 4 BCs de uma vez (ADR-008 — cutover único, sem suporte dual v1/v2
   * publicado).
   */
  readonly tenantId?: string;
}
