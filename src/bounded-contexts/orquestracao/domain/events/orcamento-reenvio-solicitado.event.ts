import type { AgenteOrigemDecisao } from '../value-objects/decisao-roteamento.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoReenvioSolicitadoPayload extends DomainEventEnvelope {
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly criterio: string;
  /** `null` apenas quando `agenteOrigem === 'HUMANO'`. */
  readonly nivelConfianca: number | null;
  /**
   * Referência concreta à inconsistência/pendência que motivou o reenvio —
   * nunca vazio (invariante estrutural de `DecisaoRoteamento`, plan.md).
   * Consumido por Acompanhamento e pela futura spec de notificação ao
   * fornecedor (fora de escopo).
   */
  readonly motivoDadoAusente: string;
}

/**
 * Publicado quando `acao === 'SOLICITAR_REENVIO'` é registrada — nunca sem
 * `motivoDadoAusente` não vazio (critério de aceite "uma decisão de
 * solicitar reenvio nunca é tomada sem que a validação tenha apontado
 * ausência de dado essencial específico", spec.md).
 */
export class OrcamentoReenvioSolicitado implements OrcamentoReenvioSolicitadoPayload {
  static readonly detailType = 'OrcamentoReenvioSolicitado' as const;
  readonly detailType = OrcamentoReenvioSolicitado.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly agenteOrigem: AgenteOrigemDecisao,
    readonly criterio: string,
    readonly nivelConfianca: number | null,
    readonly motivoDadoAusente: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
