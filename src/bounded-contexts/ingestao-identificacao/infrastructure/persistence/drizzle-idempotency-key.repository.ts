import { and, eq, gt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IdempotencyKeyRepository } from '../../domain/repositories/idempotency-key.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { idempotencyKeys } from './schema/idempotency-key.schema.js';

/**
 * Implementa `IdempotencyKeyRepository` (T020/#25) sobre a tabela
 * `idempotency_keys`. TTL de 24h aplicado na leitura (`expiraEm > now()`) —
 * chave expirada é tratada como se nunca tivesse existido.
 */
export class DrizzleIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async buscarOrcamentoId(chave: string): Promise<OrcamentoId | undefined> {
    const [linha] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.chave, chave), gt(idempotencyKeys.expiraEm, new Date())));
    return linha ? OrcamentoId.de(linha.orcamentoId) : undefined;
  }

  async registrar(chave: string, orcamentoId: OrcamentoId, expiraEm: Date): Promise<void> {
    await this.db
      .insert(idempotencyKeys)
      .values({ chave, orcamentoId: orcamentoId.toString(), expiraEm })
      .onConflictDoNothing({ target: idempotencyKeys.chave });
  }
}
