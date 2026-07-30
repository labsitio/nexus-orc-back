import type { ExtracaoOrcamento } from '../extracao-orcamento.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

/**
 * Persistência do agregado `ExtracaoOrcamento` — implementada na
 * Infrastructure (Drizzle/Aurora Serverless v2), nunca vaza tipo de
 * banco (ex.: JSONB bruto) para fora da Infra (plan.md).
 */
export interface ExtracaoOrcamentoRepository {
  salvar(extracao: ExtracaoOrcamento): Promise<void>;
  buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<ExtracaoOrcamento | undefined>;
}
