import type { Embedding } from '../value-objects/embedding.vo.js';

/**
 * Gateway do Agente de Embedding (Bedrock, Titan Text Embeddings V2) —
 * implementado na Infrastructure (`BedrockEmbeddingGateway` +
 * `BedrockEmbeddingACL`, T028) sobre `amazon.titan-embed-text-v2:0`
 * (1024 dimensões, plan.md). Usado tanto por `IndexarOrcamento` (embedding a
 * partir de `ConteudoIndexavel.paraTexto()`) quanto por `BuscarOrcamentos`
 * (embedding do `textoLivreResidual` da consulta) — mesma interface, dois
 * chamadores. Retorna sempre o VO `Embedding` validado, nunca o vetor bruto
 * do modelo.
 */
export interface AgenteEmbeddingGateway {
  gerarEmbedding(texto: string): Promise<Embedding>;
}
