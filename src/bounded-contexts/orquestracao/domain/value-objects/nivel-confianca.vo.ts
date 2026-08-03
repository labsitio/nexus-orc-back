import { ErroDominio } from '../errors/erro-dominio.js';

export class NivelConfiancaInvalidoError extends ErroDominio {
  constructor(valor: number) {
    super(`NivelConfianca inválido: ${valor} — esperado inteiro entre 0 e 100`);
  }
}

/**
 * Confiança da decisão do Agente Orquestrador, 0–100. Mesma regra das
 * specs 001–003, redefinida localmente neste BC (VO simples, duplicação
 * aceitável — plan.md, "sem import cruzado").
 */
export class NivelConfianca {
  private constructor(readonly valor: number) {}

  static de(valor: number): NivelConfianca {
    if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
      throw new NivelConfiancaInvalidoError(valor);
    }
    return new NivelConfianca(valor);
  }

  atingeLimiar(limiar: number): boolean {
    return this.valor >= limiar;
  }

  equals(outro: NivelConfianca): boolean {
    return this.valor === outro.valor;
  }
}
