import { describe, expect, it } from 'vitest';
import { CategoriaItem } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import {
  ItemParaValidacao,
  ItemParaValidacaoInvalidoError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';

describe('ItemParaValidacao', () => {
  it('aceita item completo, com categoria já conhecida', () => {
    const item = ItemParaValidacao.de({
      descricao: 'Notebook 14"',
      quantidade: 2,
      precoUnitario: Dinheiro.de(500000, 'BRL'),
      categoria: CategoriaItem.de('Informática'),
      extraido: true,
    });
    expect(item.categoria?.paraPayload()).toBe('Informática');
    expect(item.extraido).toBe(true);
  });

  it('aceita item sem categoria (pendente de categorização)', () => {
    const item = ItemParaValidacao.de({
      descricao: 'Item genérico',
      quantidade: 1,
      precoUnitario: Dinheiro.de(1000, 'BRL'),
      extraido: false,
    });
    expect(item.categoria).toBeUndefined();
  });

  it('rejeita descricao em branco (deve ser omitida, não vazia, para representar ausência)', () => {
    expect(() =>
      ItemParaValidacao.de({
        descricao: '   ',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: false,
      }),
    ).toThrow(ItemParaValidacaoInvalidoError);
  });

  it('aceita descricao ausente mesmo com extraido:false — pendência confirmada da Extração não isenta o campo obrigatório aqui', () => {
    const item = ItemParaValidacao.de({
      quantidade: 1,
      precoUnitario: Dinheiro.de(1000, 'BRL'),
      extraido: false,
    });
    expect(item.descricao).toBeUndefined();
    expect(item.extraido).toBe(false);
  });

  it('rejeita quantidade <= 0', () => {
    expect(() =>
      ItemParaValidacao.de({
        descricao: 'Item',
        quantidade: 0,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: false,
      }),
    ).toThrow(ItemParaValidacaoInvalidoError);
  });
});
