import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { ContextoValidacao } from '../value-objects/contexto-validacao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoValidadoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly contextoValidacao: ContextoValidacao;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Extraído do envelope de
   * 003, obrigatório desde `schemaVersion: 2`. Evento sem `tenantId` é
   * rejeitado por `OrcamentoValidadoEventACL` (Infrastructure) — nunca
   * propagado como `undefined`.
   */
  readonly tenantId: TenantId;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload
 * bruto dos eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (`source: nexo.validacao`, spec 003) — traduz o shape do evento upstream
 * para os VOs locais deste BC, nunca importando tipos de domínio do BC
 * Validação (fronteira de Bounded Context, plan.md). `payloadBruto` é
 * entrada não confiável (evento de outro contexto) — `unknown` de
 * propósito, nunca tipado com base numa suposição de shape. Este é o evento
 * gatilho da decisão de workflow (último da cadeia causal) — implementado
 * na Infrastructure (`OrcamentoValidadoEventACL`, T017).
 */
export interface OrcamentoValidadoEventACL {
  traduzir(payloadBruto: unknown): OrcamentoValidadoEventACLResultado;
}
