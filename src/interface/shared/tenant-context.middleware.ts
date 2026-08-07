import type { preHandlerHookHandler } from 'fastify';
import {
  criarTenantContext,
  type TenantContext,
} from '../../shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../shared-kernel/tenant/tenant-id.vo.js';
import { criarVerificadorJwtCognito, extrairBearerToken } from './cognito-jwt-verifier.js';
import type { ProblemDetails } from './problem-details.schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
    papeis?: readonly string[];
  }
}

export interface TenantContextMiddlewareConfig {
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * `TenantContextMiddleware` (T005, ADR-004/ADR-005 de `specs/007-isolamento-multitenant-dados/plan.md`) —
 * plugin Fastify compartilhado por todos os Bounded Contexts. Verifica o JWT
 * Cognito, extrai a claim `custom:tenant_id`, valida como `TenantId` e popula
 * `request.tenantContext`. Requisição sem claim válida MUST retornar 401
 * Problem Details antes de qualquer código de Application ser alcançado.
 *
 * `tenantId` MUST NUNCA vir de query/path/body — única fonte legítima é esta
 * claim verificada do JWT (canal SFTP resolve `tenantId` por outro caminho,
 * fora deste middleware, ver plan.md).
 *
 * ADR-010 (`docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`)
 * estende este middleware para também popular `request.papeis` a partir da
 * claim `cognito:groups` do MESMO payload já verificado — zero segunda
 * chamada de `verify()` (ADR-007 já aceita a dupla verificação entre
 * middlewares distintos como trade-off; esta task não pode piorar isso).
 * Papel MUST NUNCA vir de body/query/header — só da claim. Token sem
 * `cognito:groups` resulta em lista vazia, nunca em erro: decidir 403 é
 * responsabilidade do guard de papel (ADR-010 T2), não deste middleware.
 */
export function criarTenantContextMiddleware(
  config: TenantContextMiddlewareConfig,
): preHandlerHookHandler {
  const verifier = criarVerificadorJwtCognito(config);

  return async (request, reply) => {
    const token = extrairBearerToken(request.headers.authorization);
    if (!token) {
      request.log.warn({ motivo: 'sem_token' }, 'TenantContextMiddleware: requisição rejeitada');
      await responderNaoAutenticado(reply, 'Header Authorization: Bearer <token> ausente');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verifier.verify(token);
    } catch {
      request.log.warn(
        { motivo: 'token_invalido' },
        'TenantContextMiddleware: requisição rejeitada',
      );
      await responderNaoAutenticado(reply, 'Token JWT inválido ou expirado');
      return;
    }

    const claimTenantId = payload['custom:tenant_id'];
    if (typeof claimTenantId !== 'string' || claimTenantId.length === 0) {
      request.log.warn(
        { motivo: 'claim_ausente' },
        'TenantContextMiddleware: requisição rejeitada',
      );
      await responderNaoAutenticado(reply, 'Claim custom:tenant_id ausente no token');
      return;
    }

    let tenantId: TenantId;
    try {
      tenantId = TenantId.de(claimTenantId);
    } catch {
      request.log.warn(
        { motivo: 'claim_invalida' },
        'TenantContextMiddleware: requisição rejeitada',
      );
      await responderNaoAutenticado(reply, 'Claim custom:tenant_id inválida');
      return;
    }

    request.tenantContext = criarTenantContext(tenantId);
    request.papeis = extrairPapeis(payload);
  };
}

function extrairPapeis(payload: Record<string, unknown>): readonly string[] {
  const grupos = payload['cognito:groups'];
  if (!Array.isArray(grupos)) {
    return [];
  }
  return grupos.filter((grupo): grupo is string => typeof grupo === 'string');
}

async function responderNaoAutenticado(
  reply: Parameters<preHandlerHookHandler>[1],
  title: string,
): Promise<void> {
  const problema: ProblemDetails = {
    type: 'https://nexo.internal/problems/nao-autenticado',
    title,
    status: 401,
  };
  await reply.status(401).type('application/problem+json').send(problema);
}
