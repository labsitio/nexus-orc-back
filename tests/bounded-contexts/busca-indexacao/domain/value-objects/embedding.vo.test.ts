import { describe, expect, it } from 'vitest';
import {
  Embedding,
  EmbeddingInvalidoError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';

const propsValidas = () => ({
  vetor: Array.from({ length: 1024 }, (_, i) => i / 1024),
  dimensao: 1024,
  modeloId: 'amazon.titan-embed-text-v2:0',
  geradoEm: new Date('2026-07-31T10:00:00Z'),
});

describe('Embedding', () => {
  it('aceita vetor cujo length é igual a dimensao', () => {
    const embedding = Embedding.de(propsValidas());
    expect(embedding.vetor).toHaveLength(1024);
    expect(embedding.dimensao).toBe(1024);
    expect(embedding.modeloId).toBe('amazon.titan-embed-text-v2:0');
  });

  it('rejeita quando vetor.length é diferente de dimensao', () => {
    expect(() => Embedding.de({ ...propsValidas(), dimensao: 512 })).toThrow(
      EmbeddingInvalidoError,
    );
  });

  it('rejeita vetor vazio quando dimensao > 0', () => {
    expect(() => Embedding.de({ ...propsValidas(), vetor: [] })).toThrow(EmbeddingInvalidoError);
  });

  it('rejeita geradoEm inválido', () => {
    expect(() => Embedding.de({ ...propsValidas(), geradoEm: new Date('inválida') })).toThrow(
      EmbeddingInvalidoError,
    );
  });

  it('rejeita modeloId vazio', () => {
    expect(() => Embedding.de({ ...propsValidas(), modeloId: '  ' })).toThrow(
      EmbeddingInvalidoError,
    );
  });

  it('não reflete mutação do vetor original após a construção (cópia defensiva)', () => {
    const vetor = [1, 2, 3];
    const embedding = Embedding.de({
      vetor,
      dimensao: 3,
      modeloId: 'modelo-teste',
      geradoEm: new Date('2026-07-31T10:00:00Z'),
    });

    vetor.push(4);

    expect(embedding.vetor).toEqual([1, 2, 3]);
  });
});
