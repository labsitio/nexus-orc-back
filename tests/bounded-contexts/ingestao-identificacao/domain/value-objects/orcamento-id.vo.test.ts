import { describe, expect, it } from "vitest";
import {
  OrcamentoId,
  OrcamentoIdInvalidoError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js";

describe("OrcamentoId", () => {
  it("gera um UUID v7 válido", () => {
    const id = OrcamentoId.novo();
    expect(() => OrcamentoId.de(id.toString())).not.toThrow();
    expect(id.toString()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("aceita UUID v7 explícito", () => {
    const valor = "018f4b1a-0000-7000-8000-000000000000";
    expect(OrcamentoId.de(valor).toString()).toBe(valor);
  });

  it("rejeita string que não é UUID v7", () => {
    expect(() => OrcamentoId.de("não-e-um-uuid")).toThrow(
      OrcamentoIdInvalidoError,
    );
  });

  it("rejeita UUID v4 (version nibble errado)", () => {
    expect(() =>
      OrcamentoId.de("018f4b1a-0000-4000-8000-000000000000"),
    ).toThrow(OrcamentoIdInvalidoError);
  });

  it("equals compara por valor", () => {
    const valor = "018f4b1a-0000-7000-8000-000000000000";
    expect(OrcamentoId.de(valor).equals(OrcamentoId.de(valor))).toBe(true);
  });
});
