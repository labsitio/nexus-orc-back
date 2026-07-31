import type { S3Event } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { EventPublisher } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { SftpTenantResolverGateway } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/sftp-tenant-resolver.gateway.js';
import type { IdempotencyKeyRepository } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { criarHandlerSftpUpload } from '../../../../../src/bounded-contexts/ingestao-identificacao/interface/events/sftp-upload.handler.js';

/** Fake que sempre resolve para `undefined` — testes desta suíte não validam T016 (wiring de tenantId em ReceberOrcamento). */
function resolverTenantFake(): SftpTenantResolverGateway {
  return { resolver: vi.fn().mockResolvedValue(undefined) };
}

function eventoS3(registros: Array<{ bucket: string; key: string; versionId?: string }>): S3Event {
  return {
    Records: registros.map((r) => ({
      s3: { bucket: { name: r.bucket }, object: { key: r.key, versionId: r.versionId } },
      // Campos exigidos pelo tipo S3EventRecord, irrelevantes para o handler.
      eventVersion: '2.1',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-1',
      eventTime: new Date().toISOString(),
      eventName: 'ObjectCreated:Put',
      userIdentity: { principalId: 'AWS:teste' },
      requestParameters: { sourceIPAddress: '127.0.0.1' },
      responseElements: { 'x-amz-request-id': 'req-1', 'x-amz-id-2': 'id-2' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any,
  };
}

function receberOrcamentoFake(): {
  useCase: ReceberOrcamento;
  salvar: ReturnType<typeof vi.fn>;
  reservar: ReturnType<typeof vi.fn>;
} {
  const salvar = vi.fn().mockResolvedValue(undefined);
  const repositorio: OrcamentoRepository = { salvar, buscarPorId: vi.fn() };
  const publisher: EventPublisher = { publicar: vi.fn().mockResolvedValue(undefined) };
  const reservar = vi.fn(async (_chave, orcamentoId) => ({ reservado: true, orcamentoId }));
  const idempotencia: IdempotencyKeyRepository = { reservar };
  return { useCase: new ReceberOrcamento(repositorio, publisher, idempotencia), salvar, reservar };
}

/** Simula `IdempotencyKeyRepository` de verdade — reserva atômica, chave reutilizada não passa de novo. */
function receberOrcamentoComReservaReal(): {
  useCase: ReceberOrcamento;
  salvar: ReturnType<typeof vi.fn>;
} {
  const salvar = vi.fn().mockResolvedValue(undefined);
  const repositorio: OrcamentoRepository = { salvar, buscarPorId: vi.fn() };
  const publisher: EventPublisher = { publicar: vi.fn().mockResolvedValue(undefined) };
  const chavesReservadas = new Map<string, unknown>();
  const idempotencia: IdempotencyKeyRepository = {
    reservar: vi.fn(async (chave, orcamentoId) => {
      if (chavesReservadas.has(chave)) {
        return { reservado: false, orcamentoId: chavesReservadas.get(chave) };
      }
      chavesReservadas.set(chave, orcamentoId);
      return { reservado: true, orcamentoId };
    }),
  };
  return { useCase: new ReceberOrcamento(repositorio, publisher, idempotencia), salvar };
}

describe('criarHandlerSftpUpload', () => {
  it('chama ReceberOrcamento(canal=SFTP) com a referência do próprio evento e Idempotency-Key derivada, sem re-ler o objeto', async () => {
    const { useCase, salvar, reservar } = receberOrcamentoFake();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());

    await handler(
      eventoS3([
        { bucket: 'nexo-orcamentos-raw', key: 'sftp-incoming/orcamento.pdf', versionId: 'v-1' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      () => undefined,
    );

    expect(salvar).toHaveBeenCalledTimes(1);
    const orcamento = salvar.mock.calls[0]?.[0];
    expect(orcamento.canal.toString()).toBe('SFTP');
    expect(orcamento.referenciaBruta).toMatchObject({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/orcamento.pdf',
      versionId: 'v-1',
    });
    expect(reservar).toHaveBeenCalledWith(
      'nexo-orcamentos-raw/sftp-incoming/orcamento.pdf#v-1',
      expect.anything(),
      expect.any(Date),
    );
  });

  it('resolve tenantId via resolverTenant.resolver(referenciaBruta) — mapeamento usuário/servidor, nunca conteúdo do arquivo (T006)', async () => {
    const { useCase } = receberOrcamentoFake();
    const resolver = vi.fn().mockResolvedValue({ toString: () => 'tenant-a' });
    const resolverTenant: SftpTenantResolverGateway = { resolver };
    const handler = criarHandlerSftpUpload(useCase, resolverTenant);

    await handler(
      eventoS3([
        { bucket: 'nexo-orcamentos-raw', key: 'sftp-incoming/orcamento.pdf', versionId: 'v-1' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      () => undefined,
    );

    expect(resolver).toHaveBeenCalledTimes(1);
    const referenciaPassada = resolver.mock.calls[0]?.[0];
    expect(referenciaPassada).toMatchObject({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/orcamento.pdf',
      versionId: 'v-1',
    });
  });

  it('não lança erro quando o mapeamento usuário/servidor está ausente — apenas registra, não bloqueia o processamento nesta fase (T016 formaliza a exigência)', async () => {
    const { useCase, salvar } = receberOrcamentoFake();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());

    await expect(
      handler(
        eventoS3([
          { bucket: 'nexo-orcamentos-raw', key: 'sftp-incoming/orcamento.pdf', versionId: 'v-1' },
        ]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        () => undefined,
      ),
    ).resolves.toBeUndefined();

    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it('redelivery do mesmo evento S3 (at-least-once da AWS) não duplica salvar/publicar — mesma Idempotency-Key', async () => {
    const { useCase, salvar } = receberOrcamentoComReservaReal();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());
    const evento = eventoS3([
      { bucket: 'nexo-orcamentos-raw', key: 'sftp-incoming/orcamento.pdf', versionId: 'v-1' },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(evento, {} as any, () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(evento, {} as any, () => undefined);

    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it('processa múltiplos registros do mesmo evento', async () => {
    const { useCase, salvar } = receberOrcamentoFake();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());

    await handler(
      eventoS3([
        { bucket: 'b', key: 'sftp-incoming/a.pdf', versionId: 'v-a' },
        { bucket: 'b', key: 'sftp-incoming/b.pdf', versionId: 'v-b' },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      () => undefined,
    );

    expect(salvar).toHaveBeenCalledTimes(2);
  });

  it('ignora registro fora do prefixo sftp-incoming/ (defesa, config de infra já filtra)', async () => {
    const { useCase, salvar } = receberOrcamentoFake();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());

    await handler(
      eventoS3([{ bucket: 'b', key: 'portal-web/x.pdf', versionId: 'v-1' }]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      () => undefined,
    );

    expect(salvar).not.toHaveBeenCalled();
  });

  it('lança erro se o evento S3 não trouxer versionId (bucket sem versionamento)', async () => {
    const { useCase } = receberOrcamentoFake();
    const handler = criarHandlerSftpUpload(useCase, resolverTenantFake());

    await expect(
      handler(
        eventoS3([{ bucket: 'b', key: 'sftp-incoming/sem-versao.pdf' }]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        () => undefined,
      ),
    ).rejects.toThrow(/versionId/);
  });
});
