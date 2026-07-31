import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventPublisher } from '../domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../domain/events/domain-event.js';

/** `source` fixo do componente de plataforma Conformidade no bus único (plan.md, Domain Events). */
const SOURCE = 'nexo.conformidade';

/**
 * Implementa `EventPublisher` (T009) publicando no mesmo bus EventBridge
 * único `nexo-dominio-bus` já estabelecido em 001 — instância própria do
 * componente de plataforma Conformidade, nunca compartilha client com
 * nenhum Bounded Context.
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
        `Falha ao publicar "${evento.detailType}" no bus "${this.eventBusName}": ${motivo}`,
      );
    }
  }
}
