/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção "Domain Events").
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) =
 * `nexo.orquestracao`. Orquestração é customer simultâneo de 3 suppliers
 * (Ingestão/Extração/Validação) mas publica apenas os desfechos de decisão
 * de workflow definidos nesta spec — nunca reexporta tipo de evento upstream.
 *
 * **Amendment (spec-007, T044 — expand/contract)**: `tenantId` é extraído dos
 * 3 eventos upstream (001/002/003, já v2 após T040/T041). Opcional e
 * `schemaVersion` mantido em 1 de propósito: os sites de emissão deste BC
 * ainda não preenchem o campo (wiring é escopo de outra issue). Uma PR de
 * contract futura torna `tenantId` obrigatório (ADR-008 — cutover único,
 * sem suporte dual publicado).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  readonly tenantId?: string;
}
