/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção "Domain Events").
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) =
 * `nexo.orquestracao`. Orquestração é customer simultâneo de 3 suppliers
 * (Ingestão/Extração/Validação) mas publica apenas os desfechos de decisão
 * de workflow definidos nesta spec — nunca reexporta tipo de evento upstream.
 *
 * **Amendment (spec-007, ADR-008 — cutover de contract, #632)**: `tenantId`
 * é extraído dos 3 eventos upstream (001/002/003, já v2) e consolidado pelo
 * agregado `DecisaoWorkflow`. Obrigatório desde `schemaVersion: 2`: cutover
 * único, sem suporte dual v1/v2 publicado (baseline de zero tenant real em
 * produção e zero Lambda implantada, #587/#297).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 2;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  readonly tenantId: string;
}
