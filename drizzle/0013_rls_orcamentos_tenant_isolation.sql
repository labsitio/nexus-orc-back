-- Expand/contract (achado MAJOR de revisão): `ADD COLUMN ... NOT NULL` sem
-- `DEFAULT` falha se a tabela já tiver linha em qualquer ambiente (ADR-005
-- garante "nenhum tenant real em produção", não garante tabela vazia em
-- staging/dev com dado de specs 001-006 já mergeadas). `DEFAULT` provisório
-- backfilla linhas existentes com o mesmo placeholder documentado em
-- `DrizzleOrcamentoRepository` (`TENANT_ID_PROVISORIO`) e é removido em
-- seguida — nenhuma linha nova depende dele, `orcamento.schema.ts` não
-- declara default (T014/T016/T018 propagam o tenantId real).
ALTER TABLE "orcamentos" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000000';--> statement-breakpoint
ALTER TABLE "orcamentos" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orcamentos_historico" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000000';--> statement-breakpoint
ALTER TABLE "orcamentos_historico" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "orcamentos_tenant_id_idx" ON "orcamentos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "orcamentos_historico_tenant_id_idx" ON "orcamentos_historico" USING btree ("tenant_id");--> statement-breakpoint
-- Isolamento multi-tenant estrutural (plan.md ADR-003, T007): RLS é a garantia
-- final que sustenta o guardrail "0 vazamento cross-tenant, mesmo em erro do
-- sistema" — não depende de nenhum repositório presente ou futuro filtrar
-- corretamente por tenant_id. FORCE ROW LEVEL SECURITY aplica a política
-- mesmo à role dona da tabela (a Lambda role de migração/owner nunca deve
-- ler cross-tenant só por não ter sido explicitamente restringida).
ALTER TABLE "orcamentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orcamentos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orcamentos_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orcamentos_historico" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "orcamentos"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "orcamentos_historico"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);