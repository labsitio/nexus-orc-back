// Integration test: exercita `DrizzleFaixaPrecoRepository` (T023) contra um
// Postgres real já migrado (`pnpm db:migrate`), não um mock — prova a
// tradução linha↔VO da tabela de configuração `faixas_preco_categoria`.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleFaixaPrecoRepository } from '../../../../../src/bounded-contexts/validacao/infrastructure/persistence/drizzle-faixa-preco.repository.js';
import { faixasPrecoCategoria } from '../../../../../src/bounded-contexts/validacao/infrastructure/persistence/schema/validacao-orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('DrizzleFaixaPrecoRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleFaixaPrecoRepository;
  const categoriasParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleFaixaPrecoRepository(db);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    while (categoriasParaLimpar.length > 0) {
      const categoria = categoriasParaLimpar.pop()!;
      await client.query('delete from validacao.faixas_preco_categoria where categoria = $1', [
        categoria,
      ]);
    }
  });

  it('listarTodas retorna array vazio sem nenhuma faixa configurada', async () => {
    await expect(repo.listarTodas()).resolves.toEqual([]);
  });

  it('listarTodas traduz linha para FaixaPreco (categoria, precoMinimo, precoMaximo)', async () => {
    const categoria = `categoria-teste-${Date.now()}`;
    categoriasParaLimpar.push(categoria);

    await db.insert(faixasPrecoCategoria).values({
      categoria,
      precoMinimoCentavos: 1000,
      precoMaximoCentavos: 5000,
      moeda: 'BRL',
    });

    const faixas = await repo.listarTodas();
    const faixa = faixas.find((f) => f.categoria.valor === categoria);

    expect(faixa).toBeDefined();
    expect(faixa?.precoMinimo.valorCentavos).toBe(1000);
    expect(faixa?.precoMaximo.valorCentavos).toBe(5000);
    expect(faixa?.precoMinimo.moeda).toBe('BRL');
    expect(faixa?.contem(faixa!.precoMinimo)).toBe(true);
  });
});
