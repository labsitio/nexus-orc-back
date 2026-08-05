import { describe, expect, it } from 'vitest';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { RegistrarContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/registrar-contexto-extracao.js';
import { DecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { ContextoImutavelError } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../../../../src/bounded-contexts/orquestracao/domain/gateways/orcamento-extraido-event.acl.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';

/**
 * T027 (#233) — Application: `RegistrarContextoExtracao`. Mesmo padrão de
 * `registrar-contexto-classificacao.test.ts` (T026), unit test com mocks de
 * ACL/repositório (Vitest, sem rede), conforme `plan.md`.
 */

class ACLFake implements OrcamentoExtraidoEventACL {
  constructor(private readonly resultado: OrcamentoExtraidoEventACLResultado) {}

  traduzir(): OrcamentoExtraidoEventACLResultado {
    return this.resultado;
  }
}

class DecisaoWorkflowRepositoryFake implements DecisaoWorkflowRepository {
  salvos: DecisaoWorkflow[] = [];
  constructor(private existente: DecisaoWorkflow | undefined = undefined) {}

  async salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void> {
    this.salvos.push(decisaoWorkflow);
    this.existente = decisaoWorkflow;
  }

  async buscarPorOrcamentoId(): Promise<DecisaoWorkflow | undefined> {
    return this.existente;
  }
}

const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
const TENANT_ID = TenantId.novo();

function contexto(itensResumo = 'Item A (qtd: 2, preço unit.: 10.00 BRL)'): ContextoExtracao {
  return ContextoExtracao.de({
    itensResumo,
    condicoesComerciaisResumo: 'pagamento: 30 dias; validade: 15 dias; entrega: FOB',
    houvePendenciaConfirmada: false,
  });
}

describe('RegistrarContextoExtracao', () => {
  it('cria o agregado e registra o contexto quando ainda não existe', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const useCase = new RegistrarContextoExtracao(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoExtracao: contexto(),
        tenantId: TENANT_ID,
      }),
      () => repositorio,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos).toHaveLength(1);
    const salvo = repositorio.salvos[0]!;
    expect(salvo.status).toBe('AGUARDANDO_CONTEXTO');
    expect(salvo.contextoExtracao?.equals(contexto())).toBe(true);
  });

  it('reutiliza o agregado existente quando outro contexto já chegou antes', async () => {
    const existente = DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID);
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const useCase = new RegistrarContextoExtracao(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoExtracao: contexto(),
        tenantId: TENANT_ID,
      }),
      () => repositorio,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos).toHaveLength(1);
    expect(repositorio.salvos[0]).toBe(existente);
    expect(existente.contextoExtracao?.equals(contexto())).toBe(true);
  });

  it('é idempotente: reaplicar o mesmo contexto não lança erro e persiste normalmente', async () => {
    const existente = DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID);
    existente.registrarContextoExtracao(contexto(), TENANT_ID);
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const useCase = new RegistrarContextoExtracao(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoExtracao: contexto(),
        tenantId: TENANT_ID,
      }),
      () => repositorio,
    );

    await expect(
      useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() }),
    ).resolves.toBeUndefined();
    expect(repositorio.salvos).toHaveLength(1);
  });

  it('propaga ContextoImutavelError quando o payload reentregue diverge do já registrado', async () => {
    const existente = DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID);
    existente.registrarContextoExtracao(contexto('Item A original'), TENANT_ID);
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const useCase = new RegistrarContextoExtracao(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoExtracao: contexto('Item B divergente'),
        tenantId: TENANT_ID,
      }),
      () => repositorio,
    );

    await expect(useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() })).rejects.toThrow(
      ContextoImutavelError,
    );
    expect(repositorio.salvos).toHaveLength(0);
  });

  it('(mesmo padrão de #650) propaga tenantId extraído pela ACL para o agregado', async () => {
    const tenantId = TenantId.de('01912e2e-7f3a-7c3a-89ab-0123456789ab');
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const useCase = new RegistrarContextoExtracao(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, contextoExtracao: contexto(), tenantId }),
      () => repositorio,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos[0]!.tenantId.equals(tenantId)).toBe(true);
  });
});
