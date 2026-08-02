import { describe, expect, it, vi } from 'vitest';
import { CNPJ } from '../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';
import { FornecedorCadastradoIndisponivelError } from '../../../../src/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado-http.gateway.js';
import { FornecedorCadastradoHttpGateway } from '../../../../src/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado-http.gateway.js';
import { FornecedorCadastradoACLInvalidaError } from '../../../../src/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado.acl.js';

const CNPJ_VALIDO = CNPJ.de('11222333000181');

function respostaFake(status: number, corpo?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

describe('FornecedorCadastradoHttpGateway', () => {
  it('retorna true quando o sistema externo responde cadastrado=true na primeira tentativa', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaFake(200, { cadastrado: true }));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://cadastro.exemplo/fornecedores/11222333000181',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('retorna false quando o sistema externo responde cadastrado=false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaFake(200, { cadastrado: false }));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).resolves.toBe(false);
  });

  it('retenta em erro 5xx e retorna sucesso na segunda tentativa', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respostaFake(503))
      .mockResolvedValueOnce(respostaFake(200, { cadastrado: true }));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn, 100, 2);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retenta em erro de rede e retorna sucesso na tentativa seguinte', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(respostaFake(200, { cadastrado: true }));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn, 100, 2);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('lança FornecedorCadastradoIndisponivelError após esgotar as tentativas com 5xx repetido', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaFake(503));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn, 100, 2);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).rejects.toThrow(
      FornecedorCadastradoIndisponivelError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('não retenta em erro 4xx — falha definitiva na primeira tentativa', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaFake(404));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn, 100, 3);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).rejects.toThrow(
      FornecedorCadastradoIndisponivelError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('não retenta quando o corpo da resposta 200 é malformado — propaga erro do ACL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaFake(200, { cadastrado: 'sim' }));
    const gateway = new FornecedorCadastradoHttpGateway('https://cadastro.exemplo', fetchFn, 100, 3);

    await expect(gateway.estaCadastrado(CNPJ_VALIDO)).rejects.toThrow(
      FornecedorCadastradoACLInvalidaError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
