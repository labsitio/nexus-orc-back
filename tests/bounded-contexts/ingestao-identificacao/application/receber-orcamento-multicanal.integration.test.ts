import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import { OrcamentoRecebido } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js';
import type { IdempotencyKeyRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { registrarRotaConfirmarUpload } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.controller.js';
import type { SftpTenantResolverGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/sftp-tenant-resolver.gateway.js';
import { criarHandlerSftpUpload } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/events/sftp-upload.handler.js';
import { criarTenantContextMiddleware } from '../../../../src/interface/shared/tenant-context.middleware.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

/**
 * Integration test (T018/#23): os 4 canais fixos — 3 via `confirmar-upload`
 * (presigned upload: PORTAL_WEB, API_REST, APP_MOBILE) e 1 via trigger S3
 * (SFTP, `criarHandlerSftpUpload`) — precisam produzir o mesmo shape de
 * `OrcamentoRecebido` (spec.md: "comportamento observável pós-recebimento é
 * idêntico entre os 4 canais"). Usa `ReceberOrcamento` real (T020/#25) por
 * trás dos dois pontos de entrada reais (controller HTTP real + handler
 * Lambda real), com fakes só nas bordas de infra (S3/repositório/publisher).
 */

function publisherCapturando(): { publisher: EventPublisher; eventos: OrcamentoRecebido[] } {
  const eventos: OrcamentoRecebido[] = [];
  return {
    eventos,
    publisher: {
      publicar: vi.fn(async (evento) => {
        eventos.push(evento as OrcamentoRecebido);
      }),
    },
  };
}

function repositorioFake(): OrcamentoRepository {
  return { salvar: vi.fn().mockResolvedValue(undefined), buscarPorId: vi.fn() };
}

function idempotenciaFake(): IdempotencyKeyRepository {
  return { reservar: vi.fn(async (_chave, orcamentoId) => ({ reservado: true, orcamentoId })) };
}

async function receberViaConfirmarUpload(
  canal: 'PORTAL_WEB' | 'API_REST' | 'APP_MOBILE',
  publisher: EventPublisher,
): Promise<void> {
  const orcamentoId = OrcamentoId.novo();
  const referencia = ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: `pending-uploads/${orcamentoId.toString()}-orcamento.pdf`,
    versionId: 'v-1',
  });
  const armazenamento: ArmazenamentoBrutoGateway = {
    armazenar: vi.fn(),
    lerConteudoBruto: vi.fn(),
    gerarUrlUpload: vi.fn(),
    confirmarUpload: vi.fn().mockResolvedValue(referencia),
  };
  const receberOrcamento = new ReceberOrcamento(repositorioFake(), publisher, idempotenciaFake());
  const app = Fastify();
  const preHandler = criarTenantContextMiddleware({ userPoolId: 'us-east-1_teste', clientId: 'client-teste' });
  registrarRotaConfirmarUpload(app, armazenamento, receberOrcamento, { preHandler });

  mockVerify.mockResolvedValue({ sub: 'usuario-teste', 'custom:tenant_id': TenantId.novo().toString() });
  const resposta = await app.inject({
    method: 'POST',
    url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload`,
    payload: { canal, nomeArquivo: 'orcamento.pdf' },
    headers: { authorization: 'Bearer token-teste' },
  });
  expect(resposta.statusCode).toBe(200);
  await app.close();
}

async function receberViaTriggerSftp(publisher: EventPublisher): Promise<void> {
  const receberOrcamento = new ReceberOrcamento(repositorioFake(), publisher, idempotenciaFake());
  const resolverTenant: SftpTenantResolverGateway = { resolver: vi.fn().mockResolvedValue(TenantId.novo()) };
  const handler = criarHandlerSftpUpload(receberOrcamento, resolverTenant);

  await handler(
    {
      Records: [
        {
          s3: {
            bucket: { name: 'nexo-orcamentos-raw' },
            object: { key: 'sftp-incoming/orcamento.pdf', versionId: 'v-1' },
          },
          eventVersion: '2.1',
          eventSource: 'aws:s3',
          awsRegion: 'us-east-1',
          eventTime: new Date().toISOString(),
          eventName: 'ObjectCreated:Put',
          userIdentity: { principalId: 'AWS:teste' },
          requestParameters: { sourceIPAddress: '127.0.0.1' },
          responseElements: { 'x-amz-request-id': 'req-1', 'x-amz-id-2': 'id-2' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
    () => undefined,
  );
}

describe('OrcamentoRecebido — mesmo shape entre os 4 canais', () => {
  it('presigned upload (PORTAL_WEB, API_REST, APP_MOBILE) e trigger S3 (SFTP) publicam o mesmo shape de payload', async () => {
    const { publisher, eventos } = publisherCapturando();

    await receberViaConfirmarUpload('PORTAL_WEB', publisher);
    await receberViaConfirmarUpload('API_REST', publisher);
    await receberViaConfirmarUpload('APP_MOBILE', publisher);
    await receberViaTriggerSftp(publisher);

    expect(eventos).toHaveLength(4);

    const canaisEsperados = ['PORTAL_WEB', 'API_REST', 'APP_MOBILE', 'SFTP'];
    eventos.forEach((evento, i) => {
      expect(evento.detailType).toBe('OrcamentoRecebido');
      expect(evento.schemaVersion).toBe(1);
      expect(evento.canal).toBe(canaisEsperados[i]);
      expect(typeof evento.orcamentoId).toBe('string');
      expect(evento.orcamentoId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(typeof evento.ocorreuEm).toBe('string');
      expect(() => new Date(evento.ocorreuEm)).not.toThrow();
      expect(evento.referenciaBruta).toEqual(
        expect.objectContaining({
          bucket: expect.any(String),
          key: expect.any(String),
          versionId: expect.any(String),
        }),
      );
    });

    // Mesmo conjunto de chaves do envelope + payload, canal e conteúdo de
    // `referenciaBruta` variando — nenhum canal produz campo extra/faltante.
    const chavesPorEvento = eventos.map((e) => Object.keys(e).sort());
    chavesPorEvento.forEach((chaves) => expect(chaves).toEqual(chavesPorEvento[0]));
  });
});
