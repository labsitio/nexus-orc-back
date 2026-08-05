import type { DecisaoWorkflow } from '../aggregates/decisao-workflow.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

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

/**
 * (issue #656, spec 007/T008) Fábrica de `DecisaoWorkflowRepository` por
 * `tenantId` — mesmo padrão de `CriarOrcamentoValidacaoRepositorio`/
 * `CriarExtracaoOrcamentoRepositorio`. Diferente desses dois, o `tenantId`
 * deste BC só é conhecido depois que a ACL do upstream que dispara o caso de
 * uso (`RegistrarContextoClassificacao`/`ConsolidarEDecidirWorkflow`) traduz
 * o evento — nunca antes disso.
 */
export type CriarDecisaoWorkflowRepositorio = (tenantId: TenantId) => DecisaoWorkflowRepository;
