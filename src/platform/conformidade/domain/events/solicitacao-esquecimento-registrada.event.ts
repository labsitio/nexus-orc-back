import type { DomainEventEnvelope } from './domain-event.js';

export interface SolicitacaoEsquecimentoRegistradaPayload extends DomainEventEnvelope {
  readonly solicitacaoId: string;
  readonly titularReferencia: string;
  readonly contextosEsperados: readonly string[];
  readonly prazoLimite: string;
}

/**
 * Publicado por `RegistrarSolicitacaoEsquecimento` ao registrar o direito ao
 * esquecimento para um titular (plan.md, Domain Events #1). `source =
 * nexo.conformidade`. Consumido por cada Bounded Context listado em
 * `contextosEsperados` para disparar `AnonimizarDadoPessoalDoOrcamento`.
 */
export class SolicitacaoEsquecimentoRegistrada implements SolicitacaoEsquecimentoRegistradaPayload {
  static readonly detailType = 'SolicitacaoEsquecimentoRegistrada' as const;
  readonly detailType = SolicitacaoEsquecimentoRegistrada.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly solicitacaoId: string,
    readonly titularReferencia: string,
    readonly contextosEsperados: readonly string[],
    readonly prazoLimite: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
