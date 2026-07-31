import type { DomainEventEnvelope } from './domain-event.js';

export interface SolicitacaoEsquecimentoConcluidaPayload extends DomainEventEnvelope {
  readonly solicitacaoId: string;
  readonly titularReferencia: string;
  readonly contextosConfirmados: readonly string[];
}

/**
 * Publicado pela Conformidade quando `confirmacoes` cobre 100% de
 * `contextosEsperados` dentro do `prazoLimite` (plan.md, Domain Events #3;
 * invariante do agregado `SolicitacaoEsquecimento`). `source =
 * nexo.conformidade`. Único evento de saída estável, junto com
 * `SolicitacaoEsquecimentoPrazoExcedido`, para consumidores externos (ex.:
 * painel administrativo).
 */
export class SolicitacaoEsquecimentoConcluida implements SolicitacaoEsquecimentoConcluidaPayload {
  static readonly detailType = 'SolicitacaoEsquecimentoConcluida' as const;
  readonly detailType = SolicitacaoEsquecimentoConcluida.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly solicitacaoId: string,
    readonly titularReferencia: string,
    readonly contextosConfirmados: readonly string[],
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
