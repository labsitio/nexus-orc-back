import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { ContextoExtracao } from '../value-objects/contexto-extracao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoExtraidoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly contextoExtracao: ContextoExtracao;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Extraído do envelope de
   * 002, obrigatório desde `schemaVersion: 2`. Evento sem `tenantId` é
   * rejeitado por `OrcamentoExtraidoEventACL` (Infrastructure) — nunca
   * propagado como `undefined`. Sem consumidor de application ainda
   * (`RegistrarContextoExtracao` não existe, #235/T029): campo extraído e
   * disponível, aguardando o caso de uso que o consumirá.
   */
  readonly tenantId: TenantId;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload
 * bruto dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (`source: nexo.extracao`, spec 002) — traduz o shape do evento upstream
 * para os VOs locais deste BC, nunca importando tipos de domínio do BC
 * Extração (fronteira de Bounded Context, plan.md). Redefinido localmente
 * neste BC — mesmo padrão de duplicação aceitável já usado no ACL
 * equivalente da spec 003. `payloadBruto` é entrada não confiável (evento de
 * outro contexto, possivelmente com conteúdo derivado de documento de
 * fornecedor) — `unknown` de propósito, nunca tipado com base numa suposição
 * de shape. Implementado na Infrastructure (`OrcamentoExtraidoEventACL`, T017).
 */
export interface OrcamentoExtraidoEventACL {
  traduzir(payloadBruto: unknown): OrcamentoExtraidoEventACLResultado;
}
