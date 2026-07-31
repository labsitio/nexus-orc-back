import type { DomainEventEnvelope } from './domain-event.js';

export interface SolicitacaoEsquecimentoPrazoExcedidoPayload extends DomainEventEnvelope {
  readonly solicitacaoId: string;
  readonly titularReferencia: string;
  readonly prazoLimite: string;
  readonly contextosPendentes: readonly string[];
}

/**
 * Publicado pela Conformidade quando `prazoLimite` expira sem cobertura
 * total de `contextosEsperados` (plan.md, Domain Events #4). Nunca é
 * "fluxo feliz": MUST disparar alarme (Observabilidade) e nunca autoconclui
 * a solicitação — mesmo espírito do Princípio IV (nenhuma fila autoaprova
 * por exaustão de tempo). `source = nexo.conformidade`.
 */
export class SolicitacaoEsquecimentoPrazoExcedido implements SolicitacaoEsquecimentoPrazoExcedidoPayload {
  static readonly detailType = 'SolicitacaoEsquecimentoPrazoExcedido' as const;
  readonly detailType = SolicitacaoEsquecimentoPrazoExcedido.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly solicitacaoId: string,
    readonly titularReferencia: string,
    readonly prazoLimite: string,
    readonly contextosPendentes: readonly string[],
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
