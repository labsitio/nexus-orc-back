import type { DecisaoWorkflow } from '../aggregates/decisao-workflow.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

/**
 * Persistência do agregado `DecisaoWorkflow` — implementada na
 * Infrastructure (`DrizzleDecisaoWorkflowRepository`, T016) sobre Aurora
 * Serverless v2 Postgres. Traduz linha↔agregado (estado atual em
 * `decisoes_workflow`, histórico append-only em
 * `decisoes_workflow_historico`), nunca vaza tipo de banco (ex.: JSONB
 * bruto dos contextos/decisão) para fora da Infra (plan.md).
 */
export interface DecisaoWorkflowRepository {
  salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void>;
  buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<DecisaoWorkflow | undefined>;
}
