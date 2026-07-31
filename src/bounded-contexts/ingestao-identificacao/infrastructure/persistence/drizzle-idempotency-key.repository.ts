import { eq, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  IdempotencyKeyRepository,
  ReservaIdempotencia,
} from '../../domain/repositories/idempotency-key.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { idempotencyKeys } from './schema/idempotency-key.schema.js';

/**
 * Implementa `IdempotencyKeyRepository` (T020/#25, achado MAJOR do
 * `backend-reviewer`) sobre a tabela `idempotency_keys`. `reservar` é um
 * único `INSERT ... ON CONFLICT (chave) DO UPDATE ... WHERE expira_em <=
 * now() RETURNING` — atômico no Postgres: só uma entre N chamadas
 * concorrentes com a mesma chave "vence" (linha livre ou TTL expirado); as
 * demais não recebem linha de volta e leem o `orcamentoId` já commitado pela
 * vencedora, sem jamais persistir/publicar duas vezes.
 */
export class DrizzleIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async reservar(
    chave: string,
    orcamentoId: OrcamentoId,
    expiraEm: Date,
  ): Promise<ReservaIdempotencia> {
    const [linhaReservada] = await this.db
      .insert(idempotencyKeys)
      .values({ chave, orcamentoId: orcamentoId.toString(), expiraEm })
      .onConflictDoUpdate({
        target: idempotencyKeys.chave,
        set: { orcamentoId: orcamentoId.toString(), expiraEm },
        setWhere: lte(idempotencyKeys.expiraEm, new Date()),
      })
      .returning();

    if (linhaReservada) {
      return { reservado: true, orcamentoId };
    }

    const [linhaExistente] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.chave, chave));
    // A linha existe sempre neste ramo — ou já existia (perdemos a corrida) ou
    // outra transação concorrente acabou de vencer entre o INSERT e este SELECT;
    // em ambos os casos há um `orcamentoId` autoritativo gravado por quem venceu.
    return { reservado: false, orcamentoId: OrcamentoId.de(linhaExistente!.orcamentoId) };
  }
}
