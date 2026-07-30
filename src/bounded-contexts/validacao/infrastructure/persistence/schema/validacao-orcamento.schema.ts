import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// Schema Aurora dedicado ao BC Validação (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T002 é só o baseline: tabelas vazias (apenas chave primária),
// para provar o pipeline de migração deste BC. T013 evolui estas mesmas
// tabelas com as colunas reais (dados_extraidos/inconsistencias JSONB,
// histórico append-only) via uma migração incremental subsequente.
export const validacaoSchema = pgSchema('validacao');

/** Estado atual do agregado `OrcamentoValidacao` — colunas reais chegam em T013. */
export const validacoesOrcamento = validacaoSchema.table('validacoes_orcamento', {
  id: uuid('id').primaryKey(),
});

/** Histórico append-only de tentativas de validação — colunas reais chegam em T013. */
export const validacoesOrcamentoHistorico = validacaoSchema.table(
  'validacoes_orcamento_historico',
  {
    id: uuid('id').primaryKey(),
  },
);
