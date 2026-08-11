import { describe, expect, it } from 'vitest';
import {
  Dinheiro,
  DinheiroInvalidoError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';

describe('Dinheiro', () => {
  it('aceita valorCentavos inteiro >= 0 e normaliza a moeda para maiúsculas', () => {
    const dinheiro = Dinheiro.de(1099, 'brl');
    expect(dinheiro.valorCentavos).toBe(1099);
    expect(dinheiro.moeda).toBe('BRL');
  });

  it.each([-1, 1.5])('rejeita valorCentavos inválido: %d', (valor) => {
    expect(() => Dinheiro.de(valor, 'BRL')).toThrow(DinheiroInvalidoError);
  });

  it('rejeita moeda vazia', () => {
    expect(() => Dinheiro.de(100, '  ')).toThrow(DinheiroInvalidoError);
  });

  it('rejeita moeda fora do ISO-4217 (3 letras) — nunca aceita sem normalização', () => {
    expect(() => Dinheiro.de(100, 'R$')).toThrow(DinheiroInvalidoError);
  });
});
