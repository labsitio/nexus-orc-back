import { describe, expect, it } from 'vitest';
import {
  CategoriaItem,
  CategoriaItemInvalidaError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';

describe('CategoriaItem', () => {
  it('aceita categoria não vazia e normaliza espaços', () => {
    expect(CategoriaItem.de('  Material de Escritório  ').paraPayload()).toBe(
      'Material de Escritório',
    );
  });

  it('rejeita categoria vazia', () => {
    expect(() => CategoriaItem.de('   ')).toThrow(CategoriaItemInvalidaError);
  });

  it('equals compara pelo valor normalizado', () => {
    expect(CategoriaItem.de('Informática').equals(CategoriaItem.de('Informática'))).toBe(true);
  });
});
