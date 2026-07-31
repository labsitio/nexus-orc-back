import { randomBytes } from 'node:crypto';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Base do erro de domínio deste VO. Inline (não em arquivo separado) porque
 * ADR-004 (specs/007-isolamento-multitenant-dados/plan.md) restringe o
 * Shared Kernel a um único arquivo: `tenant-id.vo.ts`.
 */
abstract class ErroDominio extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class TenantIdInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(`TenantId inválido: "${valor}" não é um UUID v7`);
  }
}

/**
 * `TenantId` — Shared Kernel (ADR-004 de `specs/007-isolamento-multitenant-dados/plan.md`).
 * Único VO cujo import direto entre Bounded Contexts é autorizado nesta base de código —
 * a validação de tenant precisa ser byte-idêntica em todos os BCs.
 * Contém apenas validação de formato (UUID v7, mesma convenção de `OrcamentoId`) e
 * (de)serialização — MUST NUNCA acumular lógica de negócio.
 */
export class TenantId {
  private constructor(private readonly valor: string) {}

  static novo(): TenantId {
    return new TenantId(gerarUuidV7());
  }

  static de(valor: string): TenantId {
    if (!UUID_V7_REGEX.test(valor)) {
      throw new TenantIdInvalidoError(valor);
    }
    return new TenantId(valor);
  }

  equals(outro: TenantId): boolean {
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
