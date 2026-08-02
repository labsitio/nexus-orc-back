/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção Domain Events).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) =
 * `nexo.busca-indexacao`. Não existe aqui um evento interno-only de "baixa
 * confiança" (diferente de 001–003): `FalhaIndexacaoDetectada` é diretamente
 * público desde a primeira falha, pois a exceção é técnica/operacional, sem
 * segunda camada de IA/humano a acionar antes (ADR-002).
 *
 * **Amendment ADR-005 (retrofit, T013b)**: `schemaVersion` sobe para `2` e
 * `tenantId` passa a ser obrigatório no payload — mesma convenção de
 * amendment já aplicada pela spec 007 aos eventos da spec 001 (ADR-005
 * daquela spec).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 2;
  readonly orcamentoId: string;
  readonly tenantId: string;
  readonly ocorreuEm: string;
}
