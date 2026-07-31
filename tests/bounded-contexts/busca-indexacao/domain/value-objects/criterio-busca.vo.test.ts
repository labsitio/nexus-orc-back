import { describe, expect, it } from 'vitest';
import {
  CriterioBusca,
  CriterioBuscaInvalidoError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/dinheiro.vo.js';

describe('CriterioBusca', () => {
  it('aceita apenas textoLivreResidual, sem nenhum filtro estruturado', () => {
    const criterio = CriterioBusca.de({ textoLivreResidual: 'material elétrico industrial' });
    expect(criterio.textoLivreResidual).toBe('material elétrico industrial');
    expect(criterio.categoria).toBeUndefined();
  });

  it('aceita textoLivreResidual vazio quando filtros explícitos bastam', () => {
    const criterio = CriterioBusca.de({
      textoLivreResidual: '',
      categoria: 'eletrico',
      precoMinimo: Dinheiro.de(1000, 'BRL'),
      precoMaximo: Dinheiro.de(5000, 'BRL'),
    });
    expect(criterio.textoLivreResidual).toBe('');
    expect(criterio.precoMinimo?.valorCentavos).toBe(1000);
  });

  it('aceita periodoRecebimento com inicio <= fim', () => {
    const criterio = CriterioBusca.de({
      textoLivreResidual: '',
      periodoRecebimento: { inicio: new Date('2026-01-01'), fim: new Date('2026-01-31') },
    });
    expect(criterio.periodoRecebimento?.inicio).toEqual(new Date('2026-01-01'));
  });

  it('rejeita precoMinimo maior que precoMaximo', () => {
    expect(() =>
      CriterioBusca.de({
        textoLivreResidual: '',
        precoMinimo: Dinheiro.de(5000, 'BRL'),
        precoMaximo: Dinheiro.de(1000, 'BRL'),
      }),
    ).toThrow(CriterioBuscaInvalidoError);
  });

  it('rejeita precoMinimo e precoMaximo em moedas diferentes', () => {
    expect(() =>
      CriterioBusca.de({
        textoLivreResidual: '',
        precoMinimo: Dinheiro.de(1000, 'BRL'),
        precoMaximo: Dinheiro.de(1000, 'USD'),
      }),
    ).toThrow(CriterioBuscaInvalidoError);
  });

  it('rejeita periodoRecebimento com inicio após fim', () => {
    expect(() =>
      CriterioBusca.de({
        textoLivreResidual: '',
        periodoRecebimento: { inicio: new Date('2026-02-01'), fim: new Date('2026-01-01') },
      }),
    ).toThrow(CriterioBuscaInvalidoError);
  });

  it('rejeita periodoRecebimento com data inválida', () => {
    expect(() =>
      CriterioBusca.de({
        textoLivreResidual: '',
        periodoRecebimento: { inicio: new Date('inválida'), fim: new Date('2026-01-01') },
      }),
    ).toThrow(CriterioBuscaInvalidoError);
  });
});
