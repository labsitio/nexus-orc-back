-- orcamentos_historico é append-only (plan.md, Princípio I/IV da constituição):
-- rastreabilidade exige que nenhuma linha de histórico seja alterada ou apagada
-- depois de gravada. Falha alta e explícita (RAISE EXCEPTION), nunca silenciosa.
CREATE FUNCTION orcamentos_historico_bloquear_update_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'orcamentos_historico é append-only: % não permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_orcamentos_historico_bloquear_update
  BEFORE UPDATE ON "orcamentos_historico"
  FOR EACH ROW EXECUTE FUNCTION orcamentos_historico_bloquear_update_delete();
--> statement-breakpoint
CREATE TRIGGER trg_orcamentos_historico_bloquear_delete
  BEFORE DELETE ON "orcamentos_historico"
  FOR EACH ROW EXECUTE FUNCTION orcamentos_historico_bloquear_update_delete();
