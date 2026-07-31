import type { OrcamentoValidacao } from '../orcamento-validacao.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

/**
 * Persistência do agregado `OrcamentoValidacao` — implementada na
 * Infrastructure (`DrizzleOrcamentoValidacaoRepository`, T014) sobre Aurora
 * Serverless v2 Postgres. Traduz linha↔agregado, nunca vaza tipo de banco
 * (ex.: JSONB bruto de `dados_extraidos`/`inconsistencias`) para fora da
 * Infra (plan.md).
 */
export interface OrcamentoValidacaoRepository {
  salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void>;
  buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<OrcamentoValidacao | undefined>;
}
