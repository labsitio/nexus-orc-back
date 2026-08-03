ALTER TABLE "busca_indexacao"."indices_orcamento" ADD COLUMN "estado" text NOT NULL;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" ADD COLUMN "conteudo_indexavel" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" ADD COLUMN "origem_validacao" text NOT NULL;--> statement-breakpoint
-- indices_orcamento_historico baseline (T003/0009) tinha "id" como uuid sem
-- nenhuma linha jamais gravada nesta fase (BC ainda não está em produção) —
-- recriar como bigserial é mais seguro que ALTER COLUMN ... TYPE bigserial,
-- que não é uma conversão válida em Postgres (bigserial é açúcar sintático
-- exclusivo de CREATE TABLE, não um tipo de coluna real para ALTER). Mesmo
-- ajuste manual de 0011_validacoes_orcamento_faixas_preco_reais.sql.
DROP TABLE "busca_indexacao"."indices_orcamento_historico";--> statement-breakpoint
CREATE TABLE "busca_indexacao"."indices_orcamento_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"indice_orcamento_id" uuid NOT NULL,
	"resultado" text NOT NULL,
	"modelo_embedding" text,
	"motivo_falha" text,
	"ocorreu_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" ADD CONSTRAINT "indices_orcamento_historico_indice_orcamento_id_fk" FOREIGN KEY ("indice_orcamento_id") REFERENCES "busca_indexacao"."indices_orcamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indices_orcamento_historico_indice_orcamento_id_idx" ON "busca_indexacao"."indices_orcamento_historico" USING btree ("indice_orcamento_id");--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" ADD CONSTRAINT "indices_orcamento_estado_valido" CHECK (estado in ('PENDENTE', 'INDEXADO', 'FALHA_INDEXACAO'));--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento" ADD CONSTRAINT "indices_orcamento_origem_validacao_valida" CHECK (origem_validacao in ('VALIDADO', 'VALIDADO_COM_RESSALVA'));--> statement-breakpoint
ALTER TABLE "busca_indexacao"."indices_orcamento_historico" ADD CONSTRAINT "indices_orcamento_historico_resultado_valido" CHECK (resultado in ('INDEXADO', 'FALHA_TECNICA'));--> statement-breakpoint
-- indices_orcamento_historico é append-only (plan.md: "histórico nunca
-- sobrescrito, sem limite estrutural de tentativas"): falha alta e
-- explícita (RAISE EXCEPTION), nunca silenciosa. Mesmo padrão de
-- extracoes_orcamento_historico/validacoes_orcamento_historico.
CREATE FUNCTION "busca_indexacao"."indices_orcamento_historico_bloquear_update_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'indices_orcamento_historico é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_indices_orcamento_historico_bloquear_update
  BEFORE UPDATE ON "busca_indexacao"."indices_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "busca_indexacao"."indices_orcamento_historico_bloquear_update_delete"();
--> statement-breakpoint
CREATE TRIGGER trg_indices_orcamento_historico_bloquear_delete
  BEFORE DELETE ON "busca_indexacao"."indices_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "busca_indexacao"."indices_orcamento_historico_bloquear_update_delete"();
