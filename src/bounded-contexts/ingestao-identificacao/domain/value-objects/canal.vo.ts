import { ErroDominio } from "../errors/erro-dominio.js";

export const CANAIS_VALIDOS = [
  "PORTAL_WEB",
  "API_REST",
  "SFTP",
  "APP_MOBILE",
] as const;

export type CanalValor = (typeof CANAIS_VALIDOS)[number];

export class CanalInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(
      `Canal inválido: "${valor}" — esperado um de ${CANAIS_VALIDOS.join(", ")}`,
    );
  }
}

/** Canal de ingestão — enum fechado, 4 canais fixos (Additional Constraint da constituição). */
export class Canal {
  private constructor(readonly valor: CanalValor) {}

  static de(valor: string): Canal {
    if (!CANAIS_VALIDOS.includes(valor as CanalValor)) {
      throw new CanalInvalidoError(valor);
    }
    return new Canal(valor as CanalValor);
  }

  equals(outro: Canal): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
