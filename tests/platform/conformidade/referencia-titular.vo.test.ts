import { describe, expect, it } from 'vitest';
import {
  ReferenciaTitular,
  ReferenciaTitularInvalidaError,
} from '../../../src/platform/conformidade/domain/value-objects/referencia-titular.vo.js';

describe('ReferenciaTitular', () => {
  it('aceita valor não vazio', () => {
    const ref = ReferenciaTitular.de('fornecedor@exemplo.com');

    expect(ref.valor).toBe('fornecedor@exemplo.com');
    expect(ref.toString()).toBe('fornecedor@exemplo.com');
  });

  it('normaliza para minúsculas e remove espaços nas bordas', () => {
    const ref = ReferenciaTitular.de('  Fornecedor@Exemplo.COM  ');

    expect(ref.valor).toBe('fornecedor@exemplo.com');
  });

  it.each(['', '   '])('rejeita valor vazio ou só espaços ("%s")', (valor) => {
    expect(() => ReferenciaTitular.de(valor)).toThrow(ReferenciaTitularInvalidaError);
  });

  it('rejeita valor acima de 320 caracteres', () => {
    const valor = 'a'.repeat(321);

    expect(() => ReferenciaTitular.de(valor)).toThrow(ReferenciaTitularInvalidaError);
  });

  it('aceita valor com exatamente 320 caracteres', () => {
    const valor = 'a'.repeat(320);

    expect(() => ReferenciaTitular.de(valor)).not.toThrow();
  });

  it('equals compara pelo valor normalizado', () => {
    const a = ReferenciaTitular.de('Fornecedor@Exemplo.com');
    const b = ReferenciaTitular.de('fornecedor@exemplo.com');
    const c = ReferenciaTitular.de('outro@exemplo.com');

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
