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

  it('registrar + buscarOrcamentoId devolve o OrcamentoId dentro do TTL', async () => {
    const chave = `teste-${OrcamentoId.novo().toString()}`;
    const orcamentoId = OrcamentoId.novo();
    chavesParaLimpar.push(chave);

    await repo.registrar(chave, orcamentoId, new Date(Date.now() + 60_000));

    const encontrado = await repo.buscarOrcamentoId(chave);
    expect(encontrado?.toString()).toBe(orcamentoId.toString());
  });

  it('buscarOrcamentoId devolve undefined para chave nunca registrada', async () => {
    const encontrado = await repo.buscarOrcamentoId('chave-inexistente');
    expect(encontrado).toBeUndefined();
  });

  it('buscarOrcamentoId devolve undefined para chave expirada (TTL vencido)', async () => {
    const chave = `teste-expirada-${OrcamentoId.novo().toString()}`;
    chavesParaLimpar.push(chave);

    await repo.registrar(chave, OrcamentoId.novo(), new Date(Date.now() - 1000));

    const encontrado = await repo.buscarOrcamentoId(chave);
    expect(encontrado).toBeUndefined();
  });

  it('registrar é idempotente para a mesma chave (onConflictDoNothing)', async () => {
    const chave = `teste-conflito-${OrcamentoId.novo().toString()}`;
    const primeiro = OrcamentoId.novo();
    const segundo = OrcamentoId.novo();
    chavesParaLimpar.push(chave);

    await repo.registrar(chave, primeiro, new Date(Date.now() + 60_000));
    await repo.registrar(chave, segundo, new Date(Date.now() + 60_000));

    const encontrado = await repo.buscarOrcamentoId(chave);
    expect(encontrado?.toString()).toBe(primeiro.toString());
  });
});
