import { ErroDominio } from '../errors/erro-dominio.js';

export class PeriodoValidadeInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`PeriodoValidade inválido: ${mensagem}`);
  }
}

/** Prazo de validade da proposta — nunca `string` solta. */
export class PeriodoValidade {
  private constructor(readonly validoAte: Date) {}

  static de(validoAte: Date): PeriodoValidade {
    if (Number.isNaN(validoAte.getTime())) {
      throw new PeriodoValidadeInvalidoError('data inválida');
    }
    return new PeriodoValidade(validoAte);
  }

  equals(outro: PeriodoValidade): boolean {
    return this.validoAte.getTime() === outro.validoAte.getTime();
  }

  /** ISO 8601 — payload serializável usado nos Domain Events. */
  paraPayload(): string {
    return this.validoAte.toISOString();
  }
}
