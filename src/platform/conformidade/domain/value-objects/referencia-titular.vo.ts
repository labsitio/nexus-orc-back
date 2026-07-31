import { ErroDominio } from '../errors/erro-dominio.js';

const TAMANHO_MAXIMO = 320;

export class ReferenciaTitularInvalidaError extends ErroDominio {
  constructor() {
    super(
      `ReferenciaTitular inválida: esperado texto não vazio de até ${TAMANHO_MAXIMO} caracteres`,
    );
  }
}

/**
 * Identifica o titular de dado pessoal de forma estável entre Bounded
 * Contexts (ex.: e-mail normalizado ou CNPJ+contato), sem expor a modelagem
 * interna de nenhum BC (plan.md, spec-008). Opaco por design: Conformidade
 * nunca interpreta o formato do valor, apenas o usa para correlacionar
 * confirmações de anonimização entre contextos.
 *
 * Normalizado em minúsculas para que a mesma referência lógica (ex.: mesmo
 * e-mail com capitalização diferente) resulte no mesmo VO.
 */
export class ReferenciaTitular {
  private constructor(readonly valor: string) {}

  static de(valor: string): ReferenciaTitular {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado.length === 0 || normalizado.length > TAMANHO_MAXIMO) {
      throw new ReferenciaTitularInvalidaError();
    }
    return new ReferenciaTitular(normalizado);
  }

  equals(outra: ReferenciaTitular): boolean {
    return this.valor === outra.valor;
  }

  toString(): string {
    return this.valor;
  }
}
