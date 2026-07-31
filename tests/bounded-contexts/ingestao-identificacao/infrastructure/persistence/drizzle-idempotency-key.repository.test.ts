// Integration test: exercita `DrizzleIdempotencyKeyRepository` (T020/#25)
// contra um Postgres real já migrado — requer DATABASE_URL (ver
// .env.example / docker-compose.yml); sem ela, a suíte é pulada (CI migra e
// provisiona antes de rodar, .github/workflows/ci.yml).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OrcamentoId } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { DrizzleIdempotencyKeyRepository } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-idempotency-key.repository.js';
import { idempotencyKeys } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/idempotency-key.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('DrizzleIdempotencyKeyRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleIdempotencyKeyRepository;
  const chavesParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleIdempotencyKeyRepository(db);
  });

  afterEach(async () => {
    for (const chave of chavesParaLimpar.splice(0)) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.chave, chave));
    }
  });

  afterAll(async () => {
    await client.end();
  });

  it('reservar chave livre: reservado=true, orcamentoId é o próprio passado', async () => {
    const chave = `teste-${OrcamentoId.novo().toString()}`;
    const orcamentoId = OrcamentoId.novo();
    chavesParaLimpar.push(chave);

    const reserva = await repo.reservar(chave, orcamentoId, new Date(Date.now() + 60_000));

    expect(reserva.reservado).toBe(true);
    expect(reserva.orcamentoId.toString()).toBe(orcamentoId.toString());
  });

  it('reservar a mesma chave 2x dentro do TTL: 2ª chamada não reserva e devolve o OrcamentoId da 1ª (admission gate)', async () => {
    const chave = `teste-conflito-${OrcamentoId.novo().toString()}`;
    const primeiro = OrcamentoId.novo();
    const segundo = OrcamentoId.novo();
    chavesParaLimpar.push(chave);

    const reserva1 = await repo.reservar(chave, primeiro, new Date(Date.now() + 60_000));
    const reserva2 = await repo.reservar(chave, segundo, new Date(Date.now() + 60_000));

    expect(reserva1.reservado).toBe(true);
    expect(reserva2.reservado).toBe(false);
    expect(reserva2.orcamentoId.toString()).toBe(primeiro.toString());
  });

  it('reservar chave expirada (TTL vencido): reservado=true de novo, sobrescreve com o novo orcamentoId', async () => {
    const chave = `teste-expirada-${OrcamentoId.novo().toString()}`;
    const antigo = OrcamentoId.novo();
    const novo = OrcamentoId.novo();
    chavesParaLimpar.push(chave);

    await repo.reservar(chave, antigo, new Date(Date.now() - 1000));
    const reserva = await repo.reservar(chave, novo, new Date(Date.now() + 60_000));

    expect(reserva.reservado).toBe(true);
    expect(reserva.orcamentoId.toString()).toBe(novo.toString());
  });
});
