import { describe, expect, it } from 'vitest';
import {
  CNPJ,
  CnpjInvalidoError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';

describe('CNPJ', () => {
  it('aceita CNPJ válido e normaliza formatação', () => {
    expect(CNPJ.de('11.222.333/0001-81').paraPayload()).toBe('11222333000181');
    expect(CNPJ.de('11222333000181').paraPayload()).toBe('11222333000181');
  });

  it('rejeita CNPJ com dígito verificador incorreto', () => {
    expect(() => CNPJ.de('11222333000180')).toThrow(CnpjInvalidoError);
  });

  it('rejeita CNPJ com quantidade de dígitos incorreta', () => {
    expect(() => CNPJ.de('1122233300018')).toThrow(CnpjInvalidoError);
  });

  it('equals compara pelo valor normalizado', () => {
    expect(CNPJ.de('11.222.333/0001-81').equals(CNPJ.de('11222333000181'))).toBe(true);
  });
});
