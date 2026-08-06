import { describe, expect, it } from 'vitest';
import {
  ConsultarStatusDecisaoWorkflow,
  DecisaoWorkflowNaoEncontradaError,
  TenantDivergenciaError,
} from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import { DecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const TENANT_ID = TenantId.de('01912e2e-7f3a-7c3a-89ab-0123456789ab');
const OUTRO_TENANT_ID = TenantId.de('01912e2e-7f3a-7c3a-89ab-0123456789cd');
const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');

/** Fake in-memory de `DecisaoWorkflowRepository` — mesmo padrão de `OrcamentoValidacaoRepositoryFake` (spec 003). */
class DecisaoWorkflowRepositoryFake implements DecisaoWorkflowRepository {
  private readonly registros = new Map<string, DecisaoWorkflow>();

  async salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void> {
    this.registros.set(decisaoWorkflow.orcamentoId.toString(), decisaoWorkflow);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<DecisaoWorkflow | undefined> {
    return this.registros.get(id.toString());
  }
}

describe('ConsultarStatusDecisaoWorkflow', () => {
  it('retorna o agregado consultável por orcamentoId', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const consultar = new ConsultarStatusDecisaoWorkflow(() => repositorio);
    await repositorio.salvar(DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID));

    const consultado = await consultar.executar(ORCAMENTO_ID.toString(), TENANT_ID);

    expect(consultado.status).toBe('AGUARDANDO_CONTEXTO');
    expect(consultado.historico).toHaveLength(0);
  });

  it('lança DecisaoWorkflowNaoEncontradaError para orcamentoId inexistente', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const consultar = new ConsultarStatusDecisaoWorkflow(() => repositorio);

    await expect(
      consultar.executar('01890a5d-ac96-774b-bcce-b02c8f2726a2', TENANT_ID),
    ).rejects.toThrow(DecisaoWorkflowNaoEncontradaError);
  });

  it('lança TenantDivergenciaError quando o tenantId do agregado difere do da requisição', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const consultar = new ConsultarStatusDecisaoWorkflow(() => repositorio);
    await repositorio.salvar(DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID));

    await expect(consultar.executar(ORCAMENTO_ID.toString(), OUTRO_TENANT_ID)).rejects.toThrow(
      TenantDivergenciaError,
    );
  });
});
