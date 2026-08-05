import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  foreignKey,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { STATUS_DECISAO_WORKFLOW } from '../../../domain/aggregates/decisao-workflow.aggregate.js';
import { AGENTES_ORIGEM_DECISAO } from '../../../domain/value-objects/decisao-roteamento.vo.js';

// Schema Aurora dedicado ao BC Orquestração (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T002 foi o baseline (tabelas vazias). T015 evolui as mesmas
// tabelas com o mapeamento completo do agregado `DecisaoWorkflow`
// (contextos/decisão em JSONB, mesmo racional YAGNI do ADR-004 da spec 002)
// e o histórico append-only real (mesmo padrão de
// extracoes_orcamento_historico/validacoes_orcamento_historico/indices_orcamento_historico).
export const orquestracaoSchema = pgSchema('orquestracao');

// `status`/`agente` como text + CHECK (mesmo padrão de
// validacao-orcamento.schema.ts/indice-orcamento.schema.ts) em vez de
// pgEnum — evita escopo de enum cross-schema, suficiente para os enums
// fechados do Domain.
const emValoresValidos = (coluna: string, valores: readonly string[]) =>
  sql.raw(`${coluna} in (${valores.map((v) => `'${v}'`).join(', ')})`);

/** Estado atual do agregado `DecisaoWorkflow` — uma linha por `OrcamentoId` (id reutilizado, nunca gerado por este BC). */
export const decisoesWorkflow = orquestracaoSchema.table(
  'decisoes_workflow',
  {
    id: uuid('id').primaryKey(),
    status: text('status').notNull(),
    // ContextoClassificacao/Extracao/Validacao — cópias imutáveis traduzidas
    // via ACL (T017), JSONB porque não há invariante de negócio sobre coluna
    // isolada além do agregado em si (mesma decisão de ADR-004 aplicada em
    // extracao/validacao/busca-indexacao). Ausentes até o respectivo evento
    // upstream chegar (`AGUARDANDO_CONTEXTO`).
    contextoClassificacao: jsonb('contexto_classificacao'),
    contextoExtracao: jsonb('contexto_extracao'),
    contextoValidacao: jsonb('contexto_validacao'),
    // DecisaoRoteamento — presente só a partir de `DECIDIDO`.
    decisaoAtual: jsonb('decisao_atual'),
    // (issue #656 — RLS/repositório tenant-scoped, spec 007 ADR-008
    // amendment) `NOT NULL` desde a migração 0020: zero linha em produção
    // (#587/#297), sem passo de backfill — imutável após o primeiro upstream
    // que o traz (`DrizzleDecisaoWorkflowRepository.salvar`, fora do `set` de
    // update).
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    index('decisoes_workflow_tenant_id_idx').on(table.tenantId),
    check('decisoes_workflow_status_valido', emValoresValidos('status', STATUS_DECISAO_WORKFLOW)),
  ],
);

/**
 * Histórico append-only de `TentativaDecisaoWorkflow` (plan.md: "histórico
 * nunca sobrescrito, apenas anexado"). A garantia de imutabilidade em nível
 * de linha vem da migração SQL (triggers `RAISE EXCEPTION` em
 * UPDATE/DELETE, mesmo padrão de
 * extracoes_orcamento_historico/validacoes_orcamento_historico/indices_orcamento_historico).
 */
export const decisoesWorkflowHistorico = orquestracaoSchema.table(
  'decisoes_workflow_historico',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    decisaoWorkflowId: uuid('decisao_workflow_id').notNull(),
    // (issue #656) Mesmo padrão de `orcamentos_historico.tenant_id` (spec 001,
    // migração 0013) — RLS sobre o histórico exige a própria coluna.
    tenantId: uuid('tenant_id').notNull(),
    agente: text('agente').notNull(),
    // DecisaoRoteamento completa quando a tentativa teve sucesso; mutuamente
    // exclusiva com `motivo_insucesso` (TentativaDecisaoWorkflow.de —
    // "exatamente um dos dois está presente, nunca ambos, nunca nenhum").
    resultado: jsonb('resultado'),
    motivoInsucesso: text('motivo_insucesso'),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('decisoes_workflow_historico_decisao_workflow_id_idx').on(table.decisaoWorkflowId),
    index('decisoes_workflow_historico_tenant_id_idx').on(table.tenantId),
    check(
      'decisoes_workflow_historico_agente_valido',
      emValoresValidos('agente', AGENTES_ORIGEM_DECISAO),
    ),
    check(
      'decisoes_workflow_historico_resultado_xor_motivo',
      sql.raw(
        '(resultado is not null and motivo_insucesso is null) or (resultado is null and motivo_insucesso is not null)',
      ),
    ),
    // Nome explícito e curto: o nome padrão gerado pelo Drizzle passa de 63
    // bytes (limite NAMEDATALEN do Postgres) e é truncado silenciosamente,
    // quebrando qualquer verificação por nome exato (ex.: teste de
    // integração que espera essa constraint no erro de violação).
    foreignKey({
      name: 'decisoes_workflow_historico_decisao_workflow_id_fk',
      columns: [table.decisaoWorkflowId],
      foreignColumns: [decisoesWorkflow.id],
    }),
  ],
);
