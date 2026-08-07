import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registrarRotaFaixaPrecoCategoria } from '../../../../src/bounded-contexts/validacao/interface/http/faixa-preco-categoria.controller.js';
import type { ParametroFaixaPrecoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';

/**
 * Contract test do controller real (T044/#154), fake gateway (sem Drizzle).
 * Prova as 3 propriedades de segurança exigidas pela issue: (1) ordem dos
 * preHandlers — autenticação antes do guard, guard nega sem `request.papeis`
 * populado; (2) papel forjado no body é ignorado (só `request.papeis` conta);
 * (3) Zod na borda nunca deixa passar 500 para body malformado.
 */
class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
  private readonly faixas = new Map<string, FaixaPreco>();

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    return [...this.faixas.values()];
  }

  async upsert(faixaPreco: FaixaPreco): Promise<void> {
    this.faixas.set(faixaPreco.categoria.valor, faixaPreco);
  }
}

/** Fake de autenticação: popula `request.papeis` a partir de um array fixo — nunca do body/header da requisição. */
function criarPreHandlerFakeAuth(papeis: readonly string[]): preHandlerHookHandler {
  return async (request) => {
    request.papeis = papeis;
  };
}

const BODY_VALIDO = {
  categoria: 'embalagens',
  precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
  precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
};

describe('POST/GET /v1/configuracoes/faixas-preco-categoria — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let gateway: ParametroFaixaPrecoGatewayFake;

  beforeEach(() => {
    gateway = new ParametroFaixaPrecoGatewayFake();
  });

  afterEach(async () => {
    await app.close();
  });

  function montarApp(opts: Parameters<typeof registrarRotaFaixaPrecoCategoria>[2] = {}) {
    app = Fastify();
    registrarRotaFaixaPrecoCategoria(app, gateway, opts);
    return app;
  }

  it('POST 201 — papel compliance-admin autoriza e persiste via gateway', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['compliance-admin']) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual(BODY_VALIDO);
    expect(await gateway.listarTodas()).toHaveLength(1);
  });

  it('GET 200 — papel compliance-admin autoriza leitura do catálogo', async () => {
    await gateway.upsert(
      FaixaPreco.de(
        CategoriaItem.de('embalagens'),
        Dinheiro.de(400, 'BRL'),
        Dinheiro.de(1200, 'BRL'),
      ),
    );
    montarApp({ preHandler: criarPreHandlerFakeAuth(['compliance-admin']) });

    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/configuracoes/faixas-preco-categoria',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([BODY_VALIDO]);
  });

  it('POST 403 Problem Details — autenticado, mas sem papel compliance-admin', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['comprador-responsavel']) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toEqual({
      type: 'https://nexo.internal/problems/sem-permissao',
      title: 'Papel insuficiente para esta ação',
      status: 403,
    });
    expect(await gateway.listarTodas()).toHaveLength(0);
  });

  it('GET 403 Problem Details — papel também exigido na leitura (plan.md agrupa POST/GET)', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['comprador-responsavel']) });

    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/configuracoes/faixas-preco-categoria',
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('POST 403 — rota sem autenticação nenhuma (opts.preHandler ausente) nega fail-closed, nunca 200 por omissão', async () => {
    montarApp({});

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(403);
    expect(await gateway.listarTodas()).toHaveLength(0);
  });

  it('POST 403 — papel forjado no body é ignorado; só request.papeis (fonte de autenticação) autoriza', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['comprador-responsavel']) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: { ...BODY_VALIDO, papel: 'compliance-admin', papeis: ['compliance-admin'] },
    });

    expect(resposta.statusCode).toBe(403);
    expect(await gateway.listarTodas()).toHaveLength(0);
  });

  it('preHandlers executam em ordem: autenticação (externa) roda antes do guard, populando request.papeis a tempo', async () => {
    const ordem: string[] = [];
    const autenticacaoQueRegistraOrdem: preHandlerHookHandler = async (request) => {
      ordem.push('autenticacao');
      request.papeis = ['compliance-admin'];
    };
    montarApp({ preHandler: autenticacaoQueRegistraOrdem });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: BODY_VALIDO,
    });

    expect(ordem).toEqual(['autenticacao']);
    expect(resposta.statusCode).toBe(201);
  });

  it('POST 400 Problem Details — body inválido (categoria vazia) nunca chega a 500', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['compliance-admin']) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: { ...BODY_VALIDO, categoria: '' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('POST 400 Problem Details — precoMinimo maior que precoMaximo (erro de domínio) nunca 500', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['compliance-admin']) });

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: {
        categoria: 'embalagens',
        precoMinimo: { valorCentavos: 1200, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 400, moeda: 'BRL' },
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      type: 'https://nexo.internal/problems/faixa-preco-invalida',
      title: 'Faixa de preço inválida',
      status: 400,
    });
  });

  it('POST upsert — segunda escrita da mesma categoria sobrescreve, GET não duplica linha', async () => {
    montarApp({ preHandler: criarPreHandlerFakeAuth(['compliance-admin']) });

    await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: BODY_VALIDO,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      payload: { ...BODY_VALIDO, precoMaximo: { valorCentavos: 1500, moeda: 'BRL' } },
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/configuracoes/faixas-preco-categoria',
    });

    const lista = resposta.json();
    expect(lista).toHaveLength(1);
    expect(lista[0].precoMaximo.valorCentavos).toBe(1500);
  });
});
