import type { ItemParaValidacaoPayload } from '../value-objects/item-para-validacao.vo.js';
import type { DomainEventEnvelope } from './domain-event.js';

export interface OrcamentoValidadoPayload extends DomainEventEnvelope {
  readonly itens: readonly ItemParaValidacaoPayload[];
  readonly condicoesComerciais: string;
}

/**
 * Publicado quando `OrcamentoValidacao` transita para `VALIDADO` (primeira
 * tentativa ou após correção humana). Consumido pelo futuro BC Orquestração
 * (005), por Acompanhamento e pelo BC Busca & Indexação (spec 004).
 *
 * **Amendment ADR-003 (spec 004, T006)**: `itens`/`condicoesComerciais`
 * (mesmo shape estrutural de `DadosExtraidosParaValidacao`) passam a compor
 * o payload — sem eles, `OrcamentoValidadoEventACL` (spec 004, T018) não tem
 * dado de origem para montar `ConteudoIndexavel`. `schemaVersion` sobe para
 * `2`.
 */
export class OrcamentoValidado implements OrcamentoValidadoPayload {
  static readonly detailType = 'OrcamentoValidado' as const;
  readonly detailType = OrcamentoValidado.detailType;
  readonly schemaVersion = 2 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly itens: readonly ItemParaValidacaoPayload[],
    readonly condicoesComerciais: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
