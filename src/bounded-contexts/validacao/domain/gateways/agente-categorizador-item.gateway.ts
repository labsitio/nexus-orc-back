import type { CategoriaItem } from '../value-objects/categoria-item.vo.js';

export interface AgenteCategorizadorItemInput {
  /** Descrição livre do item — entrada não confiável, vinda de documento de fornecedor. */
  readonly descricaoItem: string;
  /** Catálogo configurado (`faixas_preco_categoria`) — a saída MUST pertencer a este conjunto. */
  readonly catalogoCategorias: readonly string[];
}

/**
 * Categorização semântica de item via IA generativa (Bedrock) — usada
 * apenas para selecionar qual `FaixaPreco` (dado determinístico, já
 * configurado) será comparada; nunca decide sozinha se o preço está
 * correto (ADR-002, plan.md). Implementado na Infrastructure
 * (`BedrockCategorizadorItemGateway` + `BedrockCategorizacaoACL`, T041)
 * com saída estruturada (tool-use/JSON Schema) restrita ao
 * `catalogoCategorias` informado — nunca texto livre interpretado por
 * regex, nunca categoria inventada fora do catálogo.
 */
export interface AgenteCategorizadorItemGateway {
  categorizar(input: AgenteCategorizadorItemInput): Promise<CategoriaItem>;
}
