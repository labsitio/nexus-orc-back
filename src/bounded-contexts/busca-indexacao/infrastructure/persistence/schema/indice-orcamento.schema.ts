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
  vector,
} from 'drizzle-orm/pg-core';
import { ESTADOS_INDEXACAO } from '../../../domain/aggregates/indice-orcamento.aggregate.js';
import { RESULTADOS_TENTATIVA_INDEXACAO } from '../../../domain/value-objects/tentativa-indexacao.vo.js';
import { VALORES_ORIGEM_VALIDACAO } from '../../../domain/value-objects/origem-validacao.vo.js';

// Schema Aurora dedicado ao BC Busca & Indexação (plan.md, seção
// Infrastructure; ADR-001 herdado da spec 001 — Drizzle Kit gera migração
// por diff deste arquivo). T003/0009 foi o baseline (tabelas praticamente
// vazias, mas já com a extensão pgvector e a coluna/índice `embedding`).
// T015 evolui as mesmas tabelas com o mapeamento completo do agregado
// `IndiceOrcamento` (estado, `conteudo_indexavel` JSONB, `origem_validacao`)
// e o histórico append-only real (mesmo padrão de
// extracoes_orcamento_historico/validacoes_orcamento_historico).
export const buscaIndexacaoSchema = pgSchema('busca_indexacao');

// `estado`/`origem`/`resultado` como text + CHECK (mesmo padrão de
// validacao-orcamento.schema.ts) em vez de pgEnum — evita escopo de enum
// cross-schema, suficiente para os enums fechados do Domain.
const emValoresValidos = (coluna: string, valores: readonly string[]) =>
  sql.raw(`${coluna} in (${valores.map((v) => `'${v}'`).join(', ')})`);

/** Estado atual do agregado `IndiceOrcamento` — uma linha por `OrcamentoId` (id reutilizado, nunca gerado por este BC). */
export const indicesOrcamento = buscaIndexacaoSchema.table(
  'indices_orcamento',
  {
    id: uuid('id').primaryKey(),
    estado: text('estado').notNull(),
    // ConteudoIndexavel — cópia traduzida via OrcamentoValidadoEventACL
    // (T018), JSONB porque não há invariante de negócio sobre linha isolada
    // além do agregado em si (mesma decisão de ADR-004 aplicada em
    // extracao/validacao).
    conteudoIndexavel: jsonb('conteudo_indexavel').notNull(),
    // OrigemValidacao — preservada para nunca omitir do índice um
    // orçamento "validado com ressalva" (ADR-004, plan.md).
    origemValidacao: text('origem_validacao').notNull(),
    // Ausente enquanto `estado !== 'INDEXADO'` (PENDENTE ou FALHA_INDEXACAO
    // nunca têm embedding persistido — nunca existe "indexado parcialmente").
    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (table) => [
    index('indices_orcamento_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    check('indices_orcamento_estado_valido', emValoresValidos('estado', ESTADOS_INDEXACAO)),
    check(
      'indices_orcamento_origem_validacao_valida',
      emValoresValidos('origem_validacao', VALORES_ORIGEM_VALIDACAO),
    ),
  ],
);

/**
 * Histórico append-only de `TentativaIndexacao` (plan.md: "histórico nunca
 * sobrescrito, sem limite estrutural de tentativas"). A garantia de
 * imutabilidade em nível de linha vem da migração SQL (triggers `RAISE
 * EXCEPTION` em UPDATE/DELETE, mesmo padrão de
 * extracoes_orcamento_historico/validacoes_orcamento_historico).
 */
export const indicesOrcamentoHistorico = buscaIndexacaoSchema.table(
  'indices_orcamento_historico',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    indiceOrcamentoId: uuid('indice_orcamento_id').notNull(),
    resultado: text('resultado').notNull(),
    modeloEmbedding: text('modelo_embedding'),
    motivoFalha: text('motivo_falha'),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('indices_orcamento_historico_indice_orcamento_id_idx').on(table.indiceOrcamentoId),
    check(
      'indices_orcamento_historico_resultado_valido',
      emValoresValidos('resultado', RESULTADOS_TENTATIVA_INDEXACAO),
    ),
    // Nome explícito e curto: o nome padrão gerado pelo Drizzle passa de 63
    // bytes (limite NAMEDATALEN do Postgres) e é truncado silenciosamente,
    // quebrando qualquer verificação por nome exato (ex.: teste de
    // integração que espera essa constraint no erro de violação).
    foreignKey({
      name: 'indices_orcamento_historico_indice_orcamento_id_fk',
      columns: [table.indiceOrcamentoId],
      foreignColumns: [indicesOrcamento.id],
    }),
  ],
);
