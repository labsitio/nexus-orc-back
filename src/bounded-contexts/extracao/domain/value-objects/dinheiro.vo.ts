import { ErroDominio } from '../errors/erro-dominio.js';

export class DinheiroInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Dinheiro inválido: ${mensagem}`);
  }
}

export interface DinheiroPayload {
  readonly valorCentavos: number;
  readonly moeda: string;
}

/**
 * Valor monetário — nunca `number` primitivo solto. Armazenado em centavos
 * (inteiro) para evitar erro de ponto flutuante em dado comercial sensível.
 */
export class Dinheiro {
  private constructor(
    readonly valorCentavos: number,
    readonly moeda: string,
  ) {}

  static de(valorCentavos: number, moeda: string): Dinheiro {
    if (!Number.isInteger(valorCentavos) || valorCentavos < 0) {
      throw new DinheiroInvalidoError(
        `valorCentavos deve ser inteiro >= 0, recebido ${valorCentavos}`,
      );
    }
    if (!moeda.trim()) {
      throw new DinheiroInvalidoError('moeda não pode ser vazia');
    }
    const moedaNormalizada = moeda.toUpperCase();
    if (!/^[A-Z]{3}$/.test(moedaNormalizada)) {
      throw new DinheiroInvalidoError(`moeda deve seguir ISO-4217 (3 letras), recebido "${moeda}"`);
    }
    return new Dinheiro(valorCentavos, moedaNormalizada);
  }

  equals(outro: Dinheiro): boolean {
    return this.valorCentavos === outro.valorCentavos && this.moeda === outro.moeda;
  }

  paraPayload(): DinheiroPayload {
    return { valorCentavos: this.valorCentavos, moeda: this.moeda };
  }
}
