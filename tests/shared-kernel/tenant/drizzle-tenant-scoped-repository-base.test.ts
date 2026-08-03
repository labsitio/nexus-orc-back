import { StringChunk, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { DrizzleTenantScopedRepositoryBase } from '../../../src/shared-kernel/tenant/drizzle-tenant-scoped-repository-base.js';
import { criarTenantContext } from '../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Extrai os valores interpolados (não-literais) de uma query `sql\`...\`` — o
 * template tag do Drizzle empurra o valor de `${...}` cru em `queryChunks`
 * (só vira `Param` mais tarde, ao montar a query final para o driver), então
 * basta filtrar fora os `StringChunk` (literais do template).
 */
function valoresInterpolados(query: SQL): unknown[] {
  return query.queryChunks.filter((chunk) => !(chunk instanceof StringChunk));
}

/** Concatena os literais SQL (`StringChunk`) de uma query, para asserções de texto sem depender de driver real. */
function textoLiteral(query: SQL): string {
  return query.queryChunks
    .filter((chunk): chunk is StringChunk => chunk instanceof StringChunk)
    .flatMap((chunk) => chunk.value)
    .join('');
}

class RepositorioDeTeste extends DrizzleTenantScopedRepositoryBase {
  constructor(db: NodePgDatabase, tenantContext: ReturnType<typeof criarTenantContext>) {
    super(db, tenantContext);
  }

  async executar<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return this.transacaoTenantScoped(fn as never);
  }
}

type TxFake = { execute: ReturnType<typeof vi.fn> };

function criarDbFake(tx: TxFake) {
  return {
    transaction: vi.fn(async (callback: (tx: TxFake) => unknown) => callback(tx)),
  } as unknown as NodePgDatabase;
}

describe('DrizzleTenantScopedRepositoryBase', () => {
  it('executa set_config com o tenantId do TenantContext antes de chamar o callback', async () => {
    const tenantId = TenantId.novo();
    const tenantContext = criarTenantContext(tenantId);
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute };
    const db = criarDbFake(tx);
    const repositorio = new RepositorioDeTeste(db, tenantContext);

    const chamadas: string[] = [];
    execute.mockImplementation(() => {
      chamadas.push('set_config');
      return Promise.resolve();
    });

    await repositorio.executar(async () => {
      chamadas.push('callback');
      return 'ok';
    });

    expect(chamadas).toEqual(['set_config', 'callback']);
    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0]![0] as SQL;
    expect(textoLiteral(query)).toContain('set_config');
    expect(valoresInterpolados(query)).toContain(tenantId.toString());
  });

  it('propaga o valor de retorno do callback', async () => {
    const tenantContext = criarTenantContext(TenantId.novo());
    const tx = { execute: vi.fn().mockResolvedValue(undefined) };
    const db = criarDbFake(tx);
    const repositorio = new RepositorioDeTeste(db, tenantContext);

    const resultado = await repositorio.executar(async () => 42);

    expect(resultado).toBe(42);
  });

  it('nunca aceita tenantId por parâmetro do método — apenas o do TenantContext do construtor', async () => {
    const tenantIdA = TenantId.novo();
    const tenantIdB = TenantId.novo();
    const tx = { execute: vi.fn().mockResolvedValue(undefined) };
    const db = criarDbFake(tx);
    const repositorio = new RepositorioDeTeste(db, criarTenantContext(tenantIdA));

    await repositorio.executar(async () => undefined);

    const valores = valoresInterpolados(tx.execute.mock.calls[0]![0] as SQL);
    expect(valores).toContain(tenantIdA.toString());
    expect(valores).not.toContain(tenantIdB.toString());
  });
});
