// Integration test: exercita o schema Drizzle (T015) contra um Postgres real
// já migrado (`pnpm db:migrate`), não um mock. Prova que os CHECKs, a FK, o
// índice e o trigger de append-only bloqueiam exatamente o que devem
// bloquear — mesmo padrão de
// tests/.../validacao/.../validacao-orcamento.schema.test.ts.
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
  decisoesWorkflow,
  decisoesWorkflowHistorico,
} from '../../../../../../src/bounded-contexts/orquestracao/infrastructure/persistence/schema/decisao-workflow.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_ID = randomUUID();

// drizzle-orm embrulha o erro do driver em `Failed query: ...`; o nome da
// constraint Postgres violada só aparece em `error.cause.message`.
async function esperarViolacaoDeConstraint(promise: Promise<unknown>, constraint: RegExp) {
  await expect(promise).rejects.toSatisfy((erro) => {
    const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause.message : '';
    return constraint.test(causa);
  });
}

describe.skipIf(!DATABASE_URL)('schema orquestracao.decisoes_workflow* (Postgres real)', () => {
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
       where table_schema = 'orquestracao' and table_name in (
         'decisoes_workflow', 'decisoes_workflow_historico'
       )`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'decisoes_workflow',
      'decisoes_workflow_historico',
    ]);

    const checks = await client.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname in (
         'decisoes_workflow_status_valido',
         'decisoes_workflow_historico_agente_valido',
         'decisoes_workflow_historico_resultado_xor_motivo'
       )`,
    );
    expect(checks.rows).toHaveLength(3);

    const indice = await client.query(
      `select indexname from pg_indexes where indexname = 'decisoes_workflow_historico_decisao_workflow_id_idx'`,
    );
    expect(indice.rows).toHaveLength(1);

    const triggers = await client.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname in (
         'trg_decisoes_workflow_historico_bloquear_update',
         'trg_decisoes_workflow_historico_bloquear_delete'
       )`,
    );
    expect(triggers.rows).toHaveLength(2);

    // (issue #656 — RLS/tenant-scoped, migração 0020) `tenant_id` NOT NULL.
    const colunaTenantId = await client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
       where table_schema = 'orquestracao' and table_name = 'decisoes_workflow' and column_name = 'tenant_id'`,
    );
    expect(colunaTenantId.rows).toEqual([{ is_nullable: 'NO' }]);
  });

  it('RLS habilitada e política tenant_isolation presente em decisoes_workflow / decisoes_workflow_historico (issue #656)', async () => {
    const rls = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname in ('decisoes_workflow', 'decisoes_workflow_historico')`,
    );
    expect(rls.rows).toHaveLength(2);
    for (const linha of rls.rows) {
      expect(linha.relrowsecurity).toBe(true);
      expect(linha.relforcerowsecurity).toBe(true);
    }

    const politicas = await client.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where tablename in ('decisoes_workflow', 'decisoes_workflow_historico') and policyname = 'tenant_isolation'`,
    );
    expect(politicas.rows.map((r) => r.tablename).sort()).toEqual([
      'decisoes_workflow',
      'decisoes_workflow_historico',
    ]);
  });

  async function inserirDecisaoWorkflow(id: string) {
    await db.insert(decisoesWorkflow).values({
      id,
      tenantId: TENANT_ID,
      status: 'AGUARDANDO_CONTEXTO',
    });
  }

  it('contextos e decisaoAtual são nulos até serem registrados', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);

    const linhas = await db.select().from(decisoesWorkflow).where(eq(decisoesWorkflow.id, id));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.contextoClassificacao).toBeNull();
    expect(linhas[0]?.decisaoAtual).toBeNull();
  });

  it('CHECK decisoes_workflow_status_valido rejeita status fora do enum de domínio', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(decisoesWorkflow).values({
        id: randomUUID(),
        tenantId: TENANT_ID,
        status: 'STATUS_INEXISTENTE',
      }),
      /decisoes_workflow_status_valido/,
    );
  });

  it('CHECK decisoes_workflow_historico_agente_valido rejeita agente fora do enum de domínio', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);

    await esperarViolacaoDeConstraint(
      db.insert(decisoesWorkflowHistorico).values({
        decisaoWorkflowId: id,
        tenantId: TENANT_ID,
        agente: 'AGENTE_INEXISTENTE',
        motivoInsucesso: 'confiança insuficiente',
        ocorreuEm: new Date(),
      }),
      /decisoes_workflow_historico_agente_valido/,
    );
  });

  it('CHECK decisoes_workflow_historico_resultado_xor_motivo rejeita ambos presentes', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);

    await esperarViolacaoDeConstraint(
      db.insert(decisoesWorkflowHistorico).values({
        decisaoWorkflowId: id,
        tenantId: TENANT_ID,
        agente: 'ORQUESTRADOR',
        resultado: { acao: 'APROVAR' },
        motivoInsucesso: 'confiança insuficiente',
        ocorreuEm: new Date(),
      }),
      /decisoes_workflow_historico_resultado_xor_motivo/,
    );
  });

  it('CHECK decisoes_workflow_historico_resultado_xor_motivo rejeita nenhum presente', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);

    await esperarViolacaoDeConstraint(
      db.insert(decisoesWorkflowHistorico).values({
        decisaoWorkflowId: id,
        tenantId: TENANT_ID,
        agente: 'ORQUESTRADOR',
        ocorreuEm: new Date(),
      }),
      /decisoes_workflow_historico_resultado_xor_motivo/,
    );
  });

  it('FK decisao_workflow_id rejeita histórico órfão (sem DecisaoWorkflow correspondente)', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(decisoesWorkflowHistorico).values({
        decisaoWorkflowId: randomUUID(),
        tenantId: TENANT_ID,
        agente: 'ORQUESTRADOR',
        motivoInsucesso: 'confiança insuficiente',
        ocorreuEm: new Date(),
      }),
      /decisoes_workflow_historico_decisao_workflow_id_fk/,
    );
  });

  it('trigger append-only bloqueia UPDATE em decisoes_workflow_historico', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);
    await db.insert(decisoesWorkflowHistorico).values({
      decisaoWorkflowId: id,
      tenantId: TENANT_ID,
      agente: 'ORQUESTRADOR',
      motivoInsucesso: 'confiança insuficiente',
      ocorreuEm: new Date(),
    });

    await client.query('SAVEPOINT antes_update');
    await expect(
      client.query(
        `update orquestracao.decisoes_workflow_historico set motivo_insucesso = 'outro motivo' where decisao_workflow_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_update');
  });

  it('trigger append-only bloqueia DELETE em decisoes_workflow_historico', async () => {
    const id = randomUUID();
    await inserirDecisaoWorkflow(id);
    await db.insert(decisoesWorkflowHistorico).values({
      decisaoWorkflowId: id,
      tenantId: TENANT_ID,
      agente: 'ORQUESTRADOR',
      motivoInsucesso: 'confiança insuficiente',
      ocorreuEm: new Date(),
    });

    await client.query('SAVEPOINT antes_delete');
    await expect(
      client.query(
        `delete from orquestracao.decisoes_workflow_historico where decisao_workflow_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_delete');
  });
});
