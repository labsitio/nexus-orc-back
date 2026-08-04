import type { AcaoRoteamento } from '../value-objects/decisao-roteamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface IntegracaoExternaSolicitadaPayload extends DomainEventEnvelope {
  readonly acaoOrigem: AcaoRoteamento;
}

/**
 * Publicado em conjunto com `OrcamentoAprovadoParaProcessamento` /
 * `OrcamentoEncaminhadoParaComprador` / `OrcamentoReenvioSolicitado` quando
 * `requerIntegracaoExterna === true`. Payload deliberadamente restrito a
 * `orcamentoId`/`acaoOrigem`/`ocorreuEm` — nenhum decisor conhece o contrato
 * do sistema parceiro (critério de aceite explícito do spec.md; plan.md,
 * "Domain Events"). NUNCA adicionar campo de protocolo específico aqui.
 */
export class IntegracaoExternaSolicitada implements IntegracaoExternaSolicitadaPayload {
  static readonly detailType = 'IntegracaoExternaSolicitada' as const;
  readonly detailType = IntegracaoExternaSolicitada.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly acaoOrigem: AcaoRoteamento,
    readonly tenantId?: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
