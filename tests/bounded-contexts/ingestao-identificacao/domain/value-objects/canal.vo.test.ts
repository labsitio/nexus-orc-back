import { describe, expect, it } from "vitest";
import {
  CANAIS_VALIDOS,
  Canal,
  CanalInvalidoError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js";

describe("Canal", () => {
  it.each(CANAIS_VALIDOS)("aceita o canal fixo %s", (valor) => {
    expect(Canal.de(valor).valor).toBe(valor);
  });

  it("rejeita canal fora dos 4 fixos", () => {
    expect(() => Canal.de("EMAIL")).toThrow(CanalInvalidoError);
  });
});
