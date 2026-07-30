import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Schema Aurora dedicado ao componente de plataforma Conformidade (plan.md,
// seção Infrastructure). Tabelas vazias nesta task (T002) — sem seed, sem
// regra de negócio, apenas estrutura para o journal do Drizzle Kit.
export const platformSchema = pgSchema('platform');

/** Agregado de coordenação `SolicitacaoEsquecimento` (plan.md, Domain). */
export const solicitacoesEsquecimento = platformSchema.table('solicitacoes_esquecimento', {
  id: uuid('id').primaryKey(),
  titularReferencia: text('titular_referencia').notNull(),
  registradaEm: timestamp('registrada_em', { withTimezone: true }).notNull(),
  prazoLimite: timestamp('prazo_limite', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  contextosEsperados: jsonb('contextos_esperados').notNull(),
});

/** Append-only — uma linha por confirmação de BC (`ConfirmacaoAnonimizacao`). */
export const confirmacoesAnonimizacao = platformSchema.table(
  'confirmacoes_anonimizacao',
  {
    id: uuid('id').primaryKey(),
    solicitacaoId: uuid('solicitacao_id')
      .notNull()
      .references(() => solicitacoesEsquecimento.id),
    boundedContext: text('bounded_context').notNull(),
    orcamentoId: uuid('orcamento_id').notNull(),
    camposAnonimizados: jsonb('campos_anonimizados').notNull(),
    confirmadoEm: timestamp('confirmado_em', { withTimezone: true }).notNull(),
  },
  (table) => [index('confirmacoes_anonimizacao_solicitacao_id_idx').on(table.solicitacaoId)],
);

/** Config mutável via API administrativa, chave = `categoriaDocumento`. */
export const politicasRetencao = platformSchema.table('politicas_retencao', {
  categoria: text('categoria').primaryKey(),
  prazoEmDias: integer('prazo_em_dias').notNull(),
  baseLegal: text('base_legal').notNull(),
  atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull(),
});

/** Append-only, correlacionável por `orcamentoId` — nunca substitui o historico do BC. */
export const trilhaAuditoriaAcesso = platformSchema.table(
  'trilha_auditoria_acesso',
  {
    id: uuid('id').primaryKey(),
    orcamentoId: uuid('orcamento_id').notNull(),
    ator: text('ator').notNull(),
    acao: text('acao').notNull(),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
  },
  (table) => [index('trilha_auditoria_acesso_orcamento_id_idx').on(table.orcamentoId)],
);

/** Config de quais BCs devem confirmar (`contextosEsperados`), mantida por quem arquiteta cada BC. */
export const contextosComDadoPessoal = platformSchema.table('contextos_com_dado_pessoal', {
  boundedContext: text('bounded_context').primaryKey(),
  possuiDadoPessoal: boolean('possui_dado_pessoal').notNull(),
});
