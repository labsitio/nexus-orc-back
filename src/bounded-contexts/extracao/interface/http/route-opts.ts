import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos controllers REST deste contexto — hoje só o
 * `preHandler` de autenticação (T025), injetado pela composição raiz do
 * handler Lambda; sem `preHandler`, a rota fica sem autenticação (usado
 * pelos testes de contrato). Réplica mecânica de
 * `ingestao-identificacao/interface/http/route-opts.ts` (spec 001).
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler;
}
