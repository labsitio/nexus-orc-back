// Integration test: exercita o schema Drizzle (T013) contra um Postgres real
// já migrado (`pnpm db:migrate`), não um mock. Prova que os CHECKs, a FK, o
// índice e o trigger de append-only bloqueiam exatamente o que devem
// bloquear — mesmo padrão de
// tests/.../extracao/.../extracao-orcamento.schema.test.ts.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  faixasPrecoCategoria,
  validacoesOrcamento,
  validacoesOrcamentoHistorico,
} from '../../../../../../src/bounded-contexts/validacao/infrastructure/persistence/schema/validacao-orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

// drizzle-orm embrulha o erro do driver em `Failed query: ...`; o nome da
// constraint Postgres violada só aparece em `error.cause.message`.
async function esperarViolacaoDeConstraint(promise: Promise<unknown>, constraint: RegExp) {
  await expect(promise).rejects.toSatisfy((erro) => {
    const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause.message : '';
    return constraint.test(causa);
  });
}

describe.skipIf(!DATABASE_URL)('schema validacao.validacoes_orcamento* (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // Cada teste roda dentro de uma transação revertida ao final — nenhuma
  // linha sobrevive à suíte, banco compartilhado permanece limpo.
  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  it('migração cria tabelas, CHECKs, índice e trigger conforme o schema', async () => {
    const tabelas = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'validacao' and table_name in (
         'validacoes_orcamento', 'validacoes_orcamento_historico', 'faixas_preco_categoria'
       )`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'faixas_preco_categoria',
      'validacoes_orcamento',
      'validacoes_orcamento_historico',
    ]);

    const checks = await client.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname in (
         'validacoes_orcamento_status_valido',
         'validacoes_orcamento_historico_resultado_valido'
       )`,
    );
    expect(checks.rows).toHaveLength(2);

    const indice = await client.query(
      `select indexname from pg_indexes where indexname = 'validacoes_orcamento_historico_orcamento_validacao_id_idx'`,
    );
    expect(indice.rows).toHaveLength(1);

    const triggers = await client.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname in (
         'trg_validacoes_orcamento_historico_bloquear_update',
         'trg_validacoes_orcamento_historico_bloquear_delete'
       )`,
    );
    expect(triggers.rows).toHaveLength(2);
  });

  async function inserirValidacao(id: string) {
    await db.insert(validacoesOrcamento).values({
      id,
      status: 'PENDENTE',
      dadosExtraidos: { cnpjFornecedor: '11222333000181', itens: [] },
      inconsistencias: [],
    });
  }

  it('inconsistencias tem default [] na criação', async () => {
    const id = randomUUID();
    await inserirValidacao(id);

    const linhas = await db
      .select()
      .from(validacoesOrcamento)
      .where(eq(validacoesOrcamento.id, id));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.inconsistencias).toEqual([]);
  });

  it('CHECK validacoes_orcamento_status_valido rejeita status fora do enum de domínio', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(validacoesOrcamento).values({
        id: randomUUID(),
        status: 'STATUS_INEXISTENTE',
        dadosExtraidos: {},
        inconsistencias: [],
      }),
      /validacoes_orcamento_status_valido/,
    );
  });

  it('CHECK validacoes_orcamento_historico_resultado_valido rejeita resultado fora do enum de domínio', async () => {
    const id = randomUUID();
    await inserirValidacao(id);

    await esperarViolacaoDeConstraint(
      db.insert(validacoesOrcamentoHistorico).values({
        orcamentoValidacaoId: id,
        resultado: 'RESULTADO_INEXISTENTE',
        inconsistencias: [],
        ocorreuEm: new Date(),
      }),
      /validacoes_orcamento_historico_resultado_valido/,
    );
  });

  it('FK orcamento_validacao_id rejeita histórico órfão (sem OrcamentoValidacao correspondente)', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(validacoesOrcamentoHistorico).values({
        orcamentoValidacaoId: randomUUID(),
        resultado: 'VALIDADO',
        inconsistencias: [],
        ocorreuEm: new Date(),
      }),
      /validacoes_orcamento_historico_orcamento_validacao_id_validacoes_orcamento_id_fk/,
    );
  });

  it('trigger append-only bloqueia UPDATE em validacoes_orcamento_historico', async () => {
    const id = randomUUID();
    await inserirValidacao(id);
    await db.insert(validacoesOrcamentoHistorico).values({
      orcamentoValidacaoId: id,
      resultado: 'VALIDADO',
      inconsistencias: [],
      ocorreuEm: new Date(),
    });

    await client.query('SAVEPOINT antes_update');
    await expect(
      client.query(
        `update validacao.validacoes_orcamento_historico set resultado = 'INCONSISTENTE' where orcamento_validacao_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_update');
  });

  it('trigger append-only bloqueia DELETE em validacoes_orcamento_historico', async () => {
    const id = randomUUID();
    await inserirValidacao(id);
    await db.insert(validacoesOrcamentoHistorico).values({
      orcamentoValidacaoId: id,
      resultado: 'VALIDADO',
      inconsistencias: [],
      ocorreuEm: new Date(),
    });

    await client.query('SAVEPOINT antes_delete');
    await expect(
      client.query(
        `delete from validacao.validacoes_orcamento_historico where orcamento_validacao_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_delete');
  });

  it('tabela faixas_preco_categoria aceita configuração de faixa por categoria', async () => {
    await db.insert(faixasPrecoCategoria).values({
      categoria: 'Informática',
      precoMinimoCentavos: 1000,
      precoMaximoCentavos: 500000,
      moeda: 'BRL',
    });

    const linhas = await db
      .select()
      .from(faixasPrecoCategoria)
      .where(eq(faixasPrecoCategoria.categoria, 'Informática'));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.precoMaximoCentavos).toBe(500000);
  });
});
