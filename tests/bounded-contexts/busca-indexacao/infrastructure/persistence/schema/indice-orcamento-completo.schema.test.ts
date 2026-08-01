// Integration test: exercita o mapeamento Drizzle completo do agregado
// `IndiceOrcamento` (T015, migração 0014) contra um Postgres real já migrado
// (`pnpm db:migrate`), não um mock. Prova que os CHECKs, a FK, o índice e o
// trigger de append-only bloqueiam exatamente o que devem bloquear — mesmo
// padrão de tests/.../validacao/.../validacao-orcamento.schema.test.ts. O
// baseline (id + embedding vector(1024) + índice HNSW, T003) já tem seu
// próprio teste em indice-orcamento.schema.test.ts.
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
  indicesOrcamento,
  indicesOrcamentoHistorico,
} from '../../../../../../src/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

// drizzle-orm embrulha o erro do driver em `Failed query: ...`; o nome da
// constraint Postgres violada só aparece em `error.cause.message`.
async function esperarViolacaoDeConstraint(promise: Promise<unknown>, constraint: RegExp) {
  await expect(promise).rejects.toSatisfy((erro) => {
    const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause.message : '';
    return constraint.test(causa);
  });
}

describe.skipIf(!DATABASE_URL)(
  'schema busca_indexacao.indices_orcamento* completo (T015, Postgres real)',
  () => {
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

    it('migração cria os CHECKs, a FK, o índice e o trigger conforme o schema', async () => {
      const checks = await client.query<{ conname: string }>(
        `select conname from pg_constraint where contype = 'c' and conname in (
           'indices_orcamento_estado_valido',
           'indices_orcamento_origem_validacao_valida',
           'indices_orcamento_historico_resultado_valido'
         )`,
      );
      expect(checks.rows).toHaveLength(3);

      const fk = await client.query(
        `select conname from pg_constraint where conname = 'indices_orcamento_historico_indice_orcamento_id_fk'`,
      );
      expect(fk.rows).toHaveLength(1);

      const indice = await client.query(
        `select indexname from pg_indexes where indexname = 'indices_orcamento_historico_indice_orcamento_id_idx'`,
      );
      expect(indice.rows).toHaveLength(1);

      const triggers = await client.query<{ tgname: string }>(
        `select tgname from pg_trigger where tgname in (
           'trg_indices_orcamento_historico_bloquear_update',
           'trg_indices_orcamento_historico_bloquear_delete'
         )`,
      );
      expect(triggers.rows).toHaveLength(2);
    });

    async function inserirIndice(id: string) {
      await db.insert(indicesOrcamento).values({
        id,
        estado: 'PENDENTE',
        conteudoIndexavel: { resumoFornecedor: 'Fornecedor X', itensDescricao: [] },
        origemValidacao: 'VALIDADO',
      });
    }

    it('embedding permanece ausente enquanto o estado não é INDEXADO', async () => {
      const id = randomUUID();
      await inserirIndice(id);

      const linhas = await db.select().from(indicesOrcamento).where(eq(indicesOrcamento.id, id));
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.embedding).toBeNull();
    });

    it('CHECK indices_orcamento_estado_valido rejeita estado fora do enum de domínio', async () => {
      await esperarViolacaoDeConstraint(
        db.insert(indicesOrcamento).values({
          id: randomUUID(),
          estado: 'ESTADO_INEXISTENTE',
          conteudoIndexavel: {},
          origemValidacao: 'VALIDADO',
        }),
        /indices_orcamento_estado_valido/,
      );
    });

    it('CHECK indices_orcamento_origem_validacao_valida rejeita origem fora do enum de domínio', async () => {
      await esperarViolacaoDeConstraint(
        db.insert(indicesOrcamento).values({
          id: randomUUID(),
          estado: 'PENDENTE',
          conteudoIndexavel: {},
          origemValidacao: 'ORIGEM_INEXISTENTE',
        }),
        /indices_orcamento_origem_validacao_valida/,
      );
    });

    it('CHECK indices_orcamento_historico_resultado_valido rejeita resultado fora do enum de domínio', async () => {
      const id = randomUUID();
      await inserirIndice(id);

      await esperarViolacaoDeConstraint(
        db.insert(indicesOrcamentoHistorico).values({
          indiceOrcamentoId: id,
          resultado: 'RESULTADO_INEXISTENTE',
          ocorreuEm: new Date(),
        }),
        /indices_orcamento_historico_resultado_valido/,
      );
    });

    it('FK indice_orcamento_id rejeita histórico órfão (sem IndiceOrcamento correspondente)', async () => {
      await esperarViolacaoDeConstraint(
        db.insert(indicesOrcamentoHistorico).values({
          indiceOrcamentoId: randomUUID(),
          resultado: 'INDEXADO',
          modeloEmbedding: 'amazon.titan-embed-text-v2:0',
          ocorreuEm: new Date(),
        }),
        /indices_orcamento_historico_indice_orcamento_id_fk/,
      );
    });

    it('trigger append-only bloqueia UPDATE em indices_orcamento_historico', async () => {
      const id = randomUUID();
      await inserirIndice(id);
      await db.insert(indicesOrcamentoHistorico).values({
        indiceOrcamentoId: id,
        resultado: 'FALHA_TECNICA',
        motivoFalha: 'timeout no gateway de embeddings',
        ocorreuEm: new Date(),
      });

      await client.query('SAVEPOINT antes_update');
      await expect(
        client.query(
          `update busca_indexacao.indices_orcamento_historico set resultado = 'INDEXADO' where indice_orcamento_id = $1`,
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await client.query('ROLLBACK TO SAVEPOINT antes_update');
    });

    it('trigger append-only bloqueia DELETE em indices_orcamento_historico', async () => {
      const id = randomUUID();
      await inserirIndice(id);
      await db.insert(indicesOrcamentoHistorico).values({
        indiceOrcamentoId: id,
        resultado: 'FALHA_TECNICA',
        motivoFalha: 'timeout no gateway de embeddings',
        ocorreuEm: new Date(),
      });

      await client.query('SAVEPOINT antes_delete');
      await expect(
        client.query(
          `delete from busca_indexacao.indices_orcamento_historico where indice_orcamento_id = $1`,
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await client.query('ROLLBACK TO SAVEPOINT antes_delete');
    });
  },
);
