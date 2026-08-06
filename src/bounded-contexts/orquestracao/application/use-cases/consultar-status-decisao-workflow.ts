import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { DecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import type { CriarDecisaoWorkflowRepositorio } from '../../domain/repositories/decisao-workflow.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

export class DecisaoWorkflowNaoEncontradaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`DecisaoWorkflow não encontrada para orçamento: ${orcamentoId}`);
  }
}

/**
 * Disparado quando o `tenantId` do agregado não corresponde ao `tenantId` da
 * requisição — mesmo padrão de `TenantDivergenciaError` de
 * `validacao/application/use-cases/consultar-status-validacao.ts` (issue
 * #656/#136). Retornado como 404, nunca 403, para não revelar ao cliente a
 * existência de uma decisão pertencente a outro tenant. Na prática o
 * repositório tenant-scoped já torna esse cenário irrealizável — mantido
 * como defesa em profundidade.
 */
export class TenantDivergenciaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Acesso negado à decisão de workflow: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T030/#236, plan.md linha 139) — nunca escreve no agregado
 * nem no repositório. Retorna o agregado completo (status atual + contextos
 * consolidados + decisão + histórico append-only); a tradução para o formato
 * de resposta HTTP é responsabilidade do controller
 * (`interface/http/status.controller.ts`). Mesmo padrão de
 * `ConsultarStatusValidacao` (spec 003, T026/#136).
 */
export class ConsultarStatusDecisaoWorkflow {
  constructor(private readonly criarRepositorio: CriarDecisaoWorkflowRepositorio) {}

  async executar(orcamentoId: string, tenantId: TenantId): Promise<DecisaoWorkflow> {
    const id = OrcamentoId.de(orcamentoId);
    // Repositório construído a partir do `tenantId` já validado do
    // parâmetro — nunca reaproveitado como campo fixo entre chamadas (mesmo
    // padrão de `CriarDecisaoWorkflowRepositorio`).
    const decisaoWorkflow = await this.criarRepositorio(tenantId).buscarPorOrcamentoId(id);
    if (!decisaoWorkflow) {
      throw new DecisaoWorkflowNaoEncontradaError(orcamentoId);
    }

    if (decisaoWorkflow.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId);
    }

    return decisaoWorkflow;
  }
}
