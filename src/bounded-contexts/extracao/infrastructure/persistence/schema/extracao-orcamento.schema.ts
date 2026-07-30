import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { AGENTES_ORIGEM_CAMPO } from '../../../domain/value-objects/campo-extraido.vo.js';
import { AGENTES_ORIGEM_CLASSIFICACAO } from '../../../domain/value-objects/referencia-classificacao.vo.js';
import { STATUS_EXTRACAO } from '../../../domain/extracao-orcamento.aggregate.js';

// Schema Aurora dedicado ao BC Extração (plan.md, seção Infrastructure;
// ADR-001 herdado da spec 001 — Drizzle Kit gera migração por diff deste
// arquivo). T002 foi o baseline (tabelas vazias). T012 evolui as mesmas
// tabelas com as colunas reais: itens/condições comerciais em JSONB
// (ADR-004 — sem tabela normalizada nesta fase) e histórico append-only.
export const extracaoSchema = pgSchema('extracao');

// `status`/`agente` como text + CHECK (mesmo padrão de platform.schema.ts
// nesta pg schema dedicada) em vez de pgEnum — evita escopo de enum
// cross-schema, suficiente para os enums fechados do Domain.
const emValoresValidos = (coluna: string, valores: readonly string[]) =>
  sql.raw(`${coluna} in (${valores.map((v) => `'${v}'`).join(', ')})`);

/** Estado atual do agregado `ExtracaoOrcamento` — uma linha por `OrcamentoId`. */
export const extracoesOrcamento = extracaoSchema.table(
  'extracoes_orcamento',
  {
    id: uuid('id').primaryKey(),
    status: text('status').notNull(),
    referenciaClassificacaoFornecedorIdentificado: text(
      'referencia_classificacao_fornecedor_identificado',
    ).notNull(),
    referenciaClassificacaoFormatoIdentificado: text(
      'referencia_classificacao_formato_identificado',
    ).notNull(),
    referenciaClassificacaoAgenteOrigem: text('referencia_classificacao_agente_origem').notNull(),
    referenciaBrutaS3Bucket: text('referencia_bruta_s3_bucket').notNull(),
    referenciaBrutaS3Key: text('referencia_bruta_s3_key').notNull(),
    referenciaBrutaS3VersionId: text('referencia_bruta_s3_version_id').notNull(),
    // ItemOrcamento[] — ADR-004: JSONB, nunca tabela normalizada nesta fase.
    itens: jsonb('itens').notNull().default([]),
    // CondicoesComerciais — ausente até a 1ª tentativa (ExtracaoOrcamento.criar()).
    condicoesComerciais: jsonb('condicoes_comerciais'),
  },
  () => [
    check('extracoes_orcamento_status_valido', emValoresValidos('status', STATUS_EXTRACAO)),
    check(
      'extracoes_orcamento_ref_classificacao_agente_valido',
      emValoresValidos('referencia_classificacao_agente_origem', AGENTES_ORIGEM_CLASSIFICACAO),
    ),
  ],
);

/**
 * Histórico append-only de `TentativaExtracao` (plan.md: "histórico de
 * tentativas nunca sobrescrito"). A garantia de imutabilidade em nível de
 * linha vem da migração SQL (triggers `RAISE EXCEPTION` em UPDATE/DELETE,
 * mesmo padrão de `orcamentos_historico` na spec 001) — nunca confiar só na
 * disciplina do repositório.
 */
export const extracoesOrcamentoHistorico = extracaoSchema.table(
  'extracoes_orcamento_historico',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    extracaoOrcamentoId: uuid('extracao_orcamento_id')
      .notNull()
      .references(() => extracoesOrcamento.id),
    agente: text('agente').notNull(),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
    resultado: text('resultado'),
    motivoInsucesso: text('motivo_insucesso'),
  },
  (table) => [
    index('extracoes_orcamento_historico_extracao_orcamento_id_idx').on(table.extracaoOrcamentoId),
    check(
      'extracoes_orcamento_historico_agente_valido',
      emValoresValidos('agente', AGENTES_ORIGEM_CAMPO),
    ),
    // TentativaExtracao é sucesso() xor insucesso() — nunca ambos, nunca nenhum.
    check(
      'extracoes_orcamento_historico_sucesso_xor_insucesso',
      sql`
        (${table.resultado} is not null and ${table.motivoInsucesso} is null) or
        (${table.resultado} is null and ${table.motivoInsucesso} is not null)
      `,
    ),
  ],
);
