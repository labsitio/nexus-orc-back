import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos controllers REST deste contexto (`status`,
 * `revisao-humana`) — hoje só o `preHandler` de autenticação (ADR-017,
 * `criarTenantContextMiddleware`), injetado pela composição raiz do handler
 * Lambda; sem `preHandler`, a rota fica sem autenticação (usado pelos testes
 * de contrato). Mesmo padrão de `ingestao-identificacao/interface/http/route-opts.ts`.
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler;
}
