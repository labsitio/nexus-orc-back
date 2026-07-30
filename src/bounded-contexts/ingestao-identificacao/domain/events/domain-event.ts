/**
 * Contrato comum a todo Domain Event deste BC (plan.md, convenção 3).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.ingestao-identificacao`.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
}
