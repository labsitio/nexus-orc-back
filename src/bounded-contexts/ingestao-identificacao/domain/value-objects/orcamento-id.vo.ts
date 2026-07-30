import { randomBytes } from "node:crypto";
import { ErroDominio } from "../errors/erro-dominio.js";

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OrcamentoIdInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(`OrcamentoId inválido: "${valor}" não é um UUID v7`);
  }
}

/**
 * Identidade do agregado `Orcamento` — UUID v7 (ordenável por tempo),
 * gerado exclusivamente no Gateway de Ingestão deste contexto (plan.md, convenção 6).
 * Node ainda não expõe `crypto.randomUUID` em v7 — gerado manualmente por RFC 9562.
 */
export class OrcamentoId {
  private constructor(private readonly valor: string) {}

  static novo(): OrcamentoId {
    return new OrcamentoId(gerarUuidV7());
  }

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

function gerarUuidV7(): string {
  const unixTsMs = Date.now();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(unixTsMs, 0, 6);

  const aleatorio = randomBytes(10);
  aleatorio.copy(bytes, 6);

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version = 0111 (7)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant = 10

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
