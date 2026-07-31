import { describe, expect, it, vi } from 'vitest';
import {
  criarVerificadorJwtCognito,
  extrairBearerToken,
} from '../../../src/interface/shared/cognito-jwt-verifier.js';

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

describe('extrairBearerToken', () => {
  it('extrai o token quando o header tem prefixo Bearer', () => {
    expect(extrairBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('retorna undefined sem header', () => {
    expect(extrairBearerToken(undefined)).toBeUndefined();
  });

  it('retorna undefined sem o prefixo Bearer', () => {
    expect(extrairBearerToken('Basic abc123')).toBeUndefined();
  });
});

describe('criarVerificadorJwtCognito', () => {
  it('configura o CognitoJwtVerifier com tokenUse=access por padrão', () => {
    criarVerificadorJwtCognito({ userPoolId: 'us-east-1_x', clientId: 'client-x' });

    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_x',
      tokenUse: 'access',
      clientId: 'client-x',
    });
  });

  it('delega verify() ao CognitoJwtVerifier subjacente', async () => {
    mockVerify.mockResolvedValue({ sub: 'usuario-1' });
    const verificador = criarVerificadorJwtCognito({ userPoolId: 'us-east-1_x', clientId: 'client-x' });

    const payload = await verificador.verify('token-valido');

    expect(mockVerify).toHaveBeenCalledWith('token-valido');
    expect(payload).toEqual({ sub: 'usuario-1' });
  });
});
