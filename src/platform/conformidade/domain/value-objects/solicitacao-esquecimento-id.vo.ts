import { randomBytes } from 'node:crypto';
import { ErroDominio } from '../errors/erro-dominio.js';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SolicitacaoEsquecimentoIdInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(`SolicitacaoEsquecimentoId inválido: "${valor}" não é um UUID v7`);
  }
}

/**
 * Identidade do agregado `SolicitacaoEsquecimento` — UUID v7, mesma convenção
 * de identidade de 001 (plan.md, seção Agregado).
 */
export class SolicitacaoEsquecimentoId {
  private constructor(private readonly valor: string) {}

  static novo(): SolicitacaoEsquecimentoId {
    return new SolicitacaoEsquecimentoId(gerarUuidV7());
  }

  static de(valor: string): SolicitacaoEsquecimentoId {
    if (!UUID_V7_REGEX.test(valor)) {
      throw new SolicitacaoEsquecimentoIdInvalidoError(valor);
    }
    return new SolicitacaoEsquecimentoId(valor);
  }

  equals(outro: SolicitacaoEsquecimentoId): boolean {
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

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
