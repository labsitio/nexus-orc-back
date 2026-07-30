import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface ReservaIdempotencia {
  /** `true` se esta chamada reservou a chave de verdade (livre ou TTL expirado) — só então persistir/publicar. */
  readonly reservado: boolean;
  /**
   * `OrcamentoId` autoritativo para esta chave: o próprio passado, quando
   * `reservado`; o já existente de uma tentativa anterior vencedora, quando não.
   */
  readonly orcamentoId: OrcamentoId;
}

/**
 * Contrato de idempotência da borda REST de `ReceberOrcamento` (plan.md:
 * "aceita Idempotency-Key opcional... se repetida dentro de 24h, retorna o
 * OrcamentoId já existente sem duplicar o registro"). Implementado em
 * Infrastructure sobre a tabela `idempotency_keys` (TTL 24h).
 *
 * `reservar` é a única operação — atômica (admission gate), nunca um
 * check-then-act de leitura + escrita separadas: duas chamadas concorrentes
 * com a mesma chave nunca podem, ambas, achar que reservaram (isso duplicaria
 * o `OrcamentoRecebido` publicado).
 */
export interface IdempotencyKeyRepository {
  reservar(chave: string, orcamentoId: OrcamentoId, expiraEm: Date): Promise<ReservaIdempotencia>;
}
