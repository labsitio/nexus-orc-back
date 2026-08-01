import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { TenantContext } from './tenant-context.js';

type TransacaoCallback<TSchema extends Record<string, unknown>> = Parameters<
  NodePgDatabase<TSchema>['transaction']
>[0];
type TenantScopedTx<TSchema extends Record<string, unknown>> = Parameters<
  TransacaoCallback<TSchema>
>[0];

/**
 * `DrizzleTenantScopedRepositoryBase` (T008 —
 * `specs/007-isolamento-multitenant-dados/tasks.md`). Toda transação aberta
 * por `transacaoTenantScoped` executa `SET LOCAL app.current_tenant_id = $1`
 * (via `set_config(..., true)`, ver nota em `drizzle-orcamento.repository.ts`
 * sobre por que não é um `SET LOCAL` cru) antes de qualquer outra instrução —
 * a política `tenant_isolation` (RLS, T007) nega toda leitura/escrita sem
 * isso.
 *
 * `$1` vem exclusivamente do `TenantContext` recebido no construtor, nunca de
 * parâmetro solto de método — reforça a convenção #5 do `plan.md` desta spec
 * ("`tenant_id` nunca aceito de input... apenas de claim JWT verificada").
 * Repositórios concretos (ex. `DrizzleOrcamentoRepository`, T018) devem
 * estender esta classe e usar `transacaoTenantScoped` em vez de
 * `this.db.transaction` diretamente.
 */
export abstract class DrizzleTenantScopedRepositoryBase<
  TSchema extends Record<string, unknown> = Record<string, never>,
> {
  protected constructor(
    private readonly db: NodePgDatabase<TSchema>,
    private readonly tenantContext: TenantContext,
  ) {}

  protected async transacaoTenantScoped<T>(
    fn: (tx: TenantScopedTx<TSchema>) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.current_tenant_id', ${this.tenantContext.tenantId.toString()}, true)`,
      );
      return fn(tx);
    });
  }
}
