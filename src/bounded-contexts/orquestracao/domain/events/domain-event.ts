/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção "Domain Events").
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) =
 * `nexo.orquestracao`. Orquestração é customer simultâneo de 3 suppliers
 * (Ingestão/Extração/Validação) mas publica apenas os desfechos de decisão
 * de workflow definidos nesta spec — nunca reexporta tipo de evento upstream.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
}
