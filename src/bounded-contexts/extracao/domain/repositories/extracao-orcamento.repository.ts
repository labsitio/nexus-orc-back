import type { ExtracaoOrcamento } from '../extracao-orcamento.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

/**
 * Persistência do agregado `ExtracaoOrcamento` — implementada na
 * Infrastructure (Drizzle/Aurora Serverless v2), nunca vaza tipo de
 * banco (ex.: JSONB bruto) para fora da Infra (plan.md).
 */
export interface ExtracaoOrcamentoRepository {
  salvar(extracao: ExtracaoOrcamento): Promise<void>;
  buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<ExtracaoOrcamento | undefined>;
}

/**
 * (issue #656, spec 007/T008) Fábrica de `ExtracaoOrcamentoRepository` por
 * `tenantId` — nunca uma instância pronta. Mesmo padrão de
 * `CriarOrcamentoRepositorio` (BC Ingestão & Identificação, spec 001/T018):
 * `DrizzleExtracaoOrcamentoRepository` estende `DrizzleTenantScopedRepositoryBase`
 * e fixa o `TenantContext` no construtor — MUST NUNCA ser reaproveitado entre
 * tenants, então os casos de uso deste BC recebem esta fábrica em vez de um
 * `ExtracaoOrcamentoRepository` fixo.
 */
export type CriarExtracaoOrcamentoRepositorio = (tenantId: TenantId) => ExtracaoOrcamentoRepository;
