/**
 * Contrato comum a todo Domain Event do componente de plataforma Conformidade
 * (plan.md, seção Domain Events). `detailType` = nome do evento no
 * EventBridge; `source` (fixo em Infra) = `nexo.conformidade` para os
 * publicados pelo processo de coordenação, `nexo.<bc-slug>` para os
 * publicados por cada Bounded Context (ex.: `DadoPessoalAnonimizadoNoContexto`,
 * `RetencaoAplicadaNoContexto`).
 *
 * Sem `orcamentoId` obrigatório: ao contrário dos eventos de um BC de
 * negócio, nem todo evento de Conformidade se refere a um único orçamento
 * (ex.: `SolicitacaoEsquecimentoRegistrada` é escopado por `titularReferencia`,
 * que pode abranger múltiplos orçamentos em múltiplos contextos).
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1;
  readonly ocorreuEm: string;
}
