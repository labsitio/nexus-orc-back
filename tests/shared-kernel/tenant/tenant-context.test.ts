import { describe, expect, it } from 'vitest';
import { TenantId } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { criarTenantContext } from '../../../src/shared-kernel/tenant/tenant-context.js';

describe('TenantContext', () => {
  it('carrega o TenantId informado', () => {
    const tenantId = TenantId.novo();
    const ctx = criarTenantContext(tenantId);
    expect(ctx.tenantId).toBe(tenantId);
  });

  it('é imutável em runtime (congelado)', () => {
    const ctx = criarTenantContext(TenantId.novo());
    expect(() => {
      // @ts-expect-error tenantId é readonly — tentativa deliberada de mutação em runtime
      ctx.tenantId = TenantId.novo();
    }).toThrow(TypeError);
  });

  it('cada chamada produz uma instância independente — sem estado global compartilhado entre requisições', () => {
    const ctxA = criarTenantContext(TenantId.novo());
    const ctxB = criarTenantContext(TenantId.novo());

    expect(ctxA).not.toBe(ctxB);
    expect(ctxA.tenantId).not.toBe(ctxB.tenantId);
  });
});
