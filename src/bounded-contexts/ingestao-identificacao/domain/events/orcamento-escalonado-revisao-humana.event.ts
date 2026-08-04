import type { ResultadoClassificacaoPayload } from '../value-objects/resultado-classificacao.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoEscalonadoParaRevisaoHumanaPayload extends DomainEventEnvelope {
  readonly resultado: ResultadoClassificacaoPayload;
}

/**
 * Publicado quando o Classificador fica < 80% de confiança. Consumido pelo
 * Acompanhamento/consumidor externo para exibir "pendente" e alimentar a fila
 * de escalonamento humano — nunca autoaprova por tempo/volume (Princípio IV).
 */
export class OrcamentoEscalonadoParaRevisaoHumana implements OrcamentoEscalonadoParaRevisaoHumanaPayload {
  static readonly detailType = 'OrcamentoEscalonadoParaRevisaoHumana' as const;
  readonly detailType = OrcamentoEscalonadoParaRevisaoHumana.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly resultado: ResultadoClassificacaoPayload,
    readonly tenantId: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
