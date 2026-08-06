import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarAutenticacaoCognito } from '../../../../../src/bounded-contexts/orquestracao/interface/http/auth-cognito.middleware.js';

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

function appComRotaProtegida() {
  const app = Fastify();
  const preHandler = criarAutenticacaoCognito({
    userPoolId: 'us-east-1_teste',
    clientId: 'client-teste',
  });
  app.get('/protegida', { preHandler }, async (_request, reply) =>
    reply.status(200).send({ ok: true }),
  );
  return app;
}

describe('criarAutenticacaoCognito (orquestracao)', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCreate.mockClear();
  });

  it('configura o CognitoJwtVerifier com userPoolId/clientId/tokenUse=access', () => {
    criarAutenticacaoCognito({ userPoolId: 'us-east-1_x', clientId: 'client-x' });

    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_x',
      tokenUse: 'access',
      clientId: 'client-x',
    });
  });

  it('401 Problem Details sem header Authorization', async () => {
    const app = appComRotaProtegida();

    const resposta = await app.inject({ method: 'GET', url: '/protegida' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(mockVerify).not.toHaveBeenCalled();
    await app.close();
  });

  it('401 Problem Details com Authorization sem prefixo Bearer', async () => {
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Basic xyz' },
    });

    expect(resposta.statusCode).toBe(401);
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
    expect(mockVerify).toHaveBeenCalledWith('token-invalido');
    await app.close();
  });

  it('200 e chega ao handler quando o token é válido', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1' });
    const app = appComRotaProtegida();

    const resposta = await app.inject({
      method: 'GET',
      url: '/protegida',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true });
  });
});
