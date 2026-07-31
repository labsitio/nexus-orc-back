import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventPublisher } from '../domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../domain/events/domain-event.js';

/** `source` fixo deste BC no bus único (plan.md, convenção 3). */
const SOURCE = 'nexo.extracao';

/**
 * Implementa `EventPublisher` (T015/#80) publicando no bus EventBridge
 * único `nexo-dominio-bus` (mesma instância de spec-001, T013/#18) —
 * instância própria deste BC, nunca compartilha client com outro BC.
 */
export class EventBridgePublisher implements EventPublisher {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {}

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    const resultado = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: SOURCE,
            DetailType: evento.detailType,
            Detail: JSON.stringify(evento),
          },
        ],
      }),
    );
    if (resultado.FailedEntryCount) {
      const motivo = resultado.Entries?.[0]?.ErrorMessage ?? 'motivo desconhecido';
      throw new Error(
        `Falha ao publicar "${evento.detailType}" (orcamentoId=${evento.orcamentoId}) no bus "${this.eventBusName}": ${motivo}`,
      );
    }
  }
}
