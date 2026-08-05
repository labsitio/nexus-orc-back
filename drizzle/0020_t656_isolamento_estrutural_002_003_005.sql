-- Issue #656 — fecha a assimetria de isolamento estrutural entre 001/004
-- (RLS + repositório tenant-scoped já presentes desde as migrações 0013/0016)
-- e 002/003/005 (T046 havia deixado a coluna nullable/sem RLS, registrado
-- como resíduo intencional de sequenciamento no cutover de contract #632).
--
-- Sem passo de backfill: zero tenant real e zero linha em produção nestas 3
-- tabelas (#587/#297/T045) — diferente do `DEFAULT` provisório que
-- 0013/0016 precisaram usar para tabelas já povoadas por specs anteriores.
ALTER TABLE "extracao"."extracoes_orcamento" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento_historico" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow_historico" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "extracoes_orcamento_tenant_id_idx" ON "extracao"."extracoes_orcamento" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "extracoes_orcamento_historico_tenant_id_idx" ON "extracao"."extracoes_orcamento_historico" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "validacoes_orcamento_tenant_id_idx" ON "validacao"."validacoes_orcamento" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "validacoes_orcamento_historico_tenant_id_idx" ON "validacao"."validacoes_orcamento_historico" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "decisoes_workflow_tenant_id_idx" ON "orquestracao"."decisoes_workflow" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "decisoes_workflow_historico_tenant_id_idx" ON "orquestracao"."decisoes_workflow_historico" USING btree ("tenant_id");--> statement-breakpoint
-- Isolamento multi-tenant estrutural (mesmo padrão de
-- 0013_rls_orcamentos_tenant_isolation.sql/0016_t015b_rls_indices_orcamento_tenant_isolation.sql,
-- spec 007 ADR-008): RLS é a garantia final que sustenta "0 vazamento
-- cross-tenant, mesmo em erro do sistema" — não depende de nenhum
-- repositório presente ou futuro filtrar corretamente por tenant_id.
-- FORCE ROW LEVEL SECURITY aplica a política mesmo à role dona da tabela.
ALTER TABLE "extracao"."extracoes_orcamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento_historico" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow_historico" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "extracao"."extracoes_orcamento"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "extracao"."extracoes_orcamento_historico"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "validacao"."validacoes_orcamento"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "validacao"."validacoes_orcamento_historico"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "orquestracao"."decisoes_workflow"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "orquestracao"."decisoes_workflow_historico"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);