ALTER TABLE "orcamentos" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orcamentos_historico" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
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