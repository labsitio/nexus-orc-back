/**
 * Contrato comum a todo Domain Event deste BC (plan.md, convenção 3).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.ingestao-identificacao`.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  /**
   * Prioridade de roteamento do evento (spec-009, ADR-009-003).
   * Ausente = comportamento padrão atual (retrocompatível): tratado como `PADRAO`.
   */
  readonly prioridade?: 'PADRAO' | 'LOTE_BAIXA_PRIORIDADE';
  /**
   * Tenant dono do orçamento (spec-007, T015 — expand/contract).
   * Opcional e `schemaVersion` mantido em `1` de propósito: as issues #279/#280/#281
   * ainda não preenchem este campo nos sites de emissão. Uma PR de contract futura
   * torna `tenantId` obrigatório e sobe `schemaVersion` para `2` nos 4 BCs de uma vez
   * (ADR-008 — cutover único, sem suporte dual v1/v2 publicado).
   */
  readonly tenantId?: string;
}
