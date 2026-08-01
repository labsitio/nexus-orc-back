import type { ContextoExtracao } from '../value-objects/contexto-extracao.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';

export interface OrcamentoExtraidoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly contextoExtracao: ContextoExtracao;
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
