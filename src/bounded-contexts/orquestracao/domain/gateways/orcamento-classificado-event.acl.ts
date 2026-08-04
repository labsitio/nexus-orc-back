import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { ContextoClassificacao } from '../value-objects/contexto-classificacao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoClassificadoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly contextoClassificacao: ContextoClassificacao;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Extraído do envelope de
   * 001, obrigatório desde `schemaVersion: 2`. Evento sem `tenantId` é
   * rejeitado por `OrcamentoClassificadoEventACL` (Infrastructure) — nunca
   * propagado como `undefined`.
   */
  readonly tenantId: TenantId;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload
 * bruto do evento `OrcamentoClassificado` (`source: nexo.ingestao-identificacao`,
 * spec 001) — traduz o shape do evento upstream para os VOs locais deste BC,
 * nunca importando tipos de domínio do BC Ingestão & Identificação
 * (fronteira de Bounded Context, plan.md). `payloadBruto` é entrada não
 * confiável (evento de outro contexto) — `unknown` de propósito, nunca
 * tipado com base numa suposição de shape. Implementado na Infrastructure
 * (`OrcamentoClassificadoEventACL`, T017).
 */
export interface OrcamentoClassificadoEventACL {
  traduzir(payloadBruto: unknown): OrcamentoClassificadoEventACLResultado;
}
