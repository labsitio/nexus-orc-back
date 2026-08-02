-- Expand/contract (ADR-005, T015b retrofit): `ADD COLUMN ... NOT NULL` sem
-- `DEFAULT` falha se a tabela já tiver linha em qualquer ambiente. `DEFAULT`
-- provisório backfilla linhas existentes com o mesmo placeholder já usado em
-- 0013_rls_orcamentos_tenant_isolation.sql e é removido em seguida — nenhuma
-- linha nova depende dele, `indice-orcamento.schema.ts` não declara default
-- (T018/T029 propagam o tenantId real via OrcamentoValidadoEventACL).
ALTER TABLE "busca_indexacao"."indices_orcamento" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000000';--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000000';--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "indices_orcamento_tenant_id_idx" ON "busca_indexacao"."indices_orcamento" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "indices_orcamento_historico_tenant_id_idx" ON "busca_indexacao"."indices_orcamento_historico" USING btree ("tenant_id");--> statement-breakpoint
-- Isolamento multi-tenant estrutural (ADR-005, T015b — mesmo padrão de
-- 0013_rls_orcamentos_tenant_isolation.sql, spec 007 T007): RLS é a garantia
-- final que sustenta "0 vazamento cross-tenant, mesmo em erro do sistema" —
-- não depende de nenhum repositório presente ou futuro filtrar corretamente
-- por tenant_id. FORCE ROW LEVEL SECURITY aplica a política mesmo à role
-- dona da tabela.
ALTER TABLE "busca_indexacao"."indices_orcamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "busca_indexacao"."indices_orcamento"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "busca_indexacao"."indices_orcamento_historico"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);