import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { DadosExtraidosParaValidacao } from '../value-objects/dados-extraidos-para-validacao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoExtraidoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly dadosExtraidos: DadosExtraidosParaValidacao;
  /**
   * (issue #649 — expand/contract, ADR-008) Extraído do envelope de 002, que
   * ainda publica `tenantId` opcional (spec-002 #648). `undefined` nunca é
   * rejeitado aqui — diferente da ACL estrita de 004 sobre eventos de 003
   * (#584/T042): `OrcamentoValidacao` é sempre criado no caminho da fila
   * (nunca há agregado pré-existente de outro tenant para divergir contra),
   * mesmo racional de `ExtracaoOrcamento` (spec 002, #648). Propagado como
   * `undefined` até a #632 tornar o campo obrigatório nos 4 BCs de uma vez.
   */
  readonly tenantId?: TenantId;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload
 * bruto dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (`source: nexo.extracao`) — traduz o shape do evento upstream para os VOs
 * locais deste BC, nunca importando tipos de domínio do BC Extração
 * (fronteira de Bounded Context, plan.md). `payloadBruto` é entrada não
 * confiável (evento de outro contexto, possivelmente com conteúdo derivado
 * de documento de fornecedor) — `unknown` de propósito, nunca tipado com
 * base numa suposição de shape. Implementado na Infrastructure
 * (`OrcamentoExtraidoEventACL`, T015).
 */
export interface OrcamentoExtraidoEventACL {
  traduzir(payloadBruto: unknown): OrcamentoExtraidoEventACLResultado;
}
