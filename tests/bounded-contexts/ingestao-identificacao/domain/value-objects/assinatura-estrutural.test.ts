import { describe, expect, it } from "vitest";
import {
  AssinaturaEstrutural,
  AssinaturaEstruturalInvalidaError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.js";

const HASH_VALIDO =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("AssinaturaEstrutural", () => {
  it("cria a partir de hash SHA-256 hex válido", () => {
    expect(AssinaturaEstrutural.de(HASH_VALIDO).valor).toBe(HASH_VALIDO);
  });

  it.each([
    "",
    "  ",
    "abc",
    HASH_VALIDO.toUpperCase(),
    HASH_VALIDO.slice(0, 63),
    `${HASH_VALIDO}f`,
    `${HASH_VALIDO.slice(0, 63)}g`,
  ])("rejeita string vazia/malformada: %s", (valor) => {
    expect(() => AssinaturaEstrutural.de(valor)).toThrow(
      AssinaturaEstruturalInvalidaError,
    );
  });

  it("equals compara pelo valor", () => {
    const a = AssinaturaEstrutural.de(HASH_VALIDO);
    const b = AssinaturaEstrutural.de(HASH_VALIDO);
    expect(a.equals(b)).toBe(true);
  });
});
