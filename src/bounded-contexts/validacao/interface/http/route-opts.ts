import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos controllers REST deste contexto — hoje o `preHandler`
 * de autenticação Cognito (ADR-017, `criarTenantContextMiddleware`), injetado
 * pela composição raiz do handler Lambda; sem `preHandler`, a rota fica sem
 * autenticação (usado pelos testes de contrato). Mesmo padrão de
 * `ingestao-identificacao/interface/http/route-opts.ts`.
 *
 * Aceita array (ADR-010 T3,
 * `docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`):
 * composição por rota — ex. `[criarTenantContextMiddleware(...), criarExigenciaPapel([...])]`
 * — repassada como está para `opts.preHandler` do Fastify, que já executa a
 * lista em ordem nativamente.
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler | preHandlerHookHandler[];
}
