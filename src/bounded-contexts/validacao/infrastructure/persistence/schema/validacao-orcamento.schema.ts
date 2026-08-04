import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { STATUS_VALIDACAO } from '../../../domain/orcamento-validacao.aggregate.js';
import { RESULTADOS_TENTATIVA_VALIDACAO } from '../../../domain/value-objects/tentativa-validacao.vo.js';

// Schema Aurora dedicado ao BC Validação (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T005 foi o baseline (tabelas vazias). T013 evolui as mesmas
// tabelas com as colunas reais (dados_extraidos/inconsistencias em JSONB,
// ADR-004-like — sem tabela normalizada nesta fase) e adiciona
// `faixas_preco_categoria` (configuração operacional, T013).
export const validacaoSchema = pgSchema('validacao');

// `status`/`resultado` como text + CHECK (mesmo padrão de
// extracao-orcamento.schema.ts) em vez de pgEnum — evita escopo de enum
// cross-schema, suficiente para os enums fechados do Domain.
const emValoresValidos = (coluna: string, valores: readonly string[]) =>
  sql.raw(`${coluna} in (${valores.map((v) => `'${v}'`).join(', ')})`);

/** Estado atual do agregado `OrcamentoValidacao` — uma linha por `OrcamentoId`. */
export const validacoesOrcamento = validacaoSchema.table(
  'validacoes_orcamento',
  {
    id: uuid('id').primaryKey(),
    // (issue #649 — expand/contract, ADR-008) Nullable até a #632 tornar
    // `tenantId` obrigatório nos 4 BCs de uma vez (mesmo padrão de
    // `extracoes_orcamento.tenant_id`, spec 002, #648).
    tenantId: uuid('tenant_id'),
    status: text('status').notNull(),
    // DadosExtraidosParaValidacao — cópia imutável traduzida via ACL (T015),
    // JSONB porque não há invariante de negócio sobre linha isolada além do
    // agregado em si (mesma decisão de ADR-004 aplicada em extracao).
    dadosExtraidos: jsonb('dados_extraidos').notNull(),
    // InconsistenciaDetectada[] da tentativa atual — substituída, nunca
    // acumulada (plan.md: "nunca acumulada a cada nova tentativa").
    inconsistencias: jsonb('inconsistencias').notNull().default([]),
  },
  () => [check('validacoes_orcamento_status_valido', emValoresValidos('status', STATUS_VALIDACAO))],
);

/**
 * Histórico append-only de `TentativaValidacao` (plan.md: "histórico nunca
 * sobrescrito"). A garantia de imutabilidade em nível de linha vem da
 * migração SQL (triggers `RAISE EXCEPTION` em UPDATE/DELETE, mesmo padrão de
 * `extracoes_orcamento_historico`, 0006_extracoes_orcamento_historico_append_only.sql).
 */
export const validacoesOrcamentoHistorico = validacaoSchema.table(
  'validacoes_orcamento_historico',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orcamentoValidacaoId: uuid('orcamento_validacao_id').notNull(),
    resultado: text('resultado').notNull(),
    inconsistencias: jsonb('inconsistencias').notNull().default([]),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('validacoes_orcamento_historico_orcamento_validacao_id_idx').on(
      table.orcamentoValidacaoId,
    ),
    check(
      'validacoes_orcamento_historico_resultado_valido',
      emValoresValidos('resultado', RESULTADOS_TENTATIVA_VALIDACAO),
    ),
    // Nome explícito e curto: o nome padrão gerado pelo Drizzle
    // (`<tabela>_<coluna>_<tabela-ref>_<coluna-ref>_fk`) passa de 63 bytes
    // (limite NAMEDATALEN do Postgres) e é truncado silenciosamente,
    // quebrando qualquer verificação por nome exato (ex.: teste de
    // integração que espera essa constraint no erro de violação).
    foreignKey({
      name: 'validacoes_orcamento_historico_orcamento_validacao_id_fk',
      columns: [table.orcamentoValidacaoId],
      foreignColumns: [validacoesOrcamento.id],
    }),
  ],
);

/**
 * Configuração operacional "faixa de preço esperada por categoria"
 * (`ParametroFaixaPrecoGateway`, T023) — parâmetro, nunca hardcoded no
 * Domain (critério de aceite spec.md "parametrizável sem nova spec").
 * `categoria` é a própria chave de configuração — nenhum id sintético
 * adicional (YAGNI: não há caso de uso para múltiplas faixas por categoria
 * nesta fase; ver "Nota de complexidade (YAGNI)" do plan.md).
 */
export const faixasPrecoCategoria = validacaoSchema.table('faixas_preco_categoria', {
  categoria: text('categoria').primaryKey(),
  precoMinimoCentavos: integer('preco_minimo_centavos').notNull(),
  precoMaximoCentavos: integer('preco_maximo_centavos').notNull(),
  moeda: text('moeda').notNull(),
});
