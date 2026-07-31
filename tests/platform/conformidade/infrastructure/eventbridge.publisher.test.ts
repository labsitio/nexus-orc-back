import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { describe, expect, it, vi } from 'vitest';
import { EventBridgePublisher } from '../../../../src/platform/conformidade/infrastructure/eventbridge.publisher.js';
import type { DomainEventEnvelope } from '../../../../src/platform/conformidade/domain/events/domain-event.js';

function eventBridgeClientFake(send: (command: unknown) => unknown): EventBridgeClient {
  return { send } as unknown as EventBridgeClient;
}

function eventoFake(): DomainEventEnvelope {
  return {
    detailType: 'SolicitacaoEsquecimentoRegistrada',
    schemaVersion: 1,
    ocorreuEm: new Date().toISOString(),
  };
}

describe('EventBridgePublisher (conformidade)', () => {
  it('publica no bus informado com source fixo `nexo.conformidade` e detail-type do evento', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await publisher.publicar(eventoFake());

    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    const entrada = (comando.input.Entries as Array<Record<string, unknown>>)[0]!;
    expect(entrada.EventBusName).toBe('nexo-dominio-bus');
    expect(entrada.Source).toBe('nexo.conformidade');
    expect(entrada.DetailType).toBe('SolicitacaoEsquecimentoRegistrada');
  });

  it('lança erro descritivo se o EventBridge reportar falha na entrada', async () => {
    const send = vi.fn().mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorMessage: 'rate exceeded' }],
    });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await expect(publisher.publicar(eventoFake())).rejects.toThrow(/rate exceeded/);
  });

  it('usa mensagem de fallback quando o EventBridge não informa ErrorMessage', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 1, Entries: [{}] });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await expect(publisher.publicar(eventoFake())).rejects.toThrow(/motivo desconhecido/);
  });
});
