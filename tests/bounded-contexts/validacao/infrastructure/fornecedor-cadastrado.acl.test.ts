import { describe, expect, it } from 'vitest';
import {
  FornecedorCadastradoACL,
  FornecedorCadastradoACLInvalidaError,
} from '../../../../src/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado.acl.js';

describe('FornecedorCadastradoACL', () => {
  it('traduz { cadastrado: true } para true', () => {
    expect(new FornecedorCadastradoACL().converter({ cadastrado: true })).toBe(true);
  });

  it('traduz { cadastrado: false } para false', () => {
    expect(new FornecedorCadastradoACL().converter({ cadastrado: false })).toBe(false);
  });

  it.each([null, undefined, 'texto', 42, {}, { cadastrado: 'sim' }, { cadastrado: 1 }])(
    'lança FornecedorCadastradoACLInvalidaError para corpo malformado: %j',
    (bruto) => {
      expect(() => new FornecedorCadastradoACL().converter(bruto)).toThrow(
        FornecedorCadastradoACLInvalidaError,
      );
    },
  );
});
