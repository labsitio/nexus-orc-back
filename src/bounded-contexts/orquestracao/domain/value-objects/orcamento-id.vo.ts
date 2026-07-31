import { ErroDominio } from '../errors/erro-dominio.js';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OrcamentoIdInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(`OrcamentoId inválido: "${valor}" não é um UUID v7`);
  }
}

/**
 * Identidade do agregado `DecisaoWorkflow` — mesmo valor de `OrcamentoId`
 * gerado exclusivamente pelo Gateway de Ingestão (spec 001); redefinido
 * localmente neste BC, sem import cruzado (plan.md, convenção herdada).
 * Orquestração nunca gera um novo identificador — apenas valida/reutiliza (`de`).
 */
export class OrcamentoId {
  private constructor(private readonly valor: string) {}

  static de(valor: string): OrcamentoId {
    if (!UUID_V7_REGEX.test(valor)) {
      throw new OrcamentoIdInvalidoError(valor);
    }
    return new OrcamentoId(valor);
  }

  equals(outro: OrcamentoId): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
