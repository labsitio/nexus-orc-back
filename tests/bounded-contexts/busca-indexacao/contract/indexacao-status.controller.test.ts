import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registrarRotaStatusIndexacao } from '../../../../src/bounded-contexts/busca-indexacao/interface/http/indexacao-status.controller.js';
import { IndiceOrcamento } from '../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import type { IndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { ConteudoIndexavel } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { Embedding } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/** Contract test do controller real (T031/#191), fake repository (sem Drizzle) — RLS simulada por filtro em memória. */
class IndiceOrcamentoRepositoryFake implements IndiceOrcamentoRepository {
  private readonly registros = new Map<string, IndiceOrcamento>();

  async upsert(indiceOrcamento: IndiceOrcamento): Promise<void> {
    this.registros.set(indiceOrcamento.orcamentoId.toString(), indiceOrcamento);
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<IndiceOrcamento | undefined> {
    return this.registros.get(orcamentoId.toString());
  }

  async buscarPorCriterioEVetor(): Promise<never[]> {
    return [];
  }
}

const conteudoIndexavel = () =>
  ConteudoIndexavel.de({
    resumoFornecedor: 'Fornecedor Teste',
    itensDescricao: ['Item A'],
    condicoesResumo: 'à vista',
    categorias: ['papelaria'],
  });

describe('GET /v1/orcamentos/{orcamentoId}/indexacao/status — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: IndiceOrcamentoRepositoryFake;
  let tenantId: TenantId;

  beforeEach(() => {
    repositorio = new IndiceOrcamentoRepositoryFake();
    tenantId = TenantId.novo();
    app = Fastify();
    registrarRotaStatusIndexacao(app, () => repositorio, {
      preHandler: async (request) => {
        request.tenantContext = criarTenantContext(tenantId);
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 INDEXADO — histórico com tentativa de sucesso', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId,
      conteudoIndexavel: conteudoIndexavel(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    indice.registrarTentativaIndexacao({
      resultado: 'INDEXADO',
      timestamp: new Date('2026-07-30T14:06:00.000Z'),
      embedding: Embedding.de({
        vetor: [0.1, 0.2],
        dimensao: 2,
        modeloId: 'amazon.titan-embed-text-v2:0',
        geradoEm: new Date('2026-07-30T14:06:00.000Z'),
      }),
    });
    await repositorio.upsert(indice);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      orcamentoId: id.toString(),
      status: 'INDEXADO',
      modeloEmbedding: 'amazon.titan-embed-text-v2:0',
      historico: [
        {
          resultado: 'INDEXADO',
          timestamp: '2026-07-30T14:06:00.000Z',
          modeloEmbedding: 'amazon.titan-embed-text-v2:0',
          motivoFalha: null,
        },
      ],
    });
  });

  it('200 FALHA_INDEXACAO — falha técnica nunca significa orçamento inválido, histórico preserva motivo', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a2');
    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId,
      conteudoIndexavel: conteudoIndexavel(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp: new Date('2026-07-30T14:06:00.000Z'),
      motivoFalha: 'timeout ao invocar AgenteEmbeddingGateway',
    });
    await repositorio.upsert(indice);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('FALHA_INDEXACAO');
    expect(corpo.modeloEmbedding).toBeNull();
    expect(corpo.historico).toEqual([
      {
        resultado: 'FALHA_TECNICA',
        timestamp: '2026-07-30T14:06:00.000Z',
        modeloEmbedding: null,
        motivoFalha: 'timeout ao invocar AgenteEmbeddingGateway',
      },
    ]);
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idInexistente.toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('404 Problem Details — Tenant A consultando orcamentoId de Tenant B (nunca 200, nunca 403, ADR-005/T031)', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a4');
    const tenantB = TenantId.novo();
    await repositorio.upsert(
      IndiceOrcamento.criar({
        orcamentoId: id,
        tenantId: tenantB,
        conteudoIndexavel: conteudoIndexavel(),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      }),
    );

    // `tenantId` fixado no preHandler do `app` é sempre o Tenant A (beforeEach) — diferente do Tenant B do agregado.
    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('401 Problem Details quando TenantContextMiddleware não popula request.tenantContext', async () => {
    const appSemMiddleware = Fastify();
    registrarRotaStatusIndexacao(appSemMiddleware, () => repositorio);

    const resposta = await appSemMiddleware.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a5').toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await appSemMiddleware.close();
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/orcamentos/nao-e-uuid/indexacao/status',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('404 Problem Details para UUID válido porém não-v7 (OrcamentoIdInvalidoError, nunca 500/leak)', async () => {
    // Passa o filtro Zod (`z.string().uuid()` aceita qualquer versão) mas falha em
    // `OrcamentoId.de` (exige v7) — precisa cair no mesmo bucket 404 do "não encontrado",
    // nunca 500, para não distinguir "UUID mal formado para este BC" de "não existe".
    const uuidV4 = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${uuidV4}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('propaga (500) erro inesperado do repositório sem mascarar como 404', async () => {
    const appComRepositorioQuebrado = Fastify();
    const repositorioQuebrado: IndiceOrcamentoRepository = {
      upsert: () => {
        throw new Error('não usado neste teste');
      },
      buscarPorOrcamentoId: () => {
        throw new Error('falha inesperada de infraestrutura');
      },
      buscarPorCriterioEVetor: () => {
        throw new Error('não usado neste teste');
      },
    };
    registrarRotaStatusIndexacao(appComRepositorioQuebrado, () => repositorioQuebrado, {
      preHandler: async (request) => {
        request.tenantContext = criarTenantContext(TenantId.novo());
      },
    });

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a6').toString()}/indexacao/status`,
    });

    expect(resposta.statusCode).toBe(500);
    await appComRepositorioQuebrado.close();
  });
});
