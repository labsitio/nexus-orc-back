import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// Schema Aurora dedicado ao BC Orquestração (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T002 é só o baseline: tabelas vazias (apenas chave primária),
// para provar o pipeline de migração deste BC. T015 evolui estas mesmas
// tabelas com as colunas reais (contextos/decisão em JSONB, histórico
// append-only) via uma migração incremental subsequente.
export const orquestracaoSchema = pgSchema('orquestracao');

/** Estado atual do agregado `DecisaoWorkflow` — colunas reais chegam em T015. */
export const decisoesWorkflow = orquestracaoSchema.table('decisoes_workflow', {
  id: uuid('id').primaryKey(),
});

/** Histórico append-only de `TentativaDecisaoWorkflow` — colunas reais chegam em T015. */
export const decisoesWorkflowHistorico = orquestracaoSchema.table('decisoes_workflow_historico', {
  id: uuid('id').primaryKey(),
});
