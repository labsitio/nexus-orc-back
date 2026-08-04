/**
 * Contrato comum a todo Domain Event deste BC (plan.md, convenção herdada).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.extracao`.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 2;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  /**
   * Tenant dono do orçamento (spec-007, ADR-008 — cutover de contract, #632).
   * Obrigatório desde `schemaVersion: 2`: cutover único, sem suporte dual
   * v1/v2 publicado (baseline de zero tenant real em produção e zero Lambda
   * implantada, #587/#297).
   */
  readonly tenantId: string;
}
