import { describe, expect, it } from 'vitest';
import { ErroDominio } from '../../../../../src/bounded-contexts/validacao/domain/errors/erro-dominio.js';
import {
  FornecedorCadastradoACLInvalidaError,
  FornecedorCadastradoIndisponivelError,
} from '../../../../../src/bounded-contexts/validacao/domain/errors/fornecedor-cadastrado.errors.js';

describe('erros de domínio de FornecedorCadastrado', () => {
  it('FornecedorCadastradoIndisponivelError é um ErroDominio com mensagem descritiva', () => {
    const erro = new FornecedorCadastradoIndisponivelError('timeout esgotado');
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro.message).toContain('timeout esgotado');
  });

  it('FornecedorCadastradoACLInvalidaError é um ErroDominio com mensagem descritiva', () => {
    const erro = new FornecedorCadastradoACLInvalidaError('campo ausente');
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro.message).toContain('campo ausente');
  });
});
