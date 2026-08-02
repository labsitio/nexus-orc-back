import type { DomainEventEnvelope } from '../events/domain-event.js';

/** Todo caso de uso publica evento via esta interface — nunca chama SDK AWS diretamente (plan.md). */
export interface EventPublisher {
  publicar(evento: DomainEventEnvelope): Promise<void>;
}
