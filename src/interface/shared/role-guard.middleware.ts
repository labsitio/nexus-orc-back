import type { preHandlerHookHandler } from 'fastify';
import type { ProblemDetails } from './problem-details.schema.js';

/**
 * `criarExigenciaPapel` (ADR-010 T2,
 * `docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`) —
 * guard de autorização por papel. NÃO verifica JWT: consome exclusivamente
 * `request.papeis`, já populado por `TenantContextMiddleware` a partir da
 * claim `cognito:groups` do token verificado (ADR-010 T1, mesmo `verify()`).
 * Uma 2ª verificação de token aqui foi a alternativa D descartada pelo ADR.
 *
 * Requisição sem `request.papeis` (rota sem `TenantContextMiddleware`) MUST
 * ser negada — padrão seguro; permitir por omissão seria bypass silencioso.
 *
 * Não autenticado (401) é responsabilidade do middleware de auth, não deste
 * guard: aqui o caso tratado é sempre "autenticado, papel insuficiente".
 */
export function criarExigenciaPapel(papeisPermitidos: readonly string[]): preHandlerHookHandler {
  return async (request, reply) => {
    const papeisDoUsuario = request.papeis ?? [];
    const autorizado = papeisDoUsuario.some((papel) => papeisPermitidos.includes(papel));

    if (!autorizado) {
      const problema: ProblemDetails = {
        type: 'https://nexo.internal/problems/sem-permissao',
        title: 'Papel insuficiente para esta ação',
        status: 403,
      };
      await reply.status(403).type('application/problem+json').send(problema);
    }
  };
}
