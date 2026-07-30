import { describe, expect, it } from 'vitest';
import {
  Quantidade,
  QuantidadeInvalidaError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';

describe('Quantidade', () => {
  it.each([1, 2.5, 100])('aceita valor positivo %d', (valor) => {
    expect(Quantidade.de(valor).valor).toBe(valor);
  });

  it.each([0, -1, NaN, Infinity])('rejeita valor inválido: %d', (valor) => {
    expect(() => Quantidade.de(valor)).toThrow(QuantidadeInvalidaError);
  });
});
