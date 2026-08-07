import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarExigenciaPapel } from '../../../src/interface/shared/role-guard.middleware.js';

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

describe('criarExigenciaPapel', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCreate.mockClear();
  });

  it('200 quando request.papeis contém um dos papéis permitidos', async () => {
    const app = Fastify();
    app.get(
      '/protegida',
      { preHandler: criarExigenciaPapel(['comprador-responsavel', 'compliance-admin']) },
      async (request, reply) => reply.status(200).send({ ok: true }),
    );
    app.addHook('preHandler', async (request) => {
      request.papeis = ['comprador-responsavel'];
    });

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it('403 Problem Details idêntico ao openapi.yaml quando autenticado sem papel permitido', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.papeis = ['papel-qualquer'];
    });
    app.get(
      '/protegida',
      { preHandler: criarExigenciaPapel(['comprador-responsavel', 'compliance-admin']) },
      async (_request, reply) => reply.status(200).send({ ok: true }),
    );

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toEqual({
      type: 'https://nexo.internal/problems/sem-permissao',
      title: 'Papel insuficiente para esta ação',
      status: 403,
    });
    await app.close();
  });

  it('403 quando request.papeis é undefined (rota sem TenantContextMiddleware) — nega por padrão', async () => {
    const app = Fastify();
    app.get(
      '/protegida',
      { preHandler: criarExigenciaPapel(['comprador-responsavel']) },
      async (_request, reply) => reply.status(200).send({ ok: true }),
    );

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(403);
    await app.close();
  });

  it('403 quando request.papeis é lista vazia', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.papeis = [];
    });
    app.get(
      '/protegida',
      { preHandler: criarExigenciaPapel(['comprador-responsavel']) },
      async (_request, reply) => reply.status(200).send({ ok: true }),
    );

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(403);
    await app.close();
  });

  it('nunca chama verify() de JWT — o guard só consome request.papeis, não faz 2ª verificação de token', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.papeis = ['comprador-responsavel'];
    });
    app.get(
      '/protegida',
      { preHandler: criarExigenciaPapel(['comprador-responsavel']) },
      async (_request, reply) => reply.status(200).send({ ok: true }),
    );

    await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer qualquer' },
    });

    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });
});
