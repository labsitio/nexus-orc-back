import { describe, expect, it } from 'vitest';
import { CategoriaItem } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import {
  FaixaPreco,
  FaixaPrecoInvalidaError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';

const categoria = () => CategoriaItem.de('Informática');

describe('FaixaPreco', () => {
  it('aceita faixa válida e reconhece preço dentro do intervalo', () => {
    const faixa = FaixaPreco.de(categoria(), Dinheiro.de(1000, 'BRL'), Dinheiro.de(5000, 'BRL'));
    expect(faixa.contem(Dinheiro.de(3000, 'BRL'))).toBe(true);
    expect(faixa.contem(Dinheiro.de(1000, 'BRL'))).toBe(true);
    expect(faixa.contem(Dinheiro.de(5000, 'BRL'))).toBe(true);
  });

  it('rejeita preço fora do intervalo', () => {
    const faixa = FaixaPreco.de(categoria(), Dinheiro.de(1000, 'BRL'), Dinheiro.de(5000, 'BRL'));
    expect(faixa.contem(Dinheiro.de(999, 'BRL'))).toBe(false);
    expect(faixa.contem(Dinheiro.de(5001, 'BRL'))).toBe(false);
  });

  it('rejeita moedas divergentes entre mínimo e máximo', () => {
    expect(() =>
      FaixaPreco.de(categoria(), Dinheiro.de(1000, 'BRL'), Dinheiro.de(5000, 'USD')),
    ).toThrow(FaixaPrecoInvalidaError);
  });

  it('rejeita mínimo maior que máximo', () => {
    expect(() =>
      FaixaPreco.de(categoria(), Dinheiro.de(5000, 'BRL'), Dinheiro.de(1000, 'BRL')),
    ).toThrow(FaixaPrecoInvalidaError);
  });

  it('preço em moeda diferente da faixa nunca é considerado contido', () => {
    const faixa = FaixaPreco.de(categoria(), Dinheiro.de(1000, 'BRL'), Dinheiro.de(5000, 'BRL'));
    expect(faixa.contem(Dinheiro.de(3000, 'USD'))).toBe(false);
  });
});
