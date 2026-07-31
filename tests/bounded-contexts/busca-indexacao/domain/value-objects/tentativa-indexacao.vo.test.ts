import { describe, expect, it } from 'vitest';
import {
  TentativaIndexacao,
  TentativaIndexacaoInvalidaError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/tentativa-indexacao.vo.js';

const timestamp = new Date('2026-07-31T10:00:00Z');

describe('TentativaIndexacao', () => {
  it('aceita resultado INDEXADO com modeloEmbedding', () => {
    const tentativa = TentativaIndexacao.de({
      resultado: 'INDEXADO',
      timestamp,
      modeloEmbedding: 'amazon.titan-embed-text-v2:0',
    });
    expect(tentativa.resultado).toBe('INDEXADO');
    expect(tentativa.modeloEmbedding).toBe('amazon.titan-embed-text-v2:0');
    expect(tentativa.motivoFalha).toBeUndefined();
  });

  it('rejeita INDEXADO sem modeloEmbedding', () => {
    expect(() => TentativaIndexacao.de({ resultado: 'INDEXADO', timestamp })).toThrow(
      TentativaIndexacaoInvalidaError,
    );
  });

  it('rejeita INDEXADO com modeloEmbedding vazio', () => {
    expect(() =>
      TentativaIndexacao.de({ resultado: 'INDEXADO', timestamp, modeloEmbedding: '  ' }),
    ).toThrow(TentativaIndexacaoInvalidaError);
  });

  it('aceita resultado FALHA_TECNICA com motivoFalha', () => {
    const tentativa = TentativaIndexacao.de({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'serviço de embeddings indisponível',
    });
    expect(tentativa.resultado).toBe('FALHA_TECNICA');
    expect(tentativa.motivoFalha).toBe('serviço de embeddings indisponível');
    expect(tentativa.modeloEmbedding).toBeUndefined();
  });

  it('rejeita FALHA_TECNICA sem motivoFalha — nunca "falhou" genérico', () => {
    expect(() => TentativaIndexacao.de({ resultado: 'FALHA_TECNICA', timestamp })).toThrow(
      TentativaIndexacaoInvalidaError,
    );
  });

  it('rejeita FALHA_TECNICA com motivoFalha vazio', () => {
    expect(() =>
      TentativaIndexacao.de({ resultado: 'FALHA_TECNICA', timestamp, motivoFalha: '   ' }),
    ).toThrow(TentativaIndexacaoInvalidaError);
  });

  it('rejeita INDEXADO acompanhado de motivoFalha', () => {
    expect(() =>
      TentativaIndexacao.de({
        resultado: 'INDEXADO',
        timestamp,
        modeloEmbedding: 'modelo',
        motivoFalha: 'não deveria vir',
      }),
    ).toThrow(TentativaIndexacaoInvalidaError);
  });

  it('rejeita FALHA_TECNICA acompanhado de modeloEmbedding', () => {
    expect(() =>
      TentativaIndexacao.de({
        resultado: 'FALHA_TECNICA',
        timestamp,
        motivoFalha: 'serviço indisponível',
        modeloEmbedding: 'não deveria vir',
      }),
    ).toThrow(TentativaIndexacaoInvalidaError);
  });

  it('rejeita timestamp inválido', () => {
    expect(() =>
      TentativaIndexacao.de({
        resultado: 'INDEXADO',
        timestamp: new Date('inválida'),
        modeloEmbedding: 'modelo',
      }),
    ).toThrow(TentativaIndexacaoInvalidaError);
  });
});
