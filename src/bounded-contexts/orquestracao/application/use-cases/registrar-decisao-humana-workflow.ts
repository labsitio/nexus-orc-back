import type { DecisaoHumanaInput } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import { IntegracaoExternaSolicitada } from '../../domain/events/integracao-externa-solicitada.event.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { CriarDecisaoWorkflowRepositorio } from '../../domain/repositories/decisao-workflow.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { criarEventoDesfecho } from './criar-evento-desfecho.js';
import {
  DecisaoWorkflowNaoEncontradaError,
  TenantDivergenciaError,
} from './consultar-status-decisao-workflow.js';

/**
 * Caso de uso invocado pelo controller `POST
 * /v1/orcamentos/{orcamentoId}/workflow/decisao-humana` (T044, issue
 * separada — não implementado aqui). Só avança um orçamento escalonado
 * (`PENDENTE_REVISAO_HUMANA`) mediante decisão humana explícita — nunca por
 * tempo de espera, volume da fila ou exaustão de tentativas (spec.md).
 *
 * A transição de estado e as invariantes (`criterio` não vazio, nunca
 * reenvio sem `motivoDadoAusente`, nunca aprovar sem validação bem-sucedida)
 * são regra do agregado (`DecisaoWorkflow.registrarDecisaoHumana`) — este
 * caso de uso só busca, delega e persiste/publica o desfecho, mesmo padrão
 * de `ConsolidarEDecidirWorkflow` (T028): nenhum `if` de máquina de estado
 * na Application.
 */
export class RegistrarDecisaoHumanaWorkflow {
  constructor(
    private readonly criarRepositorio: CriarDecisaoWorkflowRepositorio,
    private readonly publisher: EventPublisher,
  ) {}

  async executar(
    orcamentoIdBruto: string,
    tenantId: TenantId,
    decisao: DecisaoHumanaInput,
  ): Promise<void> {
    const orcamentoId = OrcamentoId.de(orcamentoIdBruto);
    const repositorio = this.criarRepositorio(tenantId);

    const decisaoWorkflow = await repositorio.buscarPorOrcamentoId(orcamentoId);
    if (!decisaoWorkflow) {
      throw new DecisaoWorkflowNaoEncontradaError(orcamentoIdBruto);
    }

    if (decisaoWorkflow.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoIdBruto);
    }

    // Lança `TransicaoInvalidaDecisaoWorkflowError` (409, tratado pela
    // Interface) se o status não for `PENDENTE_REVISAO_HUMANA` — regra do
    // agregado, nunca duplicada aqui.
    decisaoWorkflow.registrarDecisaoHumana(decisao);
    await repositorio.salvar(decisaoWorkflow);

    const idParaEventos = orcamentoId.toString();
    const tenantIdParaEventos = decisaoWorkflow.tenantId.toString();
    const decisaoRegistrada = decisaoWorkflow.decisaoAtual!;

    await this.publisher.publicar(
      criarEventoDesfecho(idParaEventos, decisaoRegistrada, tenantIdParaEventos),
    );

    if (decisaoRegistrada.requerIntegracaoExterna) {
      await this.publisher.publicar(
        new IntegracaoExternaSolicitada(idParaEventos, decisaoRegistrada.acao, tenantIdParaEventos),
      );
    }
  }
}
