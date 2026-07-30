import { ErroDominio } from '../errors/erro-dominio.js';

export class QuantidadeInvalidaError extends ErroDominio {
  constructor(valor: number) {
    super(`Quantidade inválida: ${valor} — esperado número positivo`);
  }
}

/** Quantidade de um item do orçamento — nunca `number` primitivo solto. */
export class Quantidade {
  private constructor(readonly valor: number) {}

  static de(valor: number): Quantidade {
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new QuantidadeInvalidaError(valor);
    }
    return new Quantidade(valor);
  }

  equals(outra: Quantidade): boolean {
    return this.valor === outra.valor;
  }
}
