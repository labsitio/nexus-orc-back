import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { preHandlerHookHandler } from 'fastify';
import type { ProblemDetails } from './status.schema.js';

export interface AutenticacaoCognitoConfig {
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * Autenticação Cognito JWT (T025/#30) — os 3 endpoints REST deste contexto
 * (`upload-url`, `confirmar-upload`, `status`) exigem `Authorization: Bearer
 * <access token>`, verificado contra o User Pool. SFTP autentica via AWS
 * Transfer Family (chave SSH/usuário próprio), isolado de Cognito — nunca
 * passa por este middleware (plan.md).
 */
export function criarAutenticacaoCognito(config: AutenticacaoCognitoConfig): preHandlerHookHandler {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: 'access',
    clientId: config.clientId,
  });

  return async (request, reply) => {
    const cabecalho = request.headers.authorization;
    const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length) : undefined;
    if (!token) {
      const problema: ProblemDetails = {
        type: 'https://nexo.internal/problems/nao-autenticado',
        title: 'Header Authorization: Bearer <token> ausente',
        status: 401,
      };
      await reply.status(401).type('application/problem+json').send(problema);
      return;
    }

    try {
      await verifier.verify(token);
    } catch {
      const problema: ProblemDetails = {
        type: 'https://nexo.internal/problems/nao-autenticado',
        title: 'Token JWT inválido ou expirado',
        status: 401,
      };
      await reply.status(401).type('application/problem+json').send(problema);
    }
  };
}
