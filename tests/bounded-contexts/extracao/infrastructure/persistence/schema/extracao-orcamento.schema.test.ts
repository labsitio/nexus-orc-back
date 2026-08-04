// Integration test: exercita o schema Drizzle (T012) contra um Postgres real
// já migrado (`pnpm db:migrate`), não um mock. Prova que os CHECKs e o
// trigger de append-only bloqueiam exatamente o que devem bloquear — mesmo
// padrão de tests/.../ingestao-identificacao/.../orcamento.schema.test.ts.
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
  extracoesOrcamento,
  extracoesOrcamentoHistorico,
} from '../../../../../../src/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

// drizzle-orm embrulha o erro do driver em `Failed query: ...`; o nome da
// constraint Postgres violada só aparece em `error.cause.message`.
async function esperarViolacaoDeConstraint(promise: Promise<unknown>, constraint: RegExp) {
  await expect(promise).rejects.toSatisfy((erro) => {
    const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause.message : '';
    return constraint.test(causa);
  });
}

describe.skipIf(!DATABASE_URL)('schema extracao.extracoes_orcamento* (Postgres real)', () => {
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
       where table_schema = 'extracao' and table_name in ('extracoes_orcamento', 'extracoes_orcamento_historico')`,
    );
    expect(tabelas.rows.map((r) => r.table_name).sort()).toEqual([
      'extracoes_orcamento',
      'extracoes_orcamento_historico',
    ]);

    const checks = await client.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname in (
         'extracoes_orcamento_status_valido',
         'extracoes_orcamento_ref_classificacao_agente_valido',
         'extracoes_orcamento_historico_agente_valido',
         'extracoes_orcamento_historico_sucesso_xor_insucesso'
       )`,
    );
    expect(checks.rows).toHaveLength(4);

    const indice = await client.query(
      `select indexname from pg_indexes where indexname = 'extracoes_orcamento_historico_extracao_orcamento_id_idx'`,
    );
    expect(indice.rows).toHaveLength(1);

    // (issue #648 — expand/contract, ADR-008) `tenant_id` nullable até a #632.
    const colunaTenantId = await client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
       where table_schema = 'extracao' and table_name = 'extracoes_orcamento' and column_name = 'tenant_id'`,
    );
    expect(colunaTenantId.rows).toEqual([{ is_nullable: 'YES' }]);

    const triggers = await client.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgname in (
         'trg_extracoes_orcamento_historico_bloquear_update',
         'trg_extracoes_orcamento_historico_bloquear_delete'
       )`,
    );
    expect(triggers.rows).toHaveLength(2);
  });

  async function inserirExtracao(id: string) {
    await db.insert(extracoesOrcamento).values({
      id,
      status: 'PENDENTE',
      referenciaClassificacaoFornecedorIdentificado: 'fornecedor-x',
      referenciaClassificacaoFormatoIdentificado: 'PDF',
      referenciaClassificacaoAgenteOrigem: 'CLASSIFICADOR',
      referenciaBrutaS3Bucket: 'nexo-orcamentos-raw',
      referenciaBrutaS3Key: 'k',
      referenciaBrutaS3VersionId: 'v1',
    });
  }

  it('itens tem default [] e condicoes_comerciais é opcional na criação', async () => {
    const id = randomUUID();
    await inserirExtracao(id);

    const linhas = await db.select().from(extracoesOrcamento).where(eq(extracoesOrcamento.id, id));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.itens).toEqual([]);
    expect(linhas[0]?.condicoesComerciais).toBeNull();
  });

  it('CHECK extracoes_orcamento_status_valido rejeita status fora do enum de domínio', async () => {
    await esperarViolacaoDeConstraint(
      db.insert(extracoesOrcamento).values({
        id: randomUUID(),
        status: 'STATUS_INEXISTENTE',
        referenciaClassificacaoFornecedorIdentificado: 'fornecedor-x',
        referenciaClassificacaoFormatoIdentificado: 'PDF',
        referenciaClassificacaoAgenteOrigem: 'CLASSIFICADOR',
        referenciaBrutaS3Bucket: 'nexo-orcamentos-raw',
        referenciaBrutaS3Key: 'k',
        referenciaBrutaS3VersionId: 'v1',
      }),
      /extracoes_orcamento_status_valido/,
    );
  });

  it('CHECK extracoes_orcamento_historico_sucesso_xor_insucesso rejeita linha com resultado e motivoInsucesso juntos', async () => {
    const id = randomUUID();
    await inserirExtracao(id);

    await esperarViolacaoDeConstraint(
      db.insert(extracoesOrcamentoHistorico).values({
        extracaoOrcamentoId: id,
        agente: 'EXTRATOR',
        ocorreuEm: new Date(),
        resultado: 'EXTRAIDO',
        motivoInsucesso: 'confianca-baixa',
      }),
      /extracoes_orcamento_historico_sucesso_xor_insucesso/,
    );
  });

  it('CHECK extracoes_orcamento_historico_sucesso_xor_insucesso rejeita linha sem resultado nem motivoInsucesso', async () => {
    const id = randomUUID();
    await inserirExtracao(id);

    await esperarViolacaoDeConstraint(
      db.insert(extracoesOrcamentoHistorico).values({
        extracaoOrcamentoId: id,
        agente: 'EXTRATOR',
        ocorreuEm: new Date(),
      }),
      /extracoes_orcamento_historico_sucesso_xor_insucesso/,
    );
  });

  it('trigger append-only bloqueia UPDATE em extracoes_orcamento_historico', async () => {
    const id = randomUUID();
    await inserirExtracao(id);
    await db.insert(extracoesOrcamentoHistorico).values({
      extracaoOrcamentoId: id,
      agente: 'EXTRATOR',
      ocorreuEm: new Date(),
      resultado: 'EXTRAIDO',
    });

    await client.query('SAVEPOINT antes_update');
    await expect(
      client.query(
        `update extracao.extracoes_orcamento_historico set resultado = 'outro' where extracao_orcamento_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_update');
  });

  it('trigger append-only bloqueia DELETE em extracoes_orcamento_historico', async () => {
    const id = randomUUID();
    await inserirExtracao(id);
    await db.insert(extracoesOrcamentoHistorico).values({
      extracaoOrcamentoId: id,
      agente: 'EXTRATOR',
      ocorreuEm: new Date(),
      resultado: 'EXTRAIDO',
    });

    await client.query('SAVEPOINT antes_delete');
    await expect(
      client.query(
        `delete from extracao.extracoes_orcamento_historico where extracao_orcamento_id = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK TO SAVEPOINT antes_delete');
  });
});
