import { describe, expect, it } from 'vitest';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { RegistrarDecisaoHumanaWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.js';
import {
  DecisaoWorkflowNaoEncontradaError,
  TenantDivergenciaError,
} from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import {
  DecisaoWorkflow,
  TransicaoInvalidaDecisaoWorkflowError,
} from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { IntegracaoExternaSolicitada } from '../../../../src/bounded-contexts/orquestracao/domain/events/integracao-externa-solicitada.event.js';
import { OrcamentoAprovadoParaProcessamento } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-aprovado-para-processamento.event.js';
import { OrcamentoReenvioSolicitado } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-reenvio-solicitado.event.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/orquestracao/domain/events/domain-event.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/orquestracao/domain/gateways/event-publisher.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoClassificacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';

/**
 * T042 (#248) — Application: `RegistrarDecisaoHumanaWorkflow`. A transição
 * de estado (só válida a partir de `PENDENTE_REVISAO_HUMANA`) e as
 * invariantes de `DecisaoRoteamento` são regra de domínio
 * (`DecisaoWorkflow.registrarDecisaoHumana`) — cobertas em
 * `decisao-workflow.aggregate.test.ts`. Este teste cobre apenas a
 * orquestração do caso de uso: busca, checagem de tenant, delega, persiste,
 * publica.
 */

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

class EventPublisherFake implements EventPublisher {
  publicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.publicados.push(evento);
  }
}

const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
const TENANT_ID = TenantId.novo();

function agregadoPendenteRevisaoHumana(): DecisaoWorkflow {
  const agregado = DecisaoWorkflow.criar(ORCAMENTO_ID, TENANT_ID);
  agregado.registrarContextoClassificacao(
    ContextoClassificacao.de({
      fornecedorIdentificado: 'Fornecedor XYZ',
      formatoIdentificado: 'PDF',
    }),
    TENANT_ID,
  );
  agregado.registrarContextoExtracao(
    ContextoExtracao.de({
      itensResumo: '10x parafuso',
      condicoesComerciaisResumo: '30 dias',
      houvePendenciaConfirmada: false,
    }),
    TENANT_ID,
  );
  agregado.registrarContextoValidacao(ContextoValidacao.de({ resultado: 'VALIDADO' }), TENANT_ID);
  agregado.consolidarContexto();
  agregado.registrarTentativaOrquestrador({
    acao: 'APROVAR',
    nivelConfianca: NivelConfianca.de(40),
    criterio: 'Confiança baixa',
    requerIntegracaoExterna: false,
  });
  return agregado;
}

describe('RegistrarDecisaoHumanaWorkflow', () => {
  it('registra decisão humana e publica o evento de desfecho com agenteOrigem HUMANO', async () => {
    const existente = agregadoPendenteRevisaoHumana();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), TENANT_ID, {
      acao: 'APROVAR',
      criterio: 'Comprador confirmou fornecedor por telefone',
      requerIntegracaoExterna: false,
    });

    expect(existente.status).toBe('DECIDIDO');
    expect(existente.decisaoAtual?.agenteOrigem).toBe('HUMANO');
    expect(publisher.publicados).toHaveLength(1);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoAprovadoParaProcessamento);
    expect(publisher.publicados[0]?.tenantId).toBe(TENANT_ID.toString());
    expect(repositorio.salvos).toHaveLength(1);
  });

  it('publica IntegracaoExternaSolicitada junto do desfecho quando requerIntegracaoExterna', async () => {
    const existente = agregadoPendenteRevisaoHumana();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), TENANT_ID, {
      acao: 'SOLICITAR_REENVIO',
      criterio: 'Comprador identificou CNPJ ausente',
      requerIntegracaoExterna: true,
      motivoDadoAusente: 'CNPJ do fornecedor não confirmado (Extração, item 3)',
    });

    expect(publisher.publicados).toHaveLength(2);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoReenvioSolicitado);
    expect(publisher.publicados[1]).toBeInstanceOf(IntegracaoExternaSolicitada);
  });

  it('orçamento inexistente: lança DecisaoWorkflowNaoEncontradaError, nunca publica', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake(undefined);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher);

    await expect(
      useCase.executar(ORCAMENTO_ID.toString(), TENANT_ID, {
        acao: 'APROVAR',
        criterio: 'não deveria ser aplicado',
        requerIntegracaoExterna: false,
      }),
    ).rejects.toThrow(DecisaoWorkflowNaoEncontradaError);

    expect(publisher.publicados).toHaveLength(0);
  });

  it('tenantId divergente: lança TenantDivergenciaError (nunca 403, defesa em profundidade), nunca publica', async () => {
    const existente = agregadoPendenteRevisaoHumana();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher);
    const outroTenant = TenantId.novo();

    await expect(
      useCase.executar(ORCAMENTO_ID.toString(), outroTenant, {
        acao: 'APROVAR',
        criterio: 'não deveria ser aplicado',
        requerIntegracaoExterna: false,
      }),
    ).rejects.toThrow(TenantDivergenciaError);

    expect(publisher.publicados).toHaveLength(0);
  });

  it('status diferente de PENDENTE_REVISAO_HUMANA: propaga TransicaoInvalidaDecisaoWorkflowError do agregado, nunca publica', async () => {
    const existente = agregadoPendenteRevisaoHumana();
    // decisão humana já aplicada em execução anterior → status DECIDIDO
    existente.registrarDecisaoHumana({
      acao: 'APROVAR',
      criterio: 'Decisão já tomada anteriormente',
      requerIntegracaoExterna: false,
    });
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher);

    await expect(
      useCase.executar(ORCAMENTO_ID.toString(), TENANT_ID, {
        acao: 'ENCAMINHAR_COMPRADOR',
        criterio: 'segunda tentativa, não deveria ser aplicada',
        requerIntegracaoExterna: false,
      }),
    ).rejects.toThrow(TransicaoInvalidaDecisaoWorkflowError);

    expect(publisher.publicados).toHaveLength(0);
    expect(repositorio.salvos).toHaveLength(0);
  });
});
