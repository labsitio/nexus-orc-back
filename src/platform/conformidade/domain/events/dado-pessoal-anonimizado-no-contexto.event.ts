import type { MetodoAnonimizacao } from '../../../shared-value-objects/domain/dado-anonimizado.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

/** Shape plano (JSON) de um `DadoAnonimizado` — nunca carrega o valor original (ADR-004/T006). */
export interface DadoAnonimizadoPayload {
  readonly campoOriginal: string;
  readonly metodo: MetodoAnonimizacao;
  readonly aplicadoEm: string;
  readonly solicitacaoId: string;
}

export interface DadoPessoalAnonimizadoNoContextoPayload extends DomainEventEnvelope {
  readonly solicitacaoId: string;
  readonly orcamentoId: string;
  readonly boundedContext: string;
  readonly camposAnonimizados: readonly DadoAnonimizadoPayload[];
}

/**
 * Publicado por **cada Bounded Context** (nunca pela Conformidade) ao
 * concluir `AnonimizarDadoPessoalDoOrcamento` (plan.md, Domain Events #2).
 * `source = nexo.<bc-slug>` do BC que publica. `camposAnonimizados: []`
 * é resposta explícita de "nada a fazer" — nunca ausência de evento.
 */
export class DadoPessoalAnonimizadoNoContexto implements DadoPessoalAnonimizadoNoContextoPayload {
  static readonly detailType = 'DadoPessoalAnonimizadoNoContexto' as const;
  readonly detailType = DadoPessoalAnonimizadoNoContexto.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly solicitacaoId: string,
    readonly orcamentoId: string,
    readonly boundedContext: string,
    readonly camposAnonimizados: readonly DadoAnonimizadoPayload[],
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
