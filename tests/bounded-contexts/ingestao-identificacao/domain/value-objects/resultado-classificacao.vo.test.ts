import { describe, expect, it } from "vitest";
import { NivelConfianca } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js";
import {
  ResultadoClassificacao,
  ResultadoClassificacaoInvalidoError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js";

describe("ResultadoClassificacao", () => {
  it("cria com dados válidos e expõe payload serializável", () => {
    const resultado = ResultadoClassificacao.criar({
      fornecedorIdentificado: "Fornecedor X",
      formatoIdentificado: "PDF",
      nivelConfianca: NivelConfianca.de(90),
      agenteOrigem: "CLASSIFICADOR",
    });

    expect(resultado.paraPayload()).toEqual({
      fornecedorIdentificado: "Fornecedor X",
      formatoIdentificado: "PDF",
      nivelConfianca: 90,
      agenteOrigem: "CLASSIFICADOR",
    });
  });

  it("rejeita fornecedorIdentificado vazio", () => {
    expect(() =>
      ResultadoClassificacao.criar({
        fornecedorIdentificado: "  ",
        formatoIdentificado: "PDF",
        nivelConfianca: NivelConfianca.de(90),
        agenteOrigem: "CLASSIFICADOR",
      }),
    ).toThrow(ResultadoClassificacaoInvalidoError);
  });

  it("rejeita formatoIdentificado vazio", () => {
    expect(() =>
      ResultadoClassificacao.criar({
        fornecedorIdentificado: "Fornecedor X",
        formatoIdentificado: "",
        nivelConfianca: NivelConfianca.de(90),
        agenteOrigem: "HUMANO",
      }),
    ).toThrow(ResultadoClassificacaoInvalidoError);
  });
});
