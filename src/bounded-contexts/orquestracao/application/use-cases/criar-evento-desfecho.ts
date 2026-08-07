import type { DomainEventEnvelope } from '../../domain/events/domain-event.js';
import { OrcamentoAprovadoParaProcessamento } from '../../domain/events/orcamento-aprovado-para-processamento.event.js';
import { OrcamentoEncaminhadoParaComprador } from '../../domain/events/orcamento-encaminhado-para-comprador.event.js';
import { OrcamentoReenvioSolicitado } from '../../domain/events/orcamento-reenvio-solicitado.event.js';
import type {
  AcaoRoteamento,
  AgenteOrigemDecisao,
} from '../../domain/value-objects/decisao-roteamento.vo.js';

/**
 * Traduz uma `DecisaoRoteamento` já registrada no agregado (automática ou
 * humana) para o evento de desfecho correspondente — mesmo mapeamento
 * `acao` → evento independente de quem decidiu (`agenteOrigem`), reusado por
 * `ConsolidarEDecidirWorkflow` (T028) e `RegistrarDecisaoHumanaWorkflow`
 * (T042).
 */
export function criarEventoDesfecho(
  orcamentoId: string,
  decisao: {
    readonly acao: AcaoRoteamento;
    readonly agenteOrigem: AgenteOrigemDecisao;
    readonly criterio: string;
    readonly nivelConfianca: { readonly valor: number } | null;
    readonly motivoDadoAusente?: string;
  },
  tenantId: string,
): DomainEventEnvelope {
  const nivelConfianca = decisao.nivelConfianca?.valor ?? null;

  switch (decisao.acao) {
    case 'APROVAR':
      return new OrcamentoAprovadoParaProcessamento(
        orcamentoId,
        decisao.agenteOrigem,
        decisao.criterio,
        nivelConfianca,
        tenantId,
      );
    case 'ENCAMINHAR_COMPRADOR':
      return new OrcamentoEncaminhadoParaComprador(
        orcamentoId,
        decisao.agenteOrigem,
        decisao.criterio,
        nivelConfianca,
        tenantId,
      );
    case 'SOLICITAR_REENVIO':
      return new OrcamentoReenvioSolicitado(
        orcamentoId,
        decisao.agenteOrigem,
        decisao.criterio,
        nivelConfianca,
        decisao.motivoDadoAusente!,
        tenantId,
      );
  }
}
