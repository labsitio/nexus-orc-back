import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { Embedding } from '../domain/value-objects/embedding.vo.js';

/** Dimensão do vetor de embedding — Titan Text Embeddings V2, ver plan.md/ADR-001. */
export const DIMENSAO_EMBEDDING_TITAN_V2 = 1024;

export class BedrockEmbeddingACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BedrockEmbeddingACL: resposta inválida do modelo de embedding — ${mensagem}`);
  }
}

export interface EmbeddingBruto {
  readonly embedding: readonly number[];
}

/** Type guard estrutural — nunca confia cegamente no shape reportado pelo modelo. */
export function ehEmbeddingBruto(valor: unknown): valor is EmbeddingBruto {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    Array.isArray(registro.embedding) &&
    registro.embedding.every((item) => typeof item === 'number')
  );
}

/**
 * Anti-Corruption Layer que traduz a resposta bruta do InvokeModel (Titan
 * Text Embeddings V2) no VO `Embedding` do domínio — mesma disciplina de
 * `BedrockExtracaoACL` (spec 002): o JSON bruto do modelo nunca cruza para
 * fora da Infrastructure sem passar por um tradutor explícito.
 */
export class BedrockEmbeddingACL {
  converter(bruto: EmbeddingBruto, modelId: string): Embedding {
    if (bruto.embedding.length !== DIMENSAO_EMBEDDING_TITAN_V2) {
      throw new BedrockEmbeddingACLInvalidaError(
        `embedding.length (${bruto.embedding.length}) deve ser igual a ` +
          `${DIMENSAO_EMBEDDING_TITAN_V2}`,
      );
    }

    return Embedding.de({
      vetor: bruto.embedding,
      dimensao: DIMENSAO_EMBEDDING_TITAN_V2,
      modeloId: modelId,
      geradoEm: new Date(),
    });
  }
}
