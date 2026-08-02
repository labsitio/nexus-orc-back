import { ErroDominio } from '../domain/errors/erro-dominio.js';

export class FornecedorCadastradoACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`FornecedorCadastradoACL: resposta do sistema externo inválida — ${mensagem}`);
  }
}

/**
 * Shape esperado da resposta do sistema externo de cadastro de fornecedores
 * (`GET /fornecedores/{cnpj}`). Protocolo/contrato exato ainda não confirmado
 * com Ricardo/produto (plan.md, seção Infrastructure, risco remanescente) —
 * assumido `{ cadastrado: boolean }` como contrato mínimo de trabalho; MUST
 * ser revisitado quando o contrato real for confirmado.
 */
interface RespostaFornecedorCadastradoBruta {
  readonly cadastrado: boolean;
}

function ehRespostaFornecedorCadastradoBruta(
  valor: unknown,
): valor is RespostaFornecedorCadastradoBruta {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as Record<string, unknown>).cadastrado === 'boolean'
  );
}

/**
 * Anti-Corruption Layer do sistema externo de cadastro de fornecedores
 * (plan.md, seção Infrastructure e Segurança) — a resposta HTTP é entrada
 * não confiável e nunca cruza para o Domain sem passar por aqui.
 */
export class FornecedorCadastradoACL {
  converter(bruto: unknown): boolean {
    if (!ehRespostaFornecedorCadastradoBruta(bruto)) {
      throw new FornecedorCadastradoACLInvalidaError(
        'esperado objeto com campo booleano "cadastrado"',
      );
    }
    return bruto.cadastrado;
  }
}
