import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// Schema Aurora dedicado ao BC Extração (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T002 é só o baseline: tabelas vazias (apenas chave primária),
// para provar o pipeline de migração deste BC. T012 evolui estas mesmas
// tabelas com as colunas reais (itens/condições JSONB — ADR-004, histórico
// append-only) via uma migração incremental subsequente.
export const extracaoSchema = pgSchema('extracao');

/** Estado atual do agregado `ExtracaoOrcamento` — colunas reais chegam em T012. */
export const extracoesOrcamento = extracaoSchema.table('extracoes_orcamento', {
  id: uuid('id').primaryKey(),
});

/** Histórico append-only de `TentativaExtracao` — colunas reais chegam em T012. */
export const extracoesOrcamentoHistorico = extracaoSchema.table('extracoes_orcamento_historico', {
  id: uuid('id').primaryKey(),
});
