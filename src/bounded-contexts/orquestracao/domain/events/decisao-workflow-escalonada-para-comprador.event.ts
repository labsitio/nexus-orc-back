import type { DomainEventEnvelope } from './domain-event.js';

export interface DecisaoWorkflowEscalonadaParaCompradorPayload extends DomainEventEnvelope {
  /** Confiança reportada pelo Orquestrador — sempre abaixo de `LIMIAR_CONFIANCA` (aggregate). */
  readonly nivelConfianca: number;
}

/**
 * Publicado diretamente pelo caso de uso de decisão quando o Orquestrador
 * não atinge confiança suficiente (`registrarTentativaOrquestrador` →
 * `PENDENTE_REVISAO_HUMANA`) — nunca há segundo agente de IA revisor
 * (ADR-001, plan.md). Alimenta a fila de escalonamento humano e é consumido
 * por Acompanhamento/consumidor externo para exibir "pendente de decisão de
 * workflow". Nenhum caminho de código publica este evento por
 * exaustão/tempo/volume — apenas por confiança insuficiente reportada
 * (Princípio IV, NON-NEGOTIABLE).
 */
export class DecisaoWorkflowEscalonadaParaComprador implements DecisaoWorkflowEscalonadaParaCompradorPayload {
  static readonly detailType = 'DecisaoWorkflowEscalonadaParaComprador' as const;
  readonly detailType = DecisaoWorkflowEscalonadaParaComprador.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly nivelConfianca: number,
    readonly tenantId?: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
