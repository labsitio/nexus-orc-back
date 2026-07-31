import { describe, expect, it } from 'vitest';
import { FalhaIndexacaoDetectada } from '../../../../../src/bounded-contexts/busca-indexacao/domain/events/falha-indexacao-detectada.event.js';
import { OrcamentoIndexado } from '../../../../../src/bounded-contexts/busca-indexacao/domain/events/orcamento-indexado.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';

describe.each([
  {
    nome: 'OrcamentoIndexado',
    detailType: 'OrcamentoIndexado',
    criar: () => new OrcamentoIndexado(orcamentoId, 'amazon.titan-embed-text-v2:0'),
  },
  {
    nome: 'FalhaIndexacaoDetectada',
    detailType: 'FalhaIndexacaoDetectada',
    criar: () => new FalhaIndexacaoDetectada(orcamentoId, 'serviço de embeddings indisponível', 1),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 1, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(1);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});

describe('OrcamentoIndexado', () => {
  it('carrega o modeloEmbedding usado na geração do vetor persistido', () => {
    const evento = new OrcamentoIndexado(orcamentoId, 'amazon.titan-embed-text-v2:0');
    expect(evento.modeloEmbedding).toBe('amazon.titan-embed-text-v2:0');
  });
});

describe('FalhaIndexacaoDetectada', () => {
  it('carrega motivoFalha legível e o número da tentativa que falhou', () => {
    const evento = new FalhaIndexacaoDetectada(
      orcamentoId,
      'serviço de embeddings indisponível',
      2,
    );
    expect(evento.motivoFalha).toBe('serviço de embeddings indisponível');
    expect(evento.tentativaNumero).toBe(2);
  });
});
