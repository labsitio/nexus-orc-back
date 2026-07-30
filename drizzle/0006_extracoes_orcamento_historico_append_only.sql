-- extracoes_orcamento_historico é append-only (plan.md: "histórico de
-- tentativas nunca sobrescrito", Princípio I/IV da constituição): falha alta
-- e explícita (RAISE EXCEPTION), nunca silenciosa. Mesmo padrão de
-- orcamentos_historico (spec 001, 0001_orcamentos_historico_append_only.sql).
CREATE FUNCTION "extracao"."extracoes_orcamento_historico_bloquear_update_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'extracoes_orcamento_historico é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_extracoes_orcamento_historico_bloquear_update
  BEFORE UPDATE ON "extracao"."extracoes_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "extracao"."extracoes_orcamento_historico_bloquear_update_delete"();
--> statement-breakpoint
CREATE TRIGGER trg_extracoes_orcamento_historico_bloquear_delete
  BEFORE DELETE ON "extracao"."extracoes_orcamento_historico"
  FOR EACH ROW EXECUTE FUNCTION "extracao"."extracoes_orcamento_historico_bloquear_update_delete"();
