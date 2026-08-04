import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { describe, expect, it, vi } from 'vitest';
import { EventBridgePublisher } from '../../../../src/bounded-contexts/validacao/infrastructure/eventbridge.publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';

function eventBridgeClientFake(send: (command: unknown) => unknown): EventBridgeClient {
  return { send } as unknown as EventBridgeClient;
}

function eventoFake(orcamentoId: string): DomainEventEnvelope {
  return {
    detailType: 'OrcamentoValidado',
    schemaVersion: 2,
    orcamentoId,
    ocorreuEm: new Date().toISOString(),
    tenantId: '018f4b1a-tenant-0000-000000000000',
  };
}

describe('EventBridgePublisher (validacao)', () => {
  it('publica no bus informado com source fixo `nexo.validacao` e detail-type do evento', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await publisher.publicar(eventoFake('orc-1'));

    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    const entrada = (comando.input.Entries as Array<Record<string, unknown>>)[0]!;
    expect(entrada.EventBusName).toBe('nexo-dominio-bus');
    expect(entrada.Source).toBe('nexo.validacao');
    expect(entrada.DetailType).toBe('OrcamentoValidado');
    expect(JSON.parse(entrada.Detail as string)).toMatchObject({ orcamentoId: 'orc-1' });
  });

  it('lança erro descritivo se o EventBridge reportar falha na entrada', async () => {
    const send = vi.fn().mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorMessage: 'rate exceeded' }],
    });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await expect(publisher.publicar(eventoFake('orc-2'))).rejects.toThrow(/rate exceeded/);
  });

  it('usa mensagem de fallback quando o EventBridge não informa ErrorMessage', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 1, Entries: [{}] });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await expect(publisher.publicar(eventoFake('orc-3'))).rejects.toThrow(/motivo desconhecido/);
  });
});
