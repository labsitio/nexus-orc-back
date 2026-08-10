import { describe, expect, it } from 'vitest';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsolidarEDecidirWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';
import { DecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { OrcamentoReenvioSolicitado } from '../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-reenvio-solicitado.event.js';
import { ReenvioSemFundamentoError } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.js';
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
 * T048 (#254, spec 005) — Integration test do cenário de reenvio consumido
 * por `ConsolidarEDecidirWorkflow` (T028, já em produção): reenvio válido
 * (fundamento presente) publica `OrcamentoReenvioSolicitado` com
 * `motivoDadoAusente`; reenvio sem fundamento nunca publica evento de
 * reenvio.
 *
 * Mesmo padrão de integração local já aprovado em
 * `consolidar-e-decidir-workflow.test.ts` (T028/T040) — caso de uso real,
 * fakes de ACL/repositório/gateway/publisher no lugar de SQS/EventBridge
 * reais (plan.md classifica LocalStack como execução de CI/DevOps).
 *
 * Nota sobre a redação de T048 ("tentativa registrada no histórico como
 * falha de invariante"): `DecisaoRoteamento.criar` (invariante estrutural
 * do agregado, issue #256 já fechada) rejeita `ReenvioSemFundamentoError`
 * *antes* de qualquer mutação — mesma família de `CriterioAusenteError`/
 * `AprovacaoSemValidacaoError`, já cobertos em
 * `decisao-workflow.aggregate.test.ts` ("... sem mutar estado"). Uma
 * decisão estruturalmente inválida nunca é representável nem anexada ao
 * `historico` (só decisões válidas ou tentativas de baixa confiança
 * entram lá). O rastro de auditoria dessa falha, hoje, é o log estruturado
 * do handler SQS (`decisao-workflow-queue.handler.ts`, `logger.error`) e a
 * mensagem retornando à fila até a DLQ — não uma entrada de `historico` no
 * agregado. Este teste fixa o comportamento real (revisado e já testado),
 * sem alterar código de produção; divergência de redação encaminhada ao
 * `arquiteto-back` no relatório desta task.
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

function useCaseComResultado(
  repositorio: DecisaoWorkflowRepository,
  resultado: ResultadoOrquestrador,
  publisher: EventPublisher,
): ConsolidarEDecidirWorkflow {
  return new ConsolidarEDecidirWorkflow(
    new ACLFake({
      orcamentoId: ORCAMENTO_ID,
      contextoValidacao: CONTEXTO_VALIDACAO,
      tenantId: TENANT_ID,
    }),
    () => repositorio,
    new AgenteOrquestradorGatewayFake(resultado),
    publisher,
  );
}

describe('ConsolidarEDecidirWorkflow — cenário de reenvio (T048)', () => {
  it('reenvio válido (fundamento presente): publica OrcamentoReenvioSolicitado com motivoDadoAusente', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = useCaseComResultado(
      repositorio,
      {
        acao: 'SOLICITAR_REENVIO',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'Confiança suficiente, pendência concreta identificada pela Extração',
        requerIntegracaoExterna: false,
        motivoDadoAusente: 'CNPJ do fornecedor não confirmado (Extração, item 3)',
      },
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(existente.status).toBe('DECIDIDO');
    expect(existente.decisaoAtual?.acao).toBe('SOLICITAR_REENVIO');
    expect(publisher.publicados).toHaveLength(1);
    const evento = publisher.publicados[0];
    expect(evento).toBeInstanceOf(OrcamentoReenvioSolicitado);
    expect((evento as OrcamentoReenvioSolicitado).motivoDadoAusente).toBe(
      'CNPJ do fornecedor não confirmado (Extração, item 3)',
    );
    expect((evento as OrcamentoReenvioSolicitado).agenteOrigem).toBe('ORQUESTRADOR');
  });

  it('reenvio sem fundamento: nenhum evento de reenvio é publicado, agregado permanece CONTEXTO_CONSOLIDADO sem decisão registrada', async () => {
    const existente = agregadoComContextoConsolidado();
    const repositorio = new DecisaoWorkflowRepositoryFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = useCaseComResultado(
      repositorio,
      {
        acao: 'SOLICITAR_REENVIO',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'tentativa sem fundamento',
        requerIntegracaoExterna: false,
        // motivoDadoAusente ausente de propósito — sem referência concreta a
        // uma pendência/inconsistência real de Validação/Extração.
      },
      publisher,
    );

    await expect(useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() })).rejects.toThrow(
      ReenvioSemFundamentoError,
    );

    expect(publisher.publicados).toHaveLength(0);
    expect(existente.status).toBe('CONTEXTO_CONSOLIDADO');
    expect(existente.decisaoAtual).toBeUndefined();
    expect(existente.historico).toHaveLength(0);
  });
});
