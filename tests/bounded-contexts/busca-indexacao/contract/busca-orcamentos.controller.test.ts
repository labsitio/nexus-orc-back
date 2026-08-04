import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registrarRotaBuscaOrcamentos } from '../../../../src/bounded-contexts/busca-indexacao/interface/http/busca-orcamentos.controller.js';
import type { AgenteInterpretadorConsultaGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-interpretador-consulta.gateway.js';
import type { AgenteEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import type { IndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { CriterioBusca } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.js';
import { Embedding } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import {
  ResultadoBusca,
  ResultadoBuscaInvalidoError,
} from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/** Contract test do controller real (T039/#199) — gateways/repositório fakes, sem Bedrock/Drizzle reais. */
class InterpretadorConsultaFake implements AgenteInterpretadorConsultaGateway {
  async interpretar(): Promise<CriterioBusca> {
    return CriterioBusca.de({ textoLivreResidual: '' });
  }
}

class EmbeddingGatewayFake implements AgenteEmbeddingGateway {
  async gerarEmbedding(): Promise<Embedding> {
    return Embedding.de({
      vetor: [0.1, 0.2],
      dimensao: 2,
      modeloId: 'amazon.titan-embed-text-v2:0',
      geradoEm: new Date('2026-07-30T14:06:00.000Z'),
    });
  }
}

function orcamentoResultado(sufixo: string, score: number): ResultadoBusca {
  return ResultadoBusca.de({
    orcamentoId: OrcamentoId.de(`01890a5d-ac96-774b-bcce-b02c8f2726${sufixo}`),
    scoreRelevancia: score,
  });
}

class IndiceOrcamentoRepositoryFake implements IndiceOrcamentoRepository {
  constructor(private readonly resultados: readonly ResultadoBusca[] = []) {}

  async upsert(): Promise<void> {
    throw new Error('busca nunca escreve');
  }

  async buscarPorOrcamentoId(): Promise<undefined> {
    return undefined;
  }

  async buscarPorCriterioEVetor(
    _criterio: CriterioBusca,
    _vetorConsulta: unknown,
    limite: number,
  ): Promise<readonly ResultadoBusca[]> {
    return this.resultados.slice(0, limite);
  }
}

/** Simula um dado corrompido vindo da Infrastructure (score fora de [0,1]). */
class IndiceOrcamentoRepositoryQuebradoFake implements IndiceOrcamentoRepository {
  async upsert(): Promise<void> {
    throw new Error('não usado neste teste');
  }

  async buscarPorOrcamentoId(): Promise<undefined> {
    return undefined;
  }

  async buscarPorCriterioEVetor(): Promise<never> {
    throw new ResultadoBuscaInvalidoError('scoreRelevancia deve estar entre 0 e 1, recebido 1.5');
  }
}

describe('POST /v1/orcamentos/busca — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: IndiceOrcamentoRepositoryFake;
  let tenantId: TenantId;

  const montarApp = (resultados: readonly ResultadoBusca[]) => {
    repositorio = new IndiceOrcamentoRepositoryFake(resultados);
    tenantId = TenantId.novo();
    const instancia = Fastify();
    registrarRotaBuscaOrcamentos(
      instancia,
      {
        interpretador: new InterpretadorConsultaFake(),
        embeddingGateway: new EmbeddingGatewayFake(),
        criarRepositorio: () => repositorio,
        catalogoCategorias: ['ferragens', 'eletrica'],
      },
      {
        preHandler: async (request) => {
          request.tenantContext = criarTenantContext(tenantId);
        },
      },
    );
    return instancia;
  };

  beforeEach(() => {
    app = montarApp([orcamentoResultado('a1', 0.9), orcamentoResultado('a2', 0.5)]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 com resultados ordenados, metadados de paginação e temProximaPagina=false quando a janela veio incompleta', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'parafuso sextavado' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      resultados: [
        {
          orcamentoId: '01890a5d-ac96-774b-bcce-b02c8f2726a1',
          scoreRelevancia: 0.9,
        },
        {
          orcamentoId: '01890a5d-ac96-774b-bcce-b02c8f2726a2',
          scoreRelevancia: 0.5,
        },
      ],
      pagina: 1,
      tamanhoPagina: 20,
      totalAproximado: 2,
      temProximaPagina: false,
    });
  });

  it('aplica pagina/tamanhoPagina fatiando o resultado sobre-buscado e sinaliza temProximaPagina=true quando a janela veio saturada', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'parafuso', pagina: 2, tamanhoPagina: 1 },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.resultados).toEqual([
      { orcamentoId: '01890a5d-ac96-774b-bcce-b02c8f2726a2', scoreRelevancia: 0.5 },
    ]);
    expect(corpo.pagina).toBe(2);
    expect(corpo.tamanhoPagina).toBe(1);
    // limiteSobreBusca = pagina(2)*tamanhoPagina(1) = 2, repositório tem 2 resultados
    // disponíveis -> janela saturada -> não dá para provar que não há mais.
    expect(corpo.temProximaPagina).toBe(true);
  });

  it('401 Problem Details quando TenantContextMiddleware não popula request.tenantContext', async () => {
    const appSemMiddleware = Fastify();
    registrarRotaBuscaOrcamentos(appSemMiddleware, {
      interpretador: new InterpretadorConsultaFake(),
      embeddingGateway: new EmbeddingGatewayFake(),
      criarRepositorio: () => repositorio,
      catalogoCategorias: [],
    });

    const resposta = await appSemMiddleware.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'qualquer coisa' },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await appSemMiddleware.close();
  });

  it('400 Problem Details para body inválido (tamanhoPagina acima do teto)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'x', tamanhoPagina: 101 },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details quando apenas periodoInicio é informado sem periodoFim', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'x', periodoInicio: '2026-01-01' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('400 Problem Details quando precoMinimo e precoMaximo explícitos estão em moedas diferentes (CriterioBuscaInvalidoError)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: {
        consulta: 'x',
        precoMinimo: { valorCentavos: 100, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 200, moeda: 'USD' },
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details quando moeda é só espaços em branco — passa no Zod (min(1)) mas falha em Dinheiro.de (DinheiroInvalidoError)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: {
        consulta: 'x',
        precoMinimo: { valorCentavos: 100, moeda: '   ' },
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details quando o repositório propaga ResultadoBuscaInvalidoError (dado corrompido da Infra, nunca 500)', async () => {
    const appComRepositorioQuebrado = Fastify();
    registrarRotaBuscaOrcamentos(
      appComRepositorioQuebrado,
      {
        interpretador: new InterpretadorConsultaFake(),
        embeddingGateway: new EmbeddingGatewayFake(),
        criarRepositorio: () => new IndiceOrcamentoRepositoryQuebradoFake(),
        catalogoCategorias: [],
      },
      {
        preHandler: async (request) => {
          request.tenantContext = criarTenantContext(TenantId.novo());
        },
      },
    );

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'x' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await appComRepositorioQuebrado.close();
  });

  it('nunca mistura resultado de outro tenant — repositório é reconstruído por requisição via criarRepositorio(tenantContext)', async () => {
    const outroTenant = TenantId.novo();
    let tenantRecebido: TenantId | undefined;
    const appIsolado = Fastify();
    registrarRotaBuscaOrcamentos(
      appIsolado,
      {
        interpretador: new InterpretadorConsultaFake(),
        embeddingGateway: new EmbeddingGatewayFake(),
        criarRepositorio: (tenantContext) => {
          tenantRecebido = tenantContext.tenantId;
          return new IndiceOrcamentoRepositoryFake([]);
        },
        catalogoCategorias: [],
      },
      {
        preHandler: async (request) => {
          request.tenantContext = criarTenantContext(outroTenant);
        },
      },
    );

    await appIsolado.inject({
      method: 'POST',
      url: '/v1/orcamentos/busca',
      payload: { consulta: 'x' },
    });

    expect(tenantRecebido).toBe(outroTenant);
    await appIsolado.close();
  });
});
