import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

/**
 * Mapeamento usuário/servidor (AWS Transfer Family) → tenant (T006,
 * `specs/007-isolamento-multitenant-dados/plan.md`). Preenchido no
 * onboarding operacional do tenant (fora de escopo desta spec, mesmo
 * padrão do custom attribute Cognito — ver `specs/007-isolamento-multitenant-dados/infra/`).
 * Resolvido pelo trigger Lambda do canal SFTP a partir de
 * `aws:transfer:server-id`/`aws:transfer:user-name` (tags do objeto S3
 * atribuídas automaticamente pelo AWS Transfer Family) — nunca do
 * conteúdo do arquivo.
 */
export const sftpTenantMapping = pgTable(
  'sftp_tenant_mapping',
  {
    servidorId: text('servidor_id').notNull(),
    usuario: text('usuario').notNull(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.servidorId, table.usuario] })],
);
