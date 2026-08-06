import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { Embedding } from '../domain/value-objects/embedding.vo.js';

/**
 * Dimensão exigida pelo schema pgvector já criado
 * (`indice-orcamento.schema.ts:54`, `vector('embedding', { dimensions: 1024 })`).
 * `mxbai-embed-large` é o único modelo Ollama de embedding aprovado para esta
 * porta — `nomic-embed-text` (768) NÃO serve sem migração de schema, fora de
 * escopo desta issue (#620). Nunca truncar, nunca fazer padding: dimensão
 * errada corrompe a busca semântica sem erro visível, então esta ACL falha
 * rápido em vez de ajustar o vetor.
 */
export const DIMENSAO_EMBEDDING_OLLAMA = 1024;

export class OllamaEmbeddingACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`OllamaEmbeddingACL: resposta inválida do modelo de embedding — ${mensagem}`);
  }
}

export interface EmbeddingBrutoOllama {
  readonly embedding: readonly number[];
}

/** Type guard estrutural — nunca confia cegamente no shape reportado pelo Ollama. */
export function ehEmbeddingBrutoOllama(valor: unknown): valor is EmbeddingBrutoOllama {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    Array.isArray(registro.embedding) &&
    registro.embedding.every((item) => typeof item === 'number')
  );
}

/**
 * Anti-Corruption Layer que traduz a resposta bruta do `/api/embed` do Ollama
 * no VO `Embedding` do domínio — mesma disciplina de `BedrockEmbeddingACL`
 * (spec 004): o JSON bruto do modelo nunca cruza para fora da Infrastructure
 * sem passar por um tradutor explícito, que valida a dimensão antes de
 * construir o VO.
 */
export class OllamaEmbeddingACL {
  converter(bruto: EmbeddingBrutoOllama, modelId: string): Embedding {
    if (bruto.embedding.length !== DIMENSAO_EMBEDDING_OLLAMA) {
      throw new OllamaEmbeddingACLInvalidaError(
        `embedding.length (${bruto.embedding.length}) deve ser igual a ` +
          `${DIMENSAO_EMBEDDING_OLLAMA} — modelo Ollama configurado ("${modelId}") não é ` +
          'compatível com o schema pgvector (indice-orcamento.schema.ts). Use mxbai-embed-large.',
      );
    }

    return Embedding.de({
      vetor: bruto.embedding,
      dimensao: DIMENSAO_EMBEDDING_OLLAMA,
      modeloId: modelId,
      geradoEm: new Date(),
    });
  }
}
