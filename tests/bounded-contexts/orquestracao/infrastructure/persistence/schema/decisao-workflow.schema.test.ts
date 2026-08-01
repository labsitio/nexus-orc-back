// Integration test: exercita a migração baseline do BC Orquestração (T002)
// contra um Postgres real já migrado (`pnpm db:migrate`), não um mock.
// T002 é intencionalmente vazio (só chave primária) — a única coisa a
// provar aqui é que o schema `orquestracao` e as duas tabelas existem.
// Colunas reais (contextos/decisão em JSONB, histórico append-only) chegam
// em T015, com seu próprio teste.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('schema orquestracao.decisoes_workflow* (Postgres real)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('migração cria o schema orquestracao e as tabelas baseline', async () => {
    const schemas = await client.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name = 'orquestracao'`,
    );
    expect(schemas.rows).toHaveLength(1);

    const tabelas = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'orquestracao' and table_name in ('decisoes_workflow', 'decisoes_workflow_historico')`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'decisoes_workflow',
      'decisoes_workflow_historico',
    ]);
  });
});
