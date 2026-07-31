import { describe, expect, it } from 'vitest';
import { TenantId, TenantIdInvalidoError } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';

describe('TenantId', () => {
  it('gera um UUID v7 válido', () => {
    const id = TenantId.novo();
    expect(() => TenantId.de(id.toString())).not.toThrow();
    expect(id.toString()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('aceita UUID v7 explícito', () => {
    const valor = '018f4b1a-0000-7000-8000-000000000000';
    expect(TenantId.de(valor).toString()).toBe(valor);
  });

  it('rejeita string que não é UUID v7', () => {
    expect(() => TenantId.de('não-e-um-uuid')).toThrow(TenantIdInvalidoError);
  });

  it('rejeita UUID v4 (version nibble errado)', () => {
    expect(() => TenantId.de('018f4b1a-0000-4000-8000-000000000000')).toThrow(
      TenantIdInvalidoError,
    );
  });

  it('equals compara por valor', () => {
    const valor = '018f4b1a-0000-7000-8000-000000000000';
    expect(TenantId.de(valor).equals(TenantId.de(valor))).toBe(true);
  });
});
