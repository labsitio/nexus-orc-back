// Integration test: exercita o schema Drizzle (T010) contra um Postgres real
// já migrado (`pnpm db:migrate`), não um mock. Prova que os CHECKs e o
// trigger de append-only bloqueiam exatamente o que devem bloquear — a mesma
// validação manual documentada no PR, agora automatizada e repetível.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { randomUUID } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  orcamentos,
  orcamentosHistorico,
} from '../../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

// T007 (RLS): placeholder até T014/T016/T018 propagarem tenantId real via
// Domain/Application (spec 007) — mesmo valor de `TENANT_ID_PROVISORIO` em
// `drizzle-orcamento.repository.ts`.
const TENANT_ID_TESTE = '00000000-0000-7000-8000-000000000000';

// drizzle-orm embrulha o erro do driver em `Failed query: ...`; o nome da
// constraint Postgres violada só aparece em `error.cause.message`.
async function esperarViolacaoDeConstraint(promise: Promise<unknown>, constraint: RegExp) {
  await expect(promise).rejects.toSatisfy((erro) => {
    const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause.message : '';
    return constraint.test(causa);
  });
}

describe.skipIf(!DATABASE_URL)('schema orcamentos / orcamentos_historico (Postgres real)', () => {
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
    // RLS (T007): sem `app.current_tenant_id`, a política `tenant_isolation`
    // nega toda linha destas tabelas.
    await client.query(`SET LOCAL app.current_tenant_id = '${TENANT_ID_TESTE}'`);
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  it('migração cria tabelas, enums, CHECKs, índice e trigger conforme o schema', async () => {
    const tabelas = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('orcamentos', 'orcamentos_historico')`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'orcamentos',
      'orcamentos_historico',
    ]);

    const enums = await client.query<{ typname: string }>(
      `select typname from pg_type where typname in ('canal', 'status_orcamento', 'agente_origem')`,
    );
    expect(enums.rows.map((r) => r.typname).sort()).toEqual([
      'agente_origem',
      'canal',
      'status_orcamento',
    ]);

    const checks = await client.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname in (
         'orcamentos_nivel_confianca_em_faixa',
         'orcamentos_resultado_completo_ou_ausente',
         'orcamentos_historico_nivel_confianca_em_faixa',
         'orcamentos_historico_sucesso_xor_insucesso'
       )`,
    );
    expect(checks.rows).toHaveLength(4);

    const indice = await client.query(
      `select indexname from pg_indexes where indexname = 'orcamentos_historico_orcamento_id_idx'`,
    );
    expect(indice.rows).toHaveLength(1);

    const triggers = await client.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname in (
         'trg_orcamentos_historico_bloquear_update',
         'trg_orcamentos_historico_bloquear_delete'
       )`,
    );
    expect(triggers.rows).toHaveLength(2);
  });

  async function inserirOrcamento(id: string) {
    await db.insert(orcamentos).values({
      id,
      tenantId: TENANT_ID_TESTE,
      canal: 'API_REST',
      recebidoEm: new Date(),
      bucket: 'nexo-orcamentos-raw',
      key: 'k',
      versionId: 'v1',
      status: 'RECEBIDO',
    });
  }

  it('RLS habilitada e política tenant_isolation presente em orcamentos / orcamentos_historico', async () => {
    const rls = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname in ('orcamentos', 'orcamentos_historico')`,
    );
    expect(rls.rows).toHaveLength(2);
    for (const linha of rls.rows) {
      expect(linha.relrowsecurity).toBe(true);
      expect(linha.relforcerowsecurity).toBe(true);
    }

    const politicas = await client.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where tablename in ('orcamentos', 'orcamentos_historico') and policyname = 'tenant_isolation'`,
    );
    expect(politicas.rows.map((r) => r.tablename).sort()).toEqual([
      'orcamentos',
      'orcamentos_historico',
    ]);
  });

  it('CHECK orcamentos_resultado_completo_ou_ausente rejeita grupo resultado parcial', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(orcamentos).values({
        id: randomUUID(),
        tenantId: TENANT_ID_TESTE,
        canal: 'API_REST',
        recebidoEm: new Date(),
        bucket: 'nexo-orcamentos-raw',
        key: 'k',
        versionId: 'v1',
        status: 'RECEBIDO',
        resultadoFornecedorIdentificado: 'fornecedor-x',
      }),
      /orcamentos_resultado_completo_ou_ausente/,
    );
  });

  it('CHECK orcamentos_nivel_confianca_em_faixa rejeita valor fora de 0-100', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(orcamentos).values({
        id: randomUUID(),
        tenantId: TENANT_ID_TESTE,
        canal: 'API_REST',
        recebidoEm: new Date(),
        bucket: 'nexo-orcamentos-raw',
        key: 'k',
        versionId: 'v1',
        status: 'CLASSIFICADO',
        resultadoFornecedorIdentificado: 'fornecedor-x',
        resultadoFormatoIdentificado: 'PDF',
        resultadoNivelConfianca: 101,
        resultadoAgenteOrigem: 'CLASSIFICADOR',
      }),
      /orcamentos_nivel_confianca_em_faixa/,
    );
  });

  it('CHECK orcamentos_historico_sucesso_xor_insucesso rejeita histórico com resultado parcial', async () => {
    const orcamentoId = randomUUID();
    await inserirOrcamento(orcamentoId);

    await esperarViolacaoDeConstraint(
      db.insert(orcamentosHistorico).values({
        orcamentoId,
        tenantId: TENANT_ID_TESTE,
        agente: 'CLASSIFICADOR',
        ocorreuEm: new Date(),
        resultadoFornecedorIdentificado: 'fornecedor-x',
        resultadoNivelConfianca: 90,
      }),
      /orcamentos_historico_sucesso_xor_insucesso/,
    );
  });

  it('trigger append-only bloqueia UPDATE em orcamentos_historico', async () => {
    const orcamentoId = randomUUID();
    await inserirOrcamento(orcamentoId);
    await db.insert(orcamentosHistorico).values({
      orcamentoId,
      tenantId: TENANT_ID_TESTE,
      agente: 'CLASSIFICADOR',
      ocorreuEm: new Date(),
      motivoInsucesso: 'confianca-baixa',
    });

    await client.query('SAVEPOINT antes_update');
    await expect(
      client.query(
        `update orcamentos_historico set motivo_insucesso = 'outro' where orcamento_id = $1`,
        [orcamentoId],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_update');
  });

  it('trigger append-only bloqueia DELETE em orcamentos_historico', async () => {
    const orcamentoId = randomUUID();
    await inserirOrcamento(orcamentoId);
    await db.insert(orcamentosHistorico).values({
      orcamentoId,
      tenantId: TENANT_ID_TESTE,
      agente: 'CLASSIFICADOR',
      ocorreuEm: new Date(),
      motivoInsucesso: 'confianca-baixa',
    });

    await client.query('SAVEPOINT antes_delete');
    await expect(
      client.query(`delete from orcamentos_historico where orcamento_id = $1`, [orcamentoId]),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_delete');
  });
});
