ALTER TABLE "orquestracao"."decisoes_workflow" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ADD COLUMN "contexto_classificacao" jsonb;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ADD COLUMN "contexto_extracao" jsonb;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ADD COLUMN "contexto_validacao" jsonb;--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ADD COLUMN "decisao_atual" jsonb;--> statement-breakpoint
-- decisoes_workflow_historico baseline (T002/0012) tinha "id" como uuid sem
-- nenhuma linha jamais gravada nesta fase (BC ainda não está em produção) —
-- recriar como bigserial é mais seguro que ALTER COLUMN ... TYPE bigserial,
-- que não é uma conversão válida em Postgres (bigserial é açúcar sintático
-- exclusivo de CREATE TABLE, não um tipo de coluna real para ALTER). Mesmo
-- ajuste manual de 0011_validacoes_orcamento_faixas_preco_reais.sql/
-- 0014_indices_orcamento_completo.sql.
DROP TABLE "orquestracao"."decisoes_workflow_historico";--> statement-breakpoint
CREATE TABLE "orquestracao"."decisoes_workflow_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"decisao_workflow_id" uuid NOT NULL,
	"agente" text NOT NULL,
	"resultado" jsonb,
	"motivo_insucesso" text,
	"ocorreu_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- Nome explícito e curto: o nome padrão que o Drizzle geraria aqui
-- excede o limite NAMEDATALEN (63 bytes) do Postgres e seria truncado
-- silenciosamente na criação, quebrando qualquer verificação por nome
-- exato dessa constraint (ex.: teste de integração que espera esse nome
-- no erro de violação de FK).
ALTER TABLE "orquestracao"."decisoes_workflow_historico" ADD CONSTRAINT "decisoes_workflow_historico_decisao_workflow_id_fk" FOREIGN KEY ("decisao_workflow_id") REFERENCES "orquestracao"."decisoes_workflow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decisoes_workflow_historico_decisao_workflow_id_idx" ON "orquestracao"."decisoes_workflow_historico" USING btree ("decisao_workflow_id");--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow" ADD CONSTRAINT "decisoes_workflow_status_valido" CHECK (status in ('AGUARDANDO_CONTEXTO', 'CONTEXTO_CONSOLIDADO', 'DECIDIDO', 'PENDENTE_REVISAO_HUMANA'));--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow_historico" ADD CONSTRAINT "decisoes_workflow_historico_agente_valido" CHECK (agente in ('ORQUESTRADOR', 'HUMANO'));--> statement-breakpoint
ALTER TABLE "orquestracao"."decisoes_workflow_historico" ADD CONSTRAINT "decisoes_workflow_historico_resultado_xor_motivo" CHECK ((resultado is not null and motivo_insucesso is null) or (resultado is null and motivo_insucesso is not null));--> statement-breakpoint
-- decisoes_workflow_historico é append-only (plan.md: "histórico nunca
-- sobrescrito, apenas anexado"): falha alta e explícita (RAISE EXCEPTION),
-- nunca silenciosa. Mesmo padrão de
-- extracoes_orcamento_historico/validacoes_orcamento_historico/indices_orcamento_historico.
CREATE FUNCTION "orquestracao"."decisoes_workflow_historico_bloquear_update_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'decisoes_workflow_historico é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_decisoes_workflow_historico_bloquear_update
  BEFORE UPDATE ON "orquestracao"."decisoes_workflow_historico"
  FOR EACH ROW EXECUTE FUNCTION "orquestracao"."decisoes_workflow_historico_bloquear_update_delete"();
--> statement-breakpoint
CREATE TRIGGER trg_decisoes_workflow_historico_bloquear_delete
  BEFORE DELETE ON "orquestracao"."decisoes_workflow_historico"
  FOR EACH ROW EXECUTE FUNCTION "orquestracao"."decisoes_workflow_historico_bloquear_update_delete"();
