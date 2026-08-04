import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { describe, expect, it, vi } from 'vitest';
import { EventBridgePublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/eventbridge.publisher.js';
import { OrcamentoRecebido } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js';

function eventBridgeClientFake(send: (command: unknown) => unknown): EventBridgeClient {
  return { send } as unknown as EventBridgeClient;
}

describe('EventBridgePublisher', () => {
  it('publica no bus informado com source fixo e detail-type do evento', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');
    const evento = new OrcamentoRecebido(
      'orc-1',
      'SFTP',
      {
        bucket: 'nexo-orcamentos-raw',
        key: 'sftp-incoming/x.pdf',
        versionId: 'v-1',
      },
      '018f4b1a-tenant-0000-000000000000',
    );

    await publisher.publicar(evento);

    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    const entrada = (comando.input.Entries as Array<Record<string, unknown>>)[0]!;
    expect(entrada.EventBusName).toBe('nexo-dominio-bus');
    expect(entrada.Source).toBe('nexo.ingestao-identificacao');
    expect(entrada.DetailType).toBe('OrcamentoRecebido');
    expect(JSON.parse(entrada.Detail as string)).toMatchObject({ orcamentoId: 'orc-1' });
  });

  it('lança erro descritivo se o EventBridge reportar falha na entrada', async () => {
    const send = vi.fn().mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorMessage: 'rate exceeded' }],
    });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');
    const evento = new OrcamentoRecebido(
      'orc-2',
      'API_REST',
      {
        bucket: 'nexo-orcamentos-raw',
        key: 'api-rest/y.pdf',
        versionId: 'v-2',
      },
      '018f4b1a-tenant-0000-000000000000',
    );

    await expect(publisher.publicar(evento)).rejects.toThrow(/rate exceeded/);
  });

  it('usa mensagem de fallback quando o EventBridge não informa ErrorMessage', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 1, Entries: [{}] });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');
    const evento = new OrcamentoRecebido(
      'orc-3',
      'PORTAL_WEB',
      {
        bucket: 'nexo-orcamentos-raw',
        key: 'portal-web/z.pdf',
        versionId: 'v-3',
      },
      '018f4b1a-tenant-0000-000000000000',
    );

    await expect(publisher.publicar(evento)).rejects.toThrow(/motivo desconhecido/);
  });
});
