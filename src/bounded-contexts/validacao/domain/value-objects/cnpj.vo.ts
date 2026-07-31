import { ErroDominio } from '../errors/erro-dominio.js';

export class CnpjInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`CNPJ inválido: ${mensagem}`);
  }
}

const PESOS_PRIMEIRO_DIGITO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_SEGUNDO_DIGITO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calcularDigitoVerificador(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, indice) => acc + peso * Number(digitos[indice]), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * CNPJ do fornecedor — string normalizada (14 dígitos), valida formato e
 * dígito verificador (algoritmo padrão, determinístico, sem chamada externa).
 * Compatibilidade com cadastro conhecido é regra de negócio separada
 * (`FornecedorCadastradoGateway`), não responsabilidade deste VO.
 */
export class CNPJ {
  private constructor(readonly valor: string) {}

  static de(valorBruto: string): CNPJ {
    const digitos = valorBruto.replace(/\D/g, '');

    if (digitos.length !== 14) {
      throw new CnpjInvalidoError(`deve ter 14 dígitos, recebido "${valorBruto}"`);
    }

    if (/^(\d)\1{13}$/.test(digitos)) {
      throw new CnpjInvalidoError(
        `sequência de dígitos repetidos não é um CNPJ válido "${valorBruto}"`,
      );
    }

    const primeiroDigito = calcularDigitoVerificador(digitos, PESOS_PRIMEIRO_DIGITO);
    const segundoDigito = calcularDigitoVerificador(digitos, PESOS_SEGUNDO_DIGITO);
    const digitoVerificadorEsperado = `${primeiroDigito}${segundoDigito}`;
    const digitoVerificadorInformado = digitos.slice(12);

    if (digitoVerificadorInformado !== digitoVerificadorEsperado) {
      throw new CnpjInvalidoError(`dígito verificador incorreto para "${valorBruto}"`);
    }

    return new CNPJ(digitos);
  }

  equals(outro: CNPJ): boolean {
    return this.valor === outro.valor;
  }

  paraPayload(): string {
    return this.valor;
  }
}
