import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * `api-gateway-v2-fastify.adapter` (issue #756, ADR-017) — traduz o envelope
 * HTTP API payload v2 do API Gateway para `app.inject()` do Fastify e de
 * volta, sem `@fastify/aws-lambda` (descartado no ADR). Cada Lambda de rota
 * monta um Fastify mínimo e delega para este par de funções; nenhuma delas
 * lida com autenticação — `tenantId`/papel continuam vindo exclusivamente da
 * claim verificada dentro da própria Lambda.
 */
export function eventoV2ParaInject(evento: APIGatewayProxyEventV2): InjectOptions {
  const query = evento.rawQueryString.length > 0 ? `?${evento.rawQueryString}` : '';
  const headers: Record<string, string> = Object.fromEntries(
    Object.entries(evento.headers).filter(
      (entrada): entrada is [string, string] => entrada[1] !== undefined,
    ),
  );
  if (evento.cookies && evento.cookies.length > 0) {
    headers.cookie = evento.cookies.join('; ');
  }

  return {
    method: evento.requestContext.http.method as InjectOptions['method'],
    url: `${evento.rawPath}${query}`,
    headers,
    ...(evento.body === undefined
      ? {}
      : { payload: evento.isBase64Encoded ? Buffer.from(evento.body, 'base64') : evento.body }),
  };
}

export function respostaInjectParaApiGatewayV2(
  resposta: LightMyRequestResponse,
): APIGatewayProxyStructuredResultV2 {
  const headers: Record<string, string> = {};
  const cookies: string[] = [];

  for (const [nome, valor] of Object.entries(resposta.headers)) {
    if (valor === undefined) {
      continue;
    }
    if (nome.toLowerCase() === 'set-cookie') {
      cookies.push(...(Array.isArray(valor) ? valor.map(String) : [String(valor)]));
      continue;
    }
    headers[nome] = Array.isArray(valor) ? valor.join(', ') : String(valor);
  }

  // ponytail: nenhuma rota das 12 do ADR-017 responde binário — `light-my-request`
  // já decodifica `resposta.body` como string utf8, então `isBase64Encoded` nunca
  // é setado aqui. Se uma rota futura precisar de corpo binário, usar
  // `resposta.rawPayload` (Buffer) e emitir `isBase64Encoded: true`.
  return {
    statusCode: resposta.statusCode,
    headers,
    body: resposta.body,
    ...(cookies.length > 0 ? { cookies } : {}),
  };
}
