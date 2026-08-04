import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { DadosExtraidosParaValidacao } from '../value-objects/dados-extraidos-para-validacao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoExtraidoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly dadosExtraidos: DadosExtraidosParaValidacao;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Extraído do envelope de
   * 002, obrigatório desde `schemaVersion: 2`. Evento sem `tenantId` é
   * rejeitado por `OrcamentoExtraidoEventACLImpl` (Infrastructure) — nunca
   * propagado como `undefined`.
   */
  readonly tenantId: TenantId;
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
