import { CognitoJwtVerifier } from 'aws-jwt-verify';

/**
 * ADR-007 (`specs/007-isolamento-multitenant-dados/plan.md`) — única fonte de
 * verdade da construção do `CognitoJwtVerifier` e do parsing de `Bearer
 * <token>`, consumida por todo middleware de autenticação Cognito neste
 * projeto (`tenant-context.middleware.ts`, `auth-cognito.middleware.ts`).
 * Evita drift de config/lógica de verificação entre múltiplos middlewares
 * que instanciariam o verifier de forma independente. Não elimina a dupla
 * verificação em runtime quando mais de um middleware roda na mesma rota —
 * ver ADR-007 para o trade-off aceito.
 */
export interface CognitoVerifierConfig {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly tokenUse?: 'access' | 'id';
}

export interface CognitoTokenVerifier {
  verify(token: string): Promise<Record<string, unknown>>;
}

export function criarVerificadorJwtCognito(config: CognitoVerifierConfig): CognitoTokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: config.tokenUse ?? 'access',
    clientId: config.clientId,
  });
  return {
    verify: (token) => verifier.verify(token) as Promise<Record<string, unknown>>,
  };
}

export function extrairBearerToken(authorizationHeader: string | undefined): string | undefined {
  return authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : undefined;
}
