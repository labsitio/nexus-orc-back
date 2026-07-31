/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção Domain Events).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.validacao`.
 * Diferente de 001/002, os 3 eventos deste BC são todos contratos externos
 * estáveis — não há evento "interno" de baixa confiança, pois não existe
 * camada de IA revisora intermediária (ADR-001).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
}
