import type { DomainEventEnvelope } from './domain-event.js';

export interface RetencaoAplicadaNoContextoPayload extends DomainEventEnvelope {
  readonly boundedContext: string;
  readonly categoria: string;
  readonly quantidadeAfetada: number;
  readonly janelaAplicada: string;
}

/**
 * Publicado por **cada Bounded Context** ao concluir
 * `AplicarPoliticaRetencaoDoContexto` (plan.md, Domain Events #5). `source =
 * nexo.<bc-slug>` do BC que publica. `categoria` referencia um valor de
 * `CategoriaDocumento` (shared-value-objects); `janelaAplicada` descreve o
 * corte de tempo usado para identificar dados além do `prazoEmDias` vigente.
 */
export class RetencaoAplicadaNoContexto implements RetencaoAplicadaNoContextoPayload {
  static readonly detailType = 'RetencaoAplicadaNoContexto' as const;
  readonly detailType = RetencaoAplicadaNoContexto.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly boundedContext: string,
    readonly categoria: string,
    readonly quantidadeAfetada: number,
    readonly janelaAplicada: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
