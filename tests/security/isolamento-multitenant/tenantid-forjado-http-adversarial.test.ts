import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import { ConfirmarRevisaoHumana } from '../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/confirmar-revisao-humana.js';
import { ConsultarStatusOrcamento } from '../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { Orcamento } from '../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import type { EventPublisher } from '../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import type { ArmazenamentoBrutoGateway } from '../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { IdempotencyKeyRepository } from '../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import { Canal } from '../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { registrarRotaConfirmarUpload } from '../../../src/bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.controller.js';
import { registrarRotaRevisaoHumana } from '../../../src/bounded-contexts/ingestao-identificacao/interface/http/revisao-humana.controller.js';
import { registrarRotaStatusOrcamento } from '../../../src/bounded-contexts/ingestao-identificacao/interface/http/status.controller.js';
import { registrarRotaUploadUrl } from '../../../src/bounded-contexts/ingestao-identificacao/interface/http/upload-url.controller.js';
import { criarTenantContextMiddleware } from '../../../src/interface/shared/tenant-context.middleware.js';
import { TenantId } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Issue #635 (spec-001 + spec-007): prova adversarial, na fronteira HTTP real
 * dos 4 endpoints de 001, de que `tenantId` forjado (body/query/header) é
 * ignorado — só a claim `custom:tenant_id` do JWT já verificado decide o
 * tenant efetivo da operação.
 *
 * Restrição: NÃO mocka o middleware de tenant — usa `criarTenantContextMiddleware`
 * real, só com `aws-jwt-verify` mockado (mesmo padrão de
 * `tests/interface/shared/tenant-context.middleware.test.ts` e dos contract
 * tests já existentes deste BC). O caminho real de leitura da claim é
 * exercitado de ponta a ponta.
 */

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

function middlewareParaTenant(tenantId: TenantId): ReturnType<typeof criarTenantContextMiddleware> {
  mockVerify.mockResolvedValue({ sub: 'usuario-teste', 'custom:tenant_id': tenantId.toString() });
  return criarTenantContextMiddleware({ userPoolId: 'us-east-1_teste', clientId: 'client-teste' });
}

/** Só API pública do VO (`toString()`) — nunca o campo privado `valor`. */
function chamadaComTenant(spy: ReturnType<typeof vi.fn>, tenantId: TenantId): boolean {
  return spy.mock.calls.some(
    (chamada) => (chamada[0] as TenantId).toString() === tenantId.toString(),
  );
}

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/07/30/orcamento.pdf',
    versionId: 'v1',
  });
}

class OrcamentoRepositoryFake implements OrcamentoRepository {
  private readonly registros = new Map<string, Orcamento>();
  async salvar(orcamento: Orcamento): Promise<void> {
    this.registros.set(orcamento.id.toString(), orcamento);
  }
  async buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined> {
    return this.registros.get(id.toString());
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

beforeEach(() => {
  mockVerify.mockReset();
  mockCreate.mockClear();
});

describe('POST /v1/orcamentos/{orcamentoId}/confirmar-upload — tenantId forjado (issue #635)', () => {
  function montarApp(
    repositorio: OrcamentoRepositoryFake,
    publisher: EventPublisherFake,
    tenantA: TenantId,
  ) {
    const armazenamento: ArmazenamentoBrutoGateway = {
      armazenar: vi.fn(),
      lerConteudoBruto: vi.fn(),
      gerarUrlUpload: vi.fn(),
      confirmarUpload: vi.fn().mockResolvedValue(criarReferenciaBruta()),
    };
    const idempotencia: IdempotencyKeyRepository = {
      reservar: vi.fn(async (_chave, orcamentoId) => ({ reservado: true, orcamentoId })),
    };
    const criarRepositorioSpy = vi.fn(() => repositorio);
    const receberOrcamento = new ReceberOrcamento(criarRepositorioSpy, publisher, idempotencia);
    const app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamento, receberOrcamento, {
      preHandler: middlewareParaTenant(tenantA),
    });
    return { app, criarRepositorioSpy };
  }

  it('tenantId de outro tenant forjado no BODY é ignorado — grava com o tenant do token', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);
    const orcamentoId = OrcamentoId.novo();

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload`,
      headers: { authorization: 'Bearer token-tenant-a' },
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf', tenantId: tenantB.toString() },
    });

    expect(resposta.statusCode).toBe(200);
    // Efeito, não só resposta: fábrica de repositório e evento publicado carregam
    // o tenant do token (A), nunca o forjado no body (B).
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect(chamadaComTenant(criarRepositorioSpy, tenantB)).toBe(false);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });

  it('tenantId de outro tenant forjado na QUERY STRING é ignorado', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);
    const orcamentoId = OrcamentoId.novo();

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload?tenantId=${tenantB.toString()}`,
      headers: { authorization: 'Bearer token-tenant-a' },
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });

  it('tenantId de outro tenant forjado em HEADER customizado é ignorado', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);
    const orcamentoId = OrcamentoId.novo();

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload`,
      headers: { authorization: 'Bearer token-tenant-a', 'x-tenant-id': tenantB.toString() },
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });
});

describe('POST /v1/orcamentos/{orcamentoId}/revisao-humana — tenantId forjado (issue #635)', () => {
  function montarApp(
    repositorio: OrcamentoRepositoryFake,
    publisher: EventPublisherFake,
    tenantA: TenantId,
  ) {
    const criarRepositorioSpy = vi.fn(() => repositorio);
    const confirmarRevisaoHumana = new ConfirmarRevisaoHumana(criarRepositorioSpy, publisher);
    const app = Fastify();
    registrarRotaRevisaoHumana(app, confirmarRevisaoHumana, {
      preHandler: middlewareParaTenant(tenantA),
    });
    return { app, criarRepositorioSpy };
  }

  /** Precisa estar em PENDENTE_REVISAO_HUMANA — baixa confiança do classificador escalona (mesmo padrão do contract test). */
  function criarOrcamentoPendente(id: OrcamentoId, tenantId: TenantId): Orcamento {
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId,
    });
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Incerto',
        formatoIdentificado: 'XLSX',
        nivelConfianca: NivelConfianca.de(40),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    return orcamento;
  }

  it('tenantId de outro tenant forjado no BODY é ignorado — usa/grava com o tenant do token', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const id = OrcamentoId.novo();
    await repositorio.salvar(criarOrcamentoPendente(id, tenantA));
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/revisao-humana`,
      headers: { authorization: 'Bearer token-tenant-a' },
      payload: {
        fornecedorIdentificado: 'Distribuidora ABC Ltda',
        formatoIdentificado: 'PDF',
        tenantId: tenantB.toString(),
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect(chamadaComTenant(criarRepositorioSpy, tenantB)).toBe(false);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });

  it('tenantId de outro tenant forjado na QUERY STRING é ignorado', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const id = OrcamentoId.novo();
    await repositorio.salvar(criarOrcamentoPendente(id, tenantA));
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/revisao-humana?tenantId=${tenantB.toString()}`,
      headers: { authorization: 'Bearer token-tenant-a' },
      payload: { fornecedorIdentificado: 'Distribuidora ABC Ltda', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });

  it('tenantId de outro tenant forjado em HEADER customizado é ignorado', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const id = OrcamentoId.novo();
    await repositorio.salvar(criarOrcamentoPendente(id, tenantA));
    const { app, criarRepositorioSpy } = montarApp(repositorio, publisher, tenantA);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/revisao-humana`,
      headers: { authorization: 'Bearer token-tenant-a', 'x-tenant-id': tenantB.toString() },
      payload: { fornecedorIdentificado: 'Distribuidora ABC Ltda', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect((publisher.eventosPublicados[0] as { tenantId: string }).tenantId).toBe(
      tenantA.toString(),
    );
    await app.close();
  });

  it('cross-tenant real (orçamento pertence a outro tenant) → 404, tenantId forjado no body não resgata o acesso', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const publisher = new EventPublisherFake();
    const idDeTenantB = OrcamentoId.novo();
    await repositorio.salvar(criarOrcamentoPendente(idDeTenantB, tenantB));
    const { app } = montarApp(repositorio, publisher, tenantA);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${idDeTenantB.toString()}/revisao-humana`,
      headers: { authorization: 'Bearer token-tenant-a' },
      // Tenta "provar" que é do tenant B forjando o próprio tenantId no body — irrelevante, nunca é lido.
      payload: {
        fornecedorIdentificado: 'Distribuidora ABC Ltda',
        formatoIdentificado: 'PDF',
        tenantId: tenantB.toString(),
      },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(publisher.eventosPublicados).toHaveLength(0);
    await app.close();
  });
});

describe('GET /v1/orcamentos/{orcamentoId}/status — tenantId forjado (issue #635)', () => {
  function montarApp(repositorio: OrcamentoRepositoryFake, tenantA: TenantId) {
    const criarRepositorioSpy = vi.fn(() => repositorio);
    const consultarStatus = new ConsultarStatusOrcamento(criarRepositorioSpy);
    const app = Fastify();
    registrarRotaStatusOrcamento(app, consultarStatus, {
      preHandler: middlewareParaTenant(tenantA),
    });
    return { app, criarRepositorioSpy };
  }

  it('tenantId de outro tenant forjado na QUERY STRING é ignorado — lê com o tenant do token', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const id = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantA,
      }),
    );
    const { app, criarRepositorioSpy } = montarApp(repositorio, tenantA);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status?tenantId=${tenantB.toString()}`,
      headers: { authorization: 'Bearer token-tenant-a' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: id.toString() });
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    expect(chamadaComTenant(criarRepositorioSpy, tenantB)).toBe(false);
    await app.close();
  });

  it('tenantId de outro tenant forjado em HEADER customizado é ignorado', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const id = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantA,
      }),
    );
    const { app, criarRepositorioSpy } = montarApp(repositorio, tenantA);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status`,
      headers: { authorization: 'Bearer token-tenant-a', 'x-tenant-id': tenantB.toString() },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: id.toString() });
    expect(chamadaComTenant(criarRepositorioSpy, tenantA)).toBe(true);
    await app.close();
  });

  it('cross-tenant real: orçamento pertence a Tenant B, query/header forjam Tenant A mesmo assim não muda o resultado (404)', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const idDeTenantB = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id: idDeTenantB,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantB,
      }),
    );
    const { app } = montarApp(repositorio, tenantA);

    const resposta = await app.inject({
      method: 'GET',
      // JWT de fato é do tenant A (via middleware); tenta forjar tenant B na query pra "provar" acesso.
      url: `/v1/orcamentos/${idDeTenantB.toString()}/status?tenantId=${tenantB.toString()}`,
      headers: { authorization: 'Bearer token-tenant-a', 'x-tenant-id': tenantB.toString() },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    await app.close();
  });
});

describe('POST /v1/orcamentos/upload-url — tenantId forjado (issue #635)', () => {
  it('tenantId forjado no BODY não altera a resposta nem os argumentos passados ao gateway', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const armazenamento: ArmazenamentoBrutoGateway = {
      armazenar: vi.fn(),
      lerConteudoBruto: vi.fn(),
      gerarUrlUpload: vi.fn().mockResolvedValue('https://s3.exemplo/presigned?sig=abc'),
      confirmarUpload: vi.fn(),
    };
    const app = Fastify();
    registrarRotaUploadUrl(app, armazenamento, { preHandler: middlewareParaTenant(tenantA) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/upload-url',
      headers: { authorization: 'Bearer token-tenant-a' },
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf', tenantId: tenantB.toString() },
    });

    expect(resposta.statusCode).toBe(201);
    // Endpoint não persiste nada tenant-scoped (ADR-002); a garantia aqui é que
    // o gateway nunca recebe o tenant forjado — nenhum parâmetro de tenant existe
    // na assinatura, então o valor forjado simplesmente não tem por onde entrar.
    expect(armazenamento.gerarUrlUpload).toHaveBeenCalledWith(expect.anything(), 'orcamento.pdf');
    await app.close();
  });

  it('tenantId forjado na QUERY STRING e em HEADER customizado não afeta a chamada ao gateway', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const armazenamento: ArmazenamentoBrutoGateway = {
      armazenar: vi.fn(),
      lerConteudoBruto: vi.fn(),
      gerarUrlUpload: vi.fn().mockResolvedValue('https://s3.exemplo/presigned?sig=xyz'),
      confirmarUpload: vi.fn(),
    };
    const app = Fastify();
    registrarRotaUploadUrl(app, armazenamento, { preHandler: middlewareParaTenant(tenantA) });

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/upload-url?tenantId=${tenantB.toString()}`,
      headers: { authorization: 'Bearer token-tenant-a', 'x-tenant-id': tenantB.toString() },
      payload: { canal: 'API_REST', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(armazenamento.gerarUrlUpload).toHaveBeenCalledWith(expect.anything(), 'orcamento.pdf');
    await app.close();
  });
});
