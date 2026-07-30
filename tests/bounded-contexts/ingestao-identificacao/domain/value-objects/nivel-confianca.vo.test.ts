import { describe, expect, it } from "vitest";
import {
  NivelConfianca,
  NivelConfiancaInvalidoError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js";

describe("NivelConfianca", () => {
  it.each([0, 50, 80, 100])("aceita valor válido %d", (valor) => {
    expect(NivelConfianca.de(valor).valor).toBe(valor);
  });

  it.each([-1, 101, 1.5])("rejeita valor fora da faixa/inteiro: %d", (valor) => {
    expect(() => NivelConfianca.de(valor)).toThrow(
      NivelConfiancaInvalidoError,
    );
  });

  it("atingeLimiar compara corretamente", () => {
    expect(NivelConfianca.de(80).atingeLimiar(80)).toBe(true);
    expect(NivelConfianca.de(79).atingeLimiar(80)).toBe(false);
  });
});
