import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Mapa `Idempotency-Key` → `OrcamentoId` (T020/#25, ADR de idempotência do
 * plan.md). `expiraEm` é o TTL de 24h — leitura filtra por `expiraEm > now()`
 * (Infra, `DrizzleIdempotencyKeyRepository`); expurgo físico de linha expirada
 * fica para um job de limpeza futuro, não bloqueia a leitura correta.
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
  chave: text('chave').primaryKey(),
  orcamentoId: uuid('orcamento_id').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
});
