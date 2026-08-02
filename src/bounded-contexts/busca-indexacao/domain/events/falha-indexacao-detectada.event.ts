import type { DomainEventEnvelope } from './domain-event.js';

export interface FalhaIndexacaoDetectadaPayload extends DomainEventEnvelope {
  readonly motivoFalha: string;
  readonly tentativaNumero: number;
}

/**
 * Publicado quando `registrarTentativaIndexacao` resulta em falha técnica
 * (plan.md, seção Domain Events). `motivoFalha` é sempre texto legível (ex.:
 * "serviço de embeddings indisponível"), nunca "falhou" genérico.
 * `tentativaNumero` é a posição desta tentativa no histórico (1ª, 2ª, ...).
 * Evento de exceção explícito do Princípio IV — nunca autoaprova por
 * tempo/volume/exaustão de tentativas; o orçamento permanece "validado"
 * (status de negócio inalterado), apenas a indexação fica pendente/com
 * falha temporária até nova tentativa (ADR-002).
 */
export class FalhaIndexacaoDetectada implements FalhaIndexacaoDetectadaPayload {
  static readonly detailType = 'FalhaIndexacaoDetectada' as const;
  readonly detailType = FalhaIndexacaoDetectada.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly tenantId: string,
    readonly motivoFalha: string,
    readonly tentativaNumero: number,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
