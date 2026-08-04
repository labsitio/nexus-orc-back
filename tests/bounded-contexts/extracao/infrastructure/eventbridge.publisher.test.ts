import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { describe, expect, it, vi } from 'vitest';
import { EventBridgePublisher } from '../../../../src/bounded-contexts/extracao/infrastructure/eventbridge.publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/extracao/domain/events/domain-event.js';

function eventBridgeClientFake(send: (command: unknown) => unknown): EventBridgeClient {
  return { send } as unknown as EventBridgeClient;
}

function eventoFake(orcamentoId: string): DomainEventEnvelope {
  return {
    detailType: 'OrcamentoExtraido',
    schemaVersion: 2,
    orcamentoId,
    ocorreuEm: new Date().toISOString(),
    tenantId: '018f4b1a-tenant-0000-000000000000',
  };
}

function loggerFake(): { warn: ReturnType<typeof vi.fn>; child: () => unknown } {
  return { warn: vi.fn(), child: vi.fn() };
}

describe('EventBridgePublisher (extracao)', () => {
  it('não alerta payload pequeno, bem abaixo do limite de 256KB do EventBridge (T043/#108)', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const logger = loggerFake();
    const publisher = new EventBridgePublisher(
      eventBridgeClientFake(send),
      'nexo-dominio-bus',
      logger as unknown as import('pino').Logger,
    );

    await publisher.publicar(eventoFake('orc-pequeno'));

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('alerta via logger.warn quando o payload se aproxima do limite de 256KB do EventBridge (T043/#108)', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const logger = loggerFake();
    const publisher = new EventBridgePublisher(
      eventBridgeClientFake(send),
      'nexo-dominio-bus',
      logger as unknown as import('pino').Logger,
    );
    const eventoGrande = {
      ...eventoFake('orc-grande'),
      itens: 'x'.repeat(230 * 1024),
    } as unknown as DomainEventEnvelope;

    await publisher.publicar(eventoGrande);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [dados, mensagem] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(dados.orcamentoId).toBe('orc-grande');
    expect(dados.tamanhoBytes).toBeGreaterThanOrEqual(256 * 1024 * 0.8);
    expect(mensagem).toMatch(/262144B/);
  });

  it('publica no bus informado com source fixo `nexo.extracao` e detail-type do evento', async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const publisher = new EventBridgePublisher(eventBridgeClientFake(send), 'nexo-dominio-bus');

    await publisher.publicar(eventoFake('orc-1'));

    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    const entrada = (comando.input.Entries as Array<Record<string, unknown>>)[0]!;
    expect(entrada.EventBusName).toBe('nexo-dominio-bus');
    expect(entrada.Source).toBe('nexo.extracao');
    expect(entrada.DetailType).toBe('OrcamentoExtraido');
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
