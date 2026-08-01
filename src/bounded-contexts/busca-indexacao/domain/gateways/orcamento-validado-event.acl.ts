import type { ConteudoIndexavel } from '../value-objects/conteudo-indexavel.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { OrigemValidacao } from '../value-objects/origem-validacao.vo.js';

export type OrcamentoValidadoEventDetailType = 'OrcamentoValidado' | 'OrcamentoValidadoComRessalva';

export interface OrcamentoValidadoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly conteudoIndexavel: ConteudoIndexavel;
  readonly origemValidacao: OrigemValidacao;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload bruto
 * dos eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (`source: nexo.validacao`) — traduz o shape do evento upstream (payload
 * enriquecido com `itens`/`condicoesComerciais`, ver ADR-003 do `plan.md` e
 * T006/T018) para `ConteudoIndexavel` + `OrigemValidacao` locais deste BC,
 * nunca importando tipos de domínio do BC Validação (fronteira de Bounded
 * Context, plan.md). `payloadBruto` é entrada não confiável (evento de outro
 * contexto, contendo conteúdo derivado de documento de fornecedor) —
 * `unknown` de propósito, nunca tipado com base numa suposição de shape.
 * `detailType` distingue a origem (`VALIDADO`/`VALIDADO_COM_RESSALVA`,
 * ADR-004) sem instituir hierarquia de "menos válido" entre as duas.
 * Implementado na Infrastructure (`OrcamentoValidadoEventACL`, T018).
 */
export interface OrcamentoValidadoEventACL {
  traduzir(
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): OrcamentoValidadoEventACLResultado;
}
