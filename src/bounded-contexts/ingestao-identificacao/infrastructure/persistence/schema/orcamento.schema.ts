import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigserial,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { CANAIS_VALIDOS } from '../../../domain/value-objects/canal.vo.js';
import { AGENTES_ORIGEM } from '../../../domain/value-objects/resultado-classificacao.vo.js';
import { STATUS_ORCAMENTO } from '../../../domain/orcamento.aggregate.js';

/**
 * Enums Postgres espelhando os enums fechados do Domain (canal.vo.ts,
 * orcamento.aggregate.ts, resultado-classificacao.vo.ts) — nunca a
 * inversa: o Domain nunca importa nada deste arquivo (plan.md, camada
 * Infrastructure).
 */
export const canalEnum = pgEnum('canal', CANAIS_VALIDOS);
export const statusOrcamentoEnum = pgEnum('status_orcamento', STATUS_ORCAMENTO);
export const agenteOrigemEnum = pgEnum('agente_origem', AGENTES_ORIGEM);

/** `NivelConfianca` (Domain) nunca aceita inteiro fora de 0–100 — reforçado aqui via CHECK. */
const nivelConfiancaEmFaixa = (coluna: AnyPgColumn) =>
  sql`(${coluna} is null or (${coluna} >= 0 and ${coluna} <= 100))`;

/** Estado atual do agregado `Orcamento` — uma linha por `OrcamentoId`. */
export const orcamentos = pgTable(
  'orcamentos',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    canal: canalEnum('canal').notNull(),
    recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull(),
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    versionId: text('version_id').notNull(),
    referenciaExterna: text('referencia_externa'),
    status: statusOrcamentoEnum('status').notNull(),
    resultadoFornecedorIdentificado: text('resultado_fornecedor_identificado'),
    resultadoFormatoIdentificado: text('resultado_formato_identificado'),
    resultadoNivelConfianca: integer('resultado_nivel_confianca'),
    resultadoAgenteOrigem: agenteOrigemEnum('resultado_agente_origem'),
  },
  (table) => [
    index('orcamentos_tenant_id_idx').on(table.tenantId),
    check(
      'orcamentos_nivel_confianca_em_faixa',
      nivelConfiancaEmFaixa(table.resultadoNivelConfianca),
    ),
    // ResultadoClassificacao (VO) só existe completo — Orcamento.resultadoAtual é
    // undefined até haver decisão (status RECEBIDO); a partir daí os 4 campos do
    // grupo "resultado" são preenchidos juntos, nunca parcialmente.
    check(
      'orcamentos_resultado_completo_ou_ausente',
      sql`
        (
          ${table.resultadoFornecedorIdentificado} is null
          and ${table.resultadoFormatoIdentificado} is null
          and ${table.resultadoNivelConfianca} is null
          and ${table.resultadoAgenteOrigem} is null
        ) or (
          ${table.resultadoFornecedorIdentificado} is not null
          and ${table.resultadoFormatoIdentificado} is not null
          and ${table.resultadoNivelConfianca} is not null
          and ${table.resultadoAgenteOrigem} is not null
        )
      `,
    ),
  ],
);

/**
 * Histórico append-only de `TentativaClassificacao` (plan.md: "nunca
 * UPDATE/DELETE, apenas INSERT"). A garantia de imutabilidade em nível de
 * linha vem da migração SQL (triggers `RAISE EXCEPTION` em UPDATE/DELETE,
 * ver `drizzle/<timestamp>_*.sql` gerado a partir deste schema) — nunca
 * confiar só na disciplina do repositório.
 */
export const orcamentosHistorico = pgTable(
  'orcamentos_historico',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    orcamentoId: uuid('orcamento_id')
      .notNull()
      .references(() => orcamentos.id),
    agente: agenteOrigemEnum('agente').notNull(),
    ocorreuEm: timestamp('ocorreu_em', { withTimezone: true }).notNull(),
    resultadoFornecedorIdentificado: text('resultado_fornecedor_identificado'),
    resultadoFormatoIdentificado: text('resultado_formato_identificado'),
    resultadoNivelConfianca: integer('resultado_nivel_confianca'),
    motivoInsucesso: text('motivo_insucesso'),
  },
  (table) => [
    index('orcamentos_historico_orcamento_id_idx').on(table.orcamentoId),
    index('orcamentos_historico_tenant_id_idx').on(table.tenantId),
    check(
      'orcamentos_historico_nivel_confianca_em_faixa',
      nivelConfiancaEmFaixa(table.resultadoNivelConfianca),
    ),
    // TentativaClassificacao (VO) é sucesso() xor insucesso() — o grupo "resultado"
    // (fornecedor, formato, nível) é preenchido junto, nunca parcialmente, e nunca
    // junto com motivoInsucesso.
    check(
      'orcamentos_historico_sucesso_xor_insucesso',
      sql`
        (
          ${table.resultadoFornecedorIdentificado} is not null
          and ${table.resultadoFormatoIdentificado} is not null
          and ${table.resultadoNivelConfianca} is not null
          and ${table.motivoInsucesso} is null
        ) or (
          ${table.resultadoFornecedorIdentificado} is null
          and ${table.resultadoFormatoIdentificado} is null
          and ${table.resultadoNivelConfianca} is null
          and ${table.motivoInsucesso} is not null
        )
      `,
    ),
  ],
);
