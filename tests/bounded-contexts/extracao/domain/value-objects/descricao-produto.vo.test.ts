import { describe, expect, it } from 'vitest';
import {
  DescricaoProduto,
  DescricaoProdutoInvalidaError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';

describe('DescricaoProduto', () => {
  it('aceita descricao com sku opcional', () => {
    const descricao = DescricaoProduto.de('Parafuso M6', 'SKU-1');
    expect(descricao.descricao).toBe('Parafuso M6');
    expect(descricao.sku).toBe('SKU-1');
  });

  it('rejeita descricao vazia', () => {
    expect(() => DescricaoProduto.de('  ')).toThrow(DescricaoProdutoInvalidaError);
  });
});
