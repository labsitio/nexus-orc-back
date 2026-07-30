// Integration test: exercita a migração baseline do BC Extração (T002)
// contra um Postgres real já migrado (`pnpm db:migrate`), não um mock.
// T002 é intencionalmente vazio (só chave primária) — a única coisa a
// provar aqui é que o schema `extracao` e as duas tabelas existem. Colunas
// reais (itens/condições JSONB, histórico append-only) chegam em T012, com
// seu próprio teste.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('schema extracao.extracoes_orcamento* (Postgres real)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('migração cria o schema extracao e as tabelas baseline', async () => {
    const schemas = await client.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name = 'extracao'`,
    );
    expect(schemas.rows).toHaveLength(1);

    const tabelas = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'extracao' and table_name in ('extracoes_orcamento', 'extracoes_orcamento_historico')`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'extracoes_orcamento',
      'extracoes_orcamento_historico',
    ]);
  });
});
