import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos 3 controllers REST deste contexto — hoje só o
 * `preHandler` de autenticação (ADR-017, `criarTenantContextMiddleware`),
 * injetado pela composição raiz do handler Lambda; sem `preHandler`, a rota
 * fica sem autenticação (usado pelos testes de contrato).
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler;
}
