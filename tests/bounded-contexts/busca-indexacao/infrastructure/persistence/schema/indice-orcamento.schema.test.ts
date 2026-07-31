// Integration test: exercita a migração baseline do BC Busca & Indexação
// (T003) contra um Postgres real já migrado (`pnpm db:migrate`), não um
// mock. T003 é intencionalmente mínimo (só chave primária), mas já inclui a
// coluna `embedding vector(1024)` + índice HNSW (distância cosseno), porque
// a extensão pgvector e o tipo/índice vetorial são o próprio objeto desta
// spec (plan.md ADR-001) — diferente do baseline "id apenas" das specs
// 001–003. Mesmo padrão de
// tests/.../validacao/.../validacao-orcamento.schema.test.ts. Colunas reais
// (conteudo_indexavel JSONB, histórico append-only real) chegam em T015,
// com seu próprio teste.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`, imagem pgvector/pgvector:pg16) apontando para um banco já
// migrado. Sem DATABASE_URL, a suíte é pulada (não falha) — CI provisiona o
// serviço e migra antes de rodar os testes (.github/workflows/ci.yml).
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('schema busca_indexacao.indices_orcamento* (Postgres real)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('migração cria o schema busca_indexacao e as tabelas baseline', async () => {
    const schemas = await client.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name = 'busca_indexacao'`,
    );
    expect(schemas.rows).toHaveLength(1);

    const tabelas = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'busca_indexacao' and table_name in ('indices_orcamento', 'indices_orcamento_historico')`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'indices_orcamento',
      'indices_orcamento_historico',
    ]);
  });

  it('indices_orcamento.embedding é vector(1024)', async () => {
    const colunas = await client.query<{ tipo: string }>(
      `select format_type(a.atttypid, a.atttypmod) as tipo
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'busca_indexacao' and c.relname = 'indices_orcamento'
         and a.attname = 'embedding' and a.attnum > 0 and not a.attisdropped`,
    );
    expect(colunas.rows).toHaveLength(1);
    expect(colunas.rows[0]?.tipo).toBe('vector(1024)');
  });

  it('índice HNSW de distância cosseno existe em indices_orcamento.embedding', async () => {
    const indice = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'busca_indexacao' and indexname = 'indices_orcamento_embedding_hnsw_idx'`,
    );
    expect(indice.rows).toHaveLength(1);
    expect(indice.rows[0]?.indexdef).toMatch(/using hnsw/i);
    expect(indice.rows[0]?.indexdef).toMatch(/vector_cosine_ops/);
  });
});
