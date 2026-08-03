import type { preHandlerHookHandler } from 'fastify';

/**
 * Opções comuns aos controllers REST deste contexto — hoje só o
 * `preHandler` de autenticação Cognito (T027, `criarAutenticacaoCognito`),
 * injetado pela composição raiz do handler Lambda; sem `preHandler`, a rota
 * fica sem autenticação (usado pelos testes de contrato). Mesmo padrão de
 * `ingestao-identificacao/interface/http/route-opts.ts`.
 */
export interface RotaOpts {
  readonly preHandler?: preHandlerHookHandler;
}
