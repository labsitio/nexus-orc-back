import { describe, expect, it } from 'vitest';
import {
  ContextoClassificacao,
  ContextoClassificacaoInvalidoError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';

describe('ContextoClassificacao', () => {
  it('aceita fornecedorIdentificado e formatoIdentificado não vazios', () => {
    const contexto = ContextoClassificacao.de({
      fornecedorIdentificado: 'Fornecedor Alfa Ltda',
      formatoIdentificado: 'PDF',
    });
    expect(contexto.fornecedorIdentificado).toBe('Fornecedor Alfa Ltda');
    expect(contexto.formatoIdentificado).toBe('PDF');
  });

  it('rejeita fornecedorIdentificado vazio', () => {
    expect(() =>
      ContextoClassificacao.de({ fornecedorIdentificado: '  ', formatoIdentificado: 'PDF' }),
    ).toThrow(ContextoClassificacaoInvalidoError);
  });

  it('rejeita formatoIdentificado vazio', () => {
    expect(() =>
      ContextoClassificacao.de({ fornecedorIdentificado: 'Fornecedor Alfa', formatoIdentificado: '' }),
    ).toThrow(ContextoClassificacaoInvalidoError);
  });

  it('equals compara pelos valores', () => {
    const params = { fornecedorIdentificado: 'Fornecedor Alfa', formatoIdentificado: 'PDF' };
    expect(ContextoClassificacao.de(params).equals(ContextoClassificacao.de(params))).toBe(true);
    expect(
      ContextoClassificacao.de(params).equals(
        ContextoClassificacao.de({ ...params, formatoIdentificado: 'XML' }),
      ),
    ).toBe(false);
  });
});
