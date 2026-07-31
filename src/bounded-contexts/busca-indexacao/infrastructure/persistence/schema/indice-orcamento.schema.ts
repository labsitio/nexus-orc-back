import { index, pgSchema, uuid, vector } from 'drizzle-orm/pg-core';

// Schema Aurora dedicado ao BC Busca & Indexação (plan.md, seção
// Infrastructure; ADR-001 herdado da spec 001 — Drizzle Kit gera migração
// por diff deste arquivo). T003 é o baseline: tabelas praticamente vazias,
// mas já incluindo a coluna `embedding vector(1024)` + índice HNSW (distância
// cosseno), porque a extensão `pgvector` (T002) e o tipo/índice vetorial são
// o próprio objeto desta spec (plan.md ADR-001) — diferente do baseline
// "id apenas" das specs 001–003. T015 evolui estas mesmas tabelas com o
// mapeamento completo (`conteudo_indexavel` JSONB, histórico append-only
// real) via migração incremental subsequente.
export const buscaIndexacaoSchema = pgSchema('busca_indexacao');

/** Estado atual do agregado `IndiceOrcamento` — colunas reais chegam em T015. */
export const indicesOrcamento = buscaIndexacaoSchema.table(
  'indices_orcamento',
  {
    id: uuid('id').primaryKey(),
    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (table) => [
    index('indices_orcamento_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

/** Histórico append-only de tentativas de indexação — colunas reais chegam em T015. */
export const indicesOrcamentoHistorico = buscaIndexacaoSchema.table('indices_orcamento_historico', {
  id: uuid('id').primaryKey(),
});
