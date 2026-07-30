import type { CondicoesComerciais } from '../value-objects/condicoes-comerciais.vo.js';
import type { ItemOrcamento } from '../value-objects/item-orcamento.vo.js';
import type { ReferenciaClassificacao } from '../value-objects/referencia-classificacao.vo.js';

export interface AgenteExtratorInput {
  readonly textoConvertido: string;
  readonly referenciaClassificacao: ReferenciaClassificacao;
}

export interface AgenteExtratorResultado {
  readonly itens: readonly ItemOrcamento[];
  readonly condicoesComerciais: CondicoesComerciais;
}

/**
 * Gateway do Agente Extrator (Bedrock) — implementado na Infrastructure
 * (`BedrockExtratorGateway` + `BedrockExtracaoACL`, structured output/tool-use,
 * nunca parsing de texto livre por regex). Retorna sempre Value Objects
 * validados, nunca o JSON bruto do modelo (ACL obrigatória, plan.md).
 */
export interface AgenteExtratorGateway {
  extrair(input: AgenteExtratorInput): Promise<AgenteExtratorResultado>;
}
