CREATE TABLE "validacao"."faixas_preco_categoria" (
	"categoria" text PRIMARY KEY NOT NULL,
	"preco_minimo_centavos" integer NOT NULL,
	"preco_maximo_centavos" integer NOT NULL,
	"moeda" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ADD COLUMN "dados_extraidos" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ADD COLUMN "inconsistencias" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- validacoes_orcamento_historico baseline (T005) tinha "id" como uuid sem
-- nenhuma linha jamais gravada nesta fase (BC ainda não está em produção) —
-- recriar como bigserial é mais seguro que ALTER COLUMN ... TYPE bigserial,
-- que não é uma conversão válida em Postgres (bigserial é açúcar sintático
-- exclusivo de CREATE TABLE, não um tipo de coluna real para ALTER).
DROP TABLE "validacao"."validacoes_orcamento_historico";--> statement-breakpoint
CREATE TABLE "validacao"."validacoes_orcamento_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"orcamento_validacao_id" uuid NOT NULL,
	"resultado" text NOT NULL,
	"inconsistencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ocorreu_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento_historico" ADD CONSTRAINT "validacoes_orcamento_historico_orcamento_validacao_id_validacoes_orcamento_id_fk" FOREIGN KEY ("orcamento_validacao_id") REFERENCES "validacao"."validacoes_orcamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validacoes_orcamento_historico_orcamento_validacao_id_idx" ON "validacao"."validacoes_orcamento_historico" USING btree ("orcamento_validacao_id");--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento" ADD CONSTRAINT "validacoes_orcamento_status_valido" CHECK (status in ('PENDENTE', 'VALIDADO', 'PENDENTE_REVISAO_HUMANA', 'VALIDADO_COM_RESSALVA'));--> statement-breakpoint
ALTER TABLE "validacao"."validacoes_orcamento_historico" ADD CONSTRAINT "validacoes_orcamento_historico_resultado_valido" CHECK (resultado in ('VALIDADO', 'INCONSISTENTE', 'ACEITE_COM_RESSALVA'));--> statement-breakpoint
-- validacoes_orcamento_historico é append-only (plan.md: "histórico nunca
-- sobrescrito"): falha alta e explícita (RAISE EXCEPTION), nunca silenciosa.
-- Mesmo padrão de extracoes_orcamento_historico
-- (0006_extracoes_orcamento_historico_append_only.sql).
CREATE FUNCTION "validacao"."validacoes_orcamento_historico_bloquear_update_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'validacoes_orcamento_historico é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_validacoes_orcamento_historico_bloquear_update
  BEFORE UPDATE ON "validacao"."validacoes_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "validacao"."validacoes_orcamento_historico_bloquear_update_delete"();
--> statement-breakpoint
CREATE TRIGGER trg_validacoes_orcamento_historico_bloquear_delete
  BEFORE DELETE ON "validacao"."validacoes_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "validacao"."validacoes_orcamento_historico_bloquear_update_delete"();
