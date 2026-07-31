import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_DOCUMENTO_VALIDAS,
  CategoriaDocumento,
  CategoriaDocumentoInvalidaError,
} from '../../../src/platform/shared-value-objects/domain/categoria-documento.vo.js';

describe('CategoriaDocumento', () => {
  it.each(CATEGORIAS_DOCUMENTO_VALIDAS)('aceita a categoria fixa %s', (valor) => {
    expect(CategoriaDocumento.de(valor).valor).toBe(valor);
  });

  it('rejeita categoria fora do enum fechado', () => {
    expect(() => CategoriaDocumento.de('NOTA_FISCAL')).toThrow(CategoriaDocumentoInvalidaError);
  });

  it('equals compara pelo valor', () => {
    const a = CategoriaDocumento.de('ORCAMENTO_FORNECEDOR');
    const b = CategoriaDocumento.de('ORCAMENTO_FORNECEDOR');
    expect(a.equals(b)).toBe(true);
  });
});
