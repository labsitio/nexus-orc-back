import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  eventoV2ParaInject,
  respostaInjectParaApiGatewayV2,
} from '../../../src/interface/shared/api-gateway-v2-fastify.adapter.js';

function eventoBase(sobrescritas: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /v1/orcamentos',
    rawPath: '/v1/orcamentos',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    isBase64Encoded: false,
    requestContext: {
      http: {
        method: 'POST',
        path: '/v1/orcamentos',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'teste',
      },
    } as APIGatewayProxyEventV2['requestContext'],
    ...sobrescritas,
  } as APIGatewayProxyEventV2;
}

function appEcoando() {
  const app = Fastify();
  app.all('/v1/orcamentos', async (request, reply) => {
    reply.header('x-eco-query', JSON.stringify(request.query));
    reply.header('x-eco-cookie', request.headers.cookie ?? '');
    reply.status(200).send({ recebido: request.body ?? null });
  });
  return app;
}

describe('eventoV2ParaInject', () => {
  it('traduz método, path e query string vazia', () => {
    const evento = eventoBase();

    const opcoes = eventoV2ParaInject(evento);

    expect(opcoes.method).toBe('POST');
    expect(opcoes.url).toBe('/v1/orcamentos');
    expect(opcoes.payload).toBeUndefined();
  });

  it('traduz rawQueryString não vazia para a url de inject()', () => {
    const evento = eventoBase({ rawQueryString: 'status=pendente&pagina=2' });

    const opcoes = eventoV2ParaInject(evento);

    expect(opcoes.url).toBe('/v1/orcamentos?status=pendente&pagina=2');
  });

  it('body ausente não gera payload', () => {
    const evento = eventoBase({ body: undefined });

    const opcoes = eventoV2ParaInject(evento);

    expect(opcoes.payload).toBeUndefined();
  });

  it('body texto é repassado como string', () => {
    const evento = eventoBase({ body: '{"foo":"bar"}' });

    const opcoes = eventoV2ParaInject(evento);

    expect(opcoes.payload).toBe('{"foo":"bar"}');
  });

  it('body base64 é decodificado para Buffer', () => {
    const original = Buffer.from('conteudo binário simulado', 'utf8');
    const evento = eventoBase({ body: original.toString('base64'), isBase64Encoded: true });

    const opcoes = eventoV2ParaInject(evento);

    expect(Buffer.isBuffer(opcoes.payload)).toBe(true);
    expect((opcoes.payload as Buffer).toString('utf8')).toBe('conteudo binário simulado');
  });

  it('cookies (header multi-valor v2) viram header Cookie único', () => {
    const evento = eventoBase({ cookies: ['a=1', 'b=2'] });

    const opcoes = eventoV2ParaInject(evento);

    expect((opcoes.headers as Record<string, string>).cookie).toBe('a=1; b=2');
  });

  it('resultado alimenta app.inject() de ponta a ponta', async () => {
    const app = appEcoando();
    const evento = eventoBase({
      rawQueryString: 'x=1',
      body: JSON.stringify({ valor: 42 }),
      headers: { 'content-type': 'application/json' },
    });

    const resposta = await app.inject(eventoV2ParaInject(evento));

    expect(resposta.statusCode).toBe(200);
    expect(JSON.parse(resposta.body)).toEqual({ recebido: { valor: 42 } });
    await app.close();
  });
});

describe('respostaInjectParaApiGatewayV2', () => {
  it('traduz statusCode, headers e body simples', async () => {
    const app = Fastify();
    app.get('/simples', async (_request, reply) => reply.status(201).send({ ok: true }));

    const resposta = await app.inject({ method: 'GET', url: '/simples' });
    const resultado = respostaInjectParaApiGatewayV2(resposta);

    expect(resultado.statusCode).toBe(201);
    expect(resultado.body).toBe(JSON.stringify({ ok: true }));
    expect(resultado.headers?.['content-type']).toContain('application/json');
    await app.close();
  });

  it('agrupa set-cookie (header multi-valor) em cookies, fora de headers', async () => {
    const app = Fastify();
    app.get('/com-cookie', async (_request, reply) => {
      reply.header('set-cookie', ['a=1', 'b=2']);
      reply.status(200).send({});
    });

    const resposta = await app.inject({ method: 'GET', url: '/com-cookie' });
    const resultado = respostaInjectParaApiGatewayV2(resposta);

    expect(resultado.cookies).toEqual(['a=1', 'b=2']);
    expect(resultado.headers).not.toHaveProperty('set-cookie');
    await app.close();
  });

  it('sem set-cookie, cookies fica ausente no resultado', async () => {
    const app = Fastify();
    app.get('/sem-cookie', async (_request, reply) => reply.status(204).send());

    const resposta = await app.inject({ method: 'GET', url: '/sem-cookie' });
    const resultado = respostaInjectParaApiGatewayV2(resposta);

    expect(resultado.cookies).toBeUndefined();
    await app.close();
  });
});
