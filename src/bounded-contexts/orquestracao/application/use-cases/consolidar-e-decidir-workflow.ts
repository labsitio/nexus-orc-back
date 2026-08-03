import { DecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import type { StatusDecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import { DecisaoWorkflowEscalonadaParaComprador } from '../../domain/events/decisao-workflow-escalonada-para-comprador.event.js';
import type { DomainEventEnvelope } from '../../domain/events/domain-event.js';
import { IntegracaoExternaSolicitada } from '../../domain/events/integracao-externa-solicitada.event.js';
import { OrcamentoAprovadoParaProcessamento } from '../../domain/events/orcamento-aprovado-para-processamento.event.js';
import { OrcamentoEncaminhadoParaComprador } from '../../domain/events/orcamento-encaminhado-para-comprador.event.js';
import { OrcamentoReenvioSolicitado } from '../../domain/events/orcamento-reenvio-solicitado.event.js';
import type { AgenteOrquestradorGateway } from '../../domain/gateways/agente-orquestrador.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { OrcamentoValidadoEventACL } from '../../domain/gateways/orcamento-validado-event.acl.js';
import type { DecisaoWorkflowRepository } from '../../domain/repositories/decisao-workflow.repository.js';
import type { AcaoRoteamento } from '../../domain/value-objects/decisao-roteamento.vo.js';

/**
 * Consumidor do evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (via SQS `decisao-workflow-queue`, plan.md) — último evento da cadeia
 * causal, gatilho real da decisão de workflow.
 *
 * Traduz via `OrcamentoValidadoEventACL`, aplica `registrarContextoValidacao`
 * e persiste imediatamente (o contexto de validação não pode se perder se o
 * contexto de classificação/extração ainda não tiver chegado). Tenta então
 * `consolidarContexto()`:
 * - Se lançar `ContextoIncompletoError` (entrega fora de ordem, ADR-001 do
 *   plan.md), a persistência já ocorreu e o erro é propagado — a
 *   Interface (handler Lambda) decide não confirmar a mensagem SQS, que
 *   retorna à fila para nova tentativa após o *visibility timeout*.
 * - Se consolidado, invoca `AgenteOrquestradorGateway`, aplica
 *   `registrarTentativaOrquestrador` (que já decide, no Domain, entre
 *   confiança suficiente → `DECIDIDO` ou insuficiente →
 *   `PENDENTE_REVISAO_HUMANA`, T010/T012), persiste e publica o desfecho:
 *   confiança suficiente publica o evento de decisão correspondente
 *   (+ `IntegracaoExternaSolicitada` se `requerIntegracaoExterna`);
 *   confiança insuficiente publica `DecisaoWorkflowEscalonadaParaComprador`
 *   diretamente, sem agente revisor de IA (ADR-002 do plan.md).
 */
export class ConsolidarEDecidirWorkflow {
  constructor(
    private readonly acl: OrcamentoValidadoEventACL,
    private readonly repositorio: DecisaoWorkflowRepository,
    private readonly agenteOrquestrador: AgenteOrquestradorGateway,
    private readonly publisher: EventPublisher,
  ) {}

  async executar(payloadBruto: unknown): Promise<void> {
    const { orcamentoId, contextoValidacao } = this.acl.traduzir(payloadBruto);

    const decisaoWorkflow =
      (await this.repositorio.buscarPorOrcamentoId(orcamentoId)) ??
      DecisaoWorkflow.criar(orcamentoId);

    decisaoWorkflow.registrarContextoValidacao(contextoValidacao);

    try {
      decisaoWorkflow.consolidarContexto();
    } finally {
      // Persiste mesmo em caso de ContextoIncompletoError: o contexto de
      // validação já registrado não pode se perder à espera dos demais.
      await this.repositorio.salvar(decisaoWorkflow);
    }

    const statusAposConsolidar: StatusDecisaoWorkflow = decisaoWorkflow.status;
    if (statusAposConsolidar !== 'CONTEXTO_CONSOLIDADO') {
      // Reentrega da fila SQS (at-least-once) depois que uma execução
      // anterior já decidiu (DECIDIDO) ou escalonou (PENDENTE_REVISAO_HUMANA)
      // — nunca reinvoca o Orquestrador nem republica o desfecho (mesma
      // disciplina de "já avaliado — nunca reavalia nem republica" do BC
      // Validação, `validar-orcamento.ts`).
      return;
    }

    const resultado = await this.agenteOrquestrador.decidir({
      contextoClassificacao: decisaoWorkflow.contextoClassificacao!,
      contextoExtracao: decisaoWorkflow.contextoExtracao!,
      contextoValidacao: decisaoWorkflow.contextoValidacao!,
    });

    decisaoWorkflow.registrarTentativaOrquestrador(resultado);
    await this.repositorio.salvar(decisaoWorkflow);

    if (decisaoWorkflow.status === 'PENDENTE_REVISAO_HUMANA') {
      await this.publisher.publicar(
        new DecisaoWorkflowEscalonadaParaComprador(
          orcamentoId.toString(),
          resultado.nivelConfianca.valor,
        ),
      );
      return;
    }

    const decisao = decisaoWorkflow.decisaoAtual!;
    await this.publisher.publicar(this.criarEventoDesfecho(orcamentoId.toString(), decisao));

    if (decisao.requerIntegracaoExterna) {
      await this.publisher.publicar(
        new IntegracaoExternaSolicitada(orcamentoId.toString(), decisao.acao),
      );
    }
  }

  private criarEventoDesfecho(
    orcamentoId: string,
    decisao: {
      readonly acao: AcaoRoteamento;
      readonly agenteOrigem: 'ORQUESTRADOR' | 'HUMANO';
      readonly criterio: string;
      readonly nivelConfianca: { readonly valor: number } | null;
      readonly motivoDadoAusente?: string;
    },
  ): DomainEventEnvelope {
    const nivelConfianca = decisao.nivelConfianca?.valor ?? null;

    switch (decisao.acao) {
      case 'APROVAR':
        return new OrcamentoAprovadoParaProcessamento(
          orcamentoId,
          decisao.agenteOrigem,
          decisao.criterio,
          nivelConfianca,
        );
      case 'ENCAMINHAR_COMPRADOR':
        return new OrcamentoEncaminhadoParaComprador(
          orcamentoId,
          decisao.agenteOrigem,
          decisao.criterio,
          nivelConfianca,
        );
      case 'SOLICITAR_REENVIO':
        return new OrcamentoReenvioSolicitado(
          orcamentoId,
          decisao.agenteOrigem,
          decisao.criterio,
          nivelConfianca,
          decisao.motivoDadoAusente!,
        );
    }
  }
}
