import { describe, expect, it } from 'vitest';
import {
  DIMENSAO_EMBEDDING_OLLAMA,
  OllamaEmbeddingACL,
  OllamaEmbeddingACLInvalidaError,
  ehEmbeddingBrutoOllama,
} from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/ollama-embedding.acl.js';

function vetor(dimensao: number, valor = 0.1): number[] {
  return Array.from({ length: dimensao }, () => valor);
}

describe('ehEmbeddingBrutoOllama', () => {
  it('aceita shape com embedding array de números', () => {
    expect(ehEmbeddingBrutoOllama({ embedding: [1, 2, 3] })).toBe(true);
  });

  it('rejeita ausência de embedding, null, ou array com elemento não numérico', () => {
    expect(ehEmbeddingBrutoOllama({})).toBe(false);
    expect(ehEmbeddingBrutoOllama(null)).toBe(false);
    expect(ehEmbeddingBrutoOllama({ embedding: [1, 'x', 3] })).toBe(false);
  });
});

describe('OllamaEmbeddingACL', () => {
  it('converte embedding bruto de 1024 dimensões (mxbai-embed-large) em VO Embedding válido', () => {
    const acl = new OllamaEmbeddingACL();

    const resultado = acl.converter(
      { embedding: vetor(DIMENSAO_EMBEDDING_OLLAMA) },
      'mxbai-embed-large',
    );

    expect(resultado.dimensao).toBe(DIMENSAO_EMBEDDING_OLLAMA);
    expect(resultado.vetor).toHaveLength(DIMENSAO_EMBEDDING_OLLAMA);
    expect(resultado.modeloId).toBe('mxbai-embed-large');
    expect(resultado.geradoEm).toBeInstanceOf(Date);
  });

  /**
   * Restrição dura da issue #620: `nomic-embed-text` (768) não serve — o
   * schema pgvector já criado (`indice-orcamento.schema.ts`) fixa 1024.
   * Nunca truncar/padronizar silenciosamente, sempre falhar rápido.
   */
  it('lança OllamaEmbeddingACLInvalidaError quando a dimensão do vetor não é 1024', () => {
    const acl = new OllamaEmbeddingACL();

    expect(() => acl.converter({ embedding: vetor(768) }, 'nomic-embed-text')).toThrow(
      OllamaEmbeddingACLInvalidaError,
    );
  });
});
