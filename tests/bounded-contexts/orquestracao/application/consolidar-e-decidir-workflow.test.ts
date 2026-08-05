import { describe, expect, it } from 'vitest';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsolidarEDecidirWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';
import {
  ContextoIncompletoError,
  DecisaoWorkflow,
} from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { DecisaoWorkflowEscalonadaParaComprador } from '../../../../src/bounded-contexts/orquestracao/domain/events/decisao-workflow-escalonada-para-comprador.event.js';
import { IntegracaoExternaSolicitada } from '../../../../src/bounded-contexts/orquestracao/domain/events/integracao-externa-solicitada.event.js';
import { OrcamentoAprovadoParaProcessamento } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-aprovado-para-processamento.event.js';
import { OrcamentoEncaminhadoParaComprador } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-encaminhado-para-comprador.event.js';
import { OrcamentoReenvioSolicitado } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-reenvio-solicitado.event.js';
import type { AgenteOrquestradorGateway } from '../../../../src/bounded-contexts/orquestracao/domain/gateways/agente-orquestrador.gateway.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/orquestracao/domain/events/domain-event.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/orquestracao/domain/gateways/event-publisher.js';
import type {
  OrcamentoValidadoEventACL,
  OrcamentoValidadoEventACLResultado,
} from '../../../../src/bounded-contexts/orquestracao/domain/gateways/orcamento-validado-event.acl.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoClassificacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import type { ResultadoOrquestrador } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';

/**
 * T028/T040 (#234/#246) — Application: `ConsolidarEDecidirWorkflow`. Cobre o
 * caminho feliz de confiança suficiente (T028) e o de baixa confiança/
 * escalonamento humano (T040) — ambos vivem na mesma transição de Domain
 * (`registrarTentativaOrquestrador`, ver aggregate), então o mesmo caso de
 * uso decide qual evento publicar a partir do status resultante.
 */

class ACLFake implements OrcamentoValidadoEventACL {
  constructor(private readonly resultado: OrcamentoValidadoEventACLResultado) {}
  traduzir(): OrcamentoValidadoEventACLResultado {
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

class AgenteOrquestradorGatewayFake implements AgenteOrquestradorGateway {
  constructor(private readonly resultado: ResultadoOrquestrador) {}
  async decidir(): Promise<ResultadoOrquestrador> {
    return this.resultado;
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

const CONTEXTO_VALIDACAO = ContextoValidacao.de({ resultado: 'VALIDADO' });

function agregadoComContextoConsolidado(): DecisaoWorkflow {
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
  return agregado;
}

describe('ConsolidarEDecidirWorkflow', () => {
  it('T028 — confiança suficiente: publica evento de desfecho (APROVAR)', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'Fornecedor recorrente, itens e condições consistentes',
        requerIntegracaoExterna: false,
      }),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(existente.status).toBe('DECIDIDO');
    expect(publisher.publicados).toHaveLength(1);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoAprovadoParaProcessamento);
  });

  it('(issue #650) propaga tenantId consolidado do agregado ao evento de desfecho publicado', async () => {
    const tenantId = TENANT_ID;
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, contextoValidacao: CONTEXTO_VALIDACAO, tenantId }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'Fornecedor recorrente, itens e condições consistentes',
        requerIntegracaoExterna: false,
      }),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(publisher.publicados[0]?.tenantId).toBe(tenantId.toString());
  });

  it('T040 — confiança insuficiente: publica DecisaoWorkflowEscalonadaParaComprador, nunca o desfecho', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(40),
        criterio: 'Confiança baixa',
        requerIntegracaoExterna: false,
      }),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(existente.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.publicados).toHaveLength(1);
    expect(publisher.publicados[0]).toBeInstanceOf(DecisaoWorkflowEscalonadaParaComprador);
  });

  it('confiança suficiente: publica evento de desfecho (ENCAMINHAR_COMPRADOR)', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(85),
        criterio: 'Itens fora do padrão histórico do fornecedor, revisão recomendada',
        requerIntegracaoExterna: false,
      }),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(existente.status).toBe('DECIDIDO');
    expect(publisher.publicados).toHaveLength(1);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoEncaminhadoParaComprador);
  });

  it('publica IntegracaoExternaSolicitada junto do desfecho quando requerIntegracaoExterna', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'SOLICITAR_REENVIO',
        nivelConfianca: NivelConfianca.de(95),
        criterio: 'Dado essencial ausente',
        requerIntegracaoExterna: true,
        motivoDadoAusente: 'CNPJ do fornecedor não confirmado (Extração, item 3)',
      }),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(publisher.publicados).toHaveLength(2);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoReenvioSolicitado);
    expect(publisher.publicados[1]).toBeInstanceOf(IntegracaoExternaSolicitada);
  });

  it('contexto incompleto: persiste o contextoValidacao já registrado e propaga ContextoIncompletoError, sem decidir nem publicar', async () => {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const publisher = new EventPublisherFake();
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      new AgenteOrquestradorGatewayFake({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'não deveria ser chamado',
        requerIntegracaoExterna: false,
      }),
      publisher,
    );

    await expect(useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() })).rejects.toThrow(
      ContextoIncompletoError,
    );

    expect(repositorio.salvos).toHaveLength(1);
    expect(repositorio.salvos[0]!.contextoValidacao?.equals(CONTEXTO_VALIDACAO)).toBe(true);
    expect(repositorio.salvos[0]!.status).toBe('AGUARDANDO_CONTEXTO');
    expect(publisher.publicados).toHaveLength(0);
  });

  it('reentrega SQS pós-decisão (DECIDIDO): nunca reinvoca o Orquestrador nem republica o desfecho', async () => {
    const existente = agregadoComContextoConsolidado();
    existente.registrarContextoValidacao(CONTEXTO_VALIDACAO, TENANT_ID);
    existente.consolidarContexto();
    existente.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(90),
      criterio: 'Decisão já tomada em execução anterior',
      requerIntegracaoExterna: false,
    });
    expect(existente.status).toBe('DECIDIDO');

    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const agenteOrquestrador: AgenteOrquestradorGateway = {
      decidir: () => {
        throw new Error('nunca deveria ser chamado — decisão já registrada');
      },
    };
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      agenteOrquestrador,
      publisher,
    );

    await expect(
      useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() }),
    ).resolves.toBeUndefined();

    expect(publisher.publicados).toHaveLength(0);
  });

  it('reentrega SQS pós-escalonamento (PENDENTE_REVISAO_HUMANA): nunca reinvoca o Orquestrador', async () => {
    const existente = agregadoComContextoConsolidado();
    existente.registrarContextoValidacao(CONTEXTO_VALIDACAO, TENANT_ID);
    existente.consolidarContexto();
    existente.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(40),
      criterio: 'Confiança baixa',
      requerIntegracaoExterna: false,
    });
    expect(existente.status).toBe('PENDENTE_REVISAO_HUMANA');

    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const agenteOrquestrador: AgenteOrquestradorGateway = {
      decidir: () => {
        throw new Error('nunca deveria ser chamado — já escalonado para o comprador');
      },
    };
    const useCase = new ConsolidarEDecidirWorkflow(
      new ACLFake({
        orcamentoId: ORCAMENTO_ID,
        contextoValidacao: CONTEXTO_VALIDACAO,
        tenantId: TENANT_ID,
      }),
      () => repositorio,
      agenteOrquestrador,
      publisher,
    );

    await expect(
      useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() }),
    ).resolves.toBeUndefined();

    expect(publisher.publicados).toHaveLength(0);
  });

  // (issue #656 — aperto de tipo) O teste de guarda fail-fast do ADR-008
  // (`DecisaoWorkflowSemTenantIdError`) foi removido: `DecisaoWorkflow.tenantId`
  // deixou de ser opcional, então o cenário que esse guard cobria (aggregate
  // consolidado sem tenantId) não é mais representável no tipo — a garantia
  // agora vem do compilador, não de um guard em runtime.
});
