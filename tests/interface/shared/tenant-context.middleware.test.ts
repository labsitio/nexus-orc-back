import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarTenantContextMiddleware } from '../../../src/interface/shared/tenant-context.middleware.js';

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

const TENANT_ID_VALIDO = '018f4e2a-70b1-7f3c-8a2d-abcdef123456';

function appComRotaProtegida() {
  const app = Fastify();
  const preHandler = criarTenantContextMiddleware({
    userPoolId: 'us-east-1_teste',
    clientId: 'client-teste',
  });
  app.get('/protegida', { preHandler }, async (request, reply) =>
    reply.status(200).send({
      tenantId: request.tenantContext?.tenantId.toString(),
      papeis: request.papeis,
    }),
  );
  return app;
}

describe('criarTenantContextMiddleware', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCreate.mockClear();
  });

  it('401 Problem Details sem header Authorization', async () => {
    const app = appComRotaProtegida();

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(mockVerify).not.toHaveBeenCalled();
    await app.close();
  });

  it('401 Problem Details quando o token é inválido/expirado', async () => {
    mockVerify.mockRejectedValue(new Error('token expirado'));
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-invalido' },
    });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it('401 Problem Details quando o token não tem a claim custom:tenant_id', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1' });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-sem-claim' },
    });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it('401 Problem Details quando custom:tenant_id não é um TenantId válido (UUID v7)', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1', 'custom:tenant_id': 'nao-e-uuid' });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-claim-invalida' },
    });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it('200 e popula request.tenantContext quando a claim é válida', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1', 'custom:tenant_id': TENANT_ID_VALIDO });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ tenantId: TENANT_ID_VALIDO, papeis: [] });
    await app.close();
  });

  it('ignora tenantId vindo de query param — só usa a claim do JWT', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1', 'custom:tenant_id': TENANT_ID_VALIDO });
    const app = appComRotaProtegida();

    const outroTenantForjado = '018f4e2a-70b1-7f3c-8a2d-000000000000';
    const resposta = await app.inject({
      method: 'GET',
      url: `/protegida?tenantId=${outroTenantForjado}`,
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ tenantId: TENANT_ID_VALIDO, papeis: [] });
    await app.close();
  });

  it('popula request.papeis a partir da claim cognito:groups do payload já verificado', async () => {
    mockVerify.mockResolvedValue({
      sub: 'usuario-1',
      'custom:tenant_id': TENANT_ID_VALIDO,
      'cognito:groups': ['comprador-responsavel', 'admin'],
    });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      tenantId: TENANT_ID_VALIDO,
      papeis: ['comprador-responsavel', 'admin'],
    });
    expect(mockVerify).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('lista vazia quando o token não tem cognito:groups — não lança erro', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1', 'custom:tenant_id': TENANT_ID_VALIDO });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().papeis).toEqual([]);
    await app.close();
  });

  it('ignora papel forjado no body — só usa a claim cognito:groups do JWT', async () => {
    mockVerify.mockResolvedValue({
      sub: 'usuario-1',
      'custom:tenant_id': TENANT_ID_VALIDO,
      'cognito:groups': ['leitor'],
    });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-valido' },
      payload: { papeis: ['admin'] },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().papeis).toEqual(['leitor']);
    await app.close();
  });
});
