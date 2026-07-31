/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção Domain Events).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) =
 * `nexo.busca-indexacao`. Não existe aqui um evento interno-only de "baixa
 * confiança" (diferente de 001–003): `FalhaIndexacaoDetectada` é diretamente
 * público desde a primeira falha, pois a exceção é técnica/operacional, sem
 * segunda camada de IA/humano a acionar antes (ADR-002).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
}
