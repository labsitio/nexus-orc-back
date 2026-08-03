import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { Logger } from 'pino';
import type { EventPublisher } from '../domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../domain/events/domain-event.js';
import { criarLogger } from './observability/logger.js';

/** `source` fixo deste BC no bus único (plan.md, convenção 3). */
const SOURCE = 'nexo.extracao';

/** Limite real de entrada do EventBridge (`Detail`), 256KB (plan.md, Constraints — T043/#108). */
const LIMITE_PAYLOAD_EVENTBRIDGE_BYTES = 256 * 1024;
// ponytail: threshold fixo em 80% do limite, sem config — reavaliar se algum BC precisar de
// limiar diferente por tipo de evento (não há demanda real hoje, T043/#108).
const LIMIAR_ALERTA_PAYLOAD_BYTES = LIMITE_PAYLOAD_EVENTBRIDGE_BYTES * 0.8;

/**
 * Implementa `EventPublisher` (T015/#80) publicando no bus EventBridge
 * único `nexo-dominio-bus` (mesma instância de spec-001, T013/#18) —
 * instância própria deste BC, nunca compartilha client com outro BC.
 */
export class EventBridgePublisher implements EventPublisher {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
    private readonly logger: Logger = criarLogger({ componente: 'EventBridgePublisher' }),
  ) {}

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    const detail = JSON.stringify(evento);
    const tamanhoBytes = Buffer.byteLength(detail, 'utf8');
    if (tamanhoBytes >= LIMIAR_ALERTA_PAYLOAD_BYTES) {
      this.logger.warn(
        {
          detailType: evento.detailType,
          orcamentoId: evento.orcamentoId,
          tamanhoBytes,
          limiteBytes: LIMITE_PAYLOAD_EVENTBRIDGE_BYTES,
        },
        'Payload de domain event próximo do limite de 256KB do EventBridge',
      );
    }

    const resultado = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: SOURCE,
            DetailType: evento.detailType,
            Detail: detail,
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
