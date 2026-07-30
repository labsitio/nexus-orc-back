import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

/**
 * Contrato de idempotência da borda REST de `ReceberOrcamento` (plan.md:
 * "aceita Idempotency-Key opcional... se repetida dentro de 24h, retorna o
 * OrcamentoId já existente sem duplicar o registro"). Implementado em
 * Infrastructure sobre a tabela `idempotency_keys` (TTL 24h).
 */
export interface IdempotencyKeyRepository {
  /** `undefined` se a chave nunca foi vista ou já expirou (TTL). */
  buscarOrcamentoId(chave: string): Promise<OrcamentoId | undefined>;
  registrar(chave: string, orcamentoId: OrcamentoId, expiraEm: Date): Promise<void>;
}
