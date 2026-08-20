import { CognitoJwtVerifier } from 'aws-jwt-verify';

/**
 * ADR-007 (`specs/007-isolamento-multitenant-dados/plan.md`) — única fonte de
 * verdade da construção do `CognitoJwtVerifier` e do parsing de `Bearer
 * <token>`, consumida por `tenant-context.middleware.ts` — único ponto de
 * verificação de JWT Cognito neste projeto (ADR-017: autenticação 100% na
 * Lambda, sem authorizer no API Gateway). ADR-007 registra o trade-off da
 * dupla verificação já descartado por ADR-010.
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
