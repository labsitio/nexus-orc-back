import { describe, expect, it } from 'vitest';
import {
  BedrockEmbeddingACL,
  BedrockEmbeddingACLInvalidaError,
  DIMENSAO_EMBEDDING_TITAN_V2,
  ehEmbeddingBruto,
} from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.acl.js';

function vetor(dimensao: number, valor = 0.1): number[] {
  return Array.from({ length: dimensao }, () => valor);
}

describe('ehEmbeddingBruto', () => {
  it('aceita shape com embedding array de números', () => {
    expect(ehEmbeddingBruto({ embedding: [1, 2, 3] })).toBe(true);
  });

  it('rejeita ausência de embedding, null, ou array com elemento não numérico', () => {
    expect(ehEmbeddingBruto({})).toBe(false);
    expect(ehEmbeddingBruto(null)).toBe(false);
    expect(ehEmbeddingBruto({ embedding: [1, 'x', 3] })).toBe(false);
  });
});

describe('BedrockEmbeddingACL', () => {
  it('converte embedding bruto de 1024 dimensões em VO Embedding válido', () => {
    const acl = new BedrockEmbeddingACL();

    const resultado = acl.converter(
      { embedding: vetor(DIMENSAO_EMBEDDING_TITAN_V2) },
      'amazon.titan-embed-text-v2:0',
    );

    expect(resultado.dimensao).toBe(DIMENSAO_EMBEDDING_TITAN_V2);
    expect(resultado.vetor).toHaveLength(DIMENSAO_EMBEDDING_TITAN_V2);
    expect(resultado.modeloId).toBe('amazon.titan-embed-text-v2:0');
    expect(resultado.geradoEm).toBeInstanceOf(Date);
  });

  it('lança BedrockEmbeddingACLInvalidaError quando a dimensão do vetor não é 1024', () => {
    const acl = new BedrockEmbeddingACL();

    expect(() => acl.converter({ embedding: vetor(512) }, 'amazon.titan-embed-text-v2:0')).toThrow(
      BedrockEmbeddingACLInvalidaError,
    );
  });
});
