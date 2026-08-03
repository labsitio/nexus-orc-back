import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos controllers REST deste contexto — hoje só o
 * `preHandler` de tenant/autenticação (`TenantContextMiddleware`
 * compartilhado, spec 007/ADR-005), injetado pela composição raiz do
 * handler Lambda; sem `preHandler`, a rota fica sem autenticação (usado
 * pelos testes de contrato). Mesmo padrão de
 * `validacao/interface/http/route-opts.ts`.
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler;
}
