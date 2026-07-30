import { describe, expect, it } from "vitest";
import { NivelConfianca } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js";
import { ResultadoClassificacao } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js";
import {
  TentativaClassificacao,
  TentativaClassificacaoInvalidaError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/tentativa-classificacao.vo.js";

describe("TentativaClassificacao", () => {
  it("sucesso() registra agente, resultado e timestamp", () => {
    const resultado = ResultadoClassificacao.criar({
      fornecedorIdentificado: "Fornecedor X",
      formatoIdentificado: "PDF",
      nivelConfianca: NivelConfianca.de(90),
      agenteOrigem: "CLASSIFICADOR",
    });
    const tentativa = TentativaClassificacao.sucesso(
      "CLASSIFICADOR",
      resultado,
    );

    expect(tentativa.resultado).toBe(resultado);
    expect(tentativa.motivoInsucesso).toBeUndefined();
    expect(tentativa.timestamp).toBeInstanceOf(Date);
  });

  it("insucesso() registra agente e motivo", () => {
    const tentativa = TentativaClassificacao.insucesso(
      "CLASSIFICADOR",
      "Bedrock indisponível",
    );

    expect(tentativa.motivoInsucesso).toBe("Bedrock indisponível");
    expect(tentativa.resultado).toBeUndefined();
  });

  it("insucesso() rejeita motivo vazio", () => {
    expect(() =>
      TentativaClassificacao.insucesso("CLASSIFICADOR", "   "),
    ).toThrow(TentativaClassificacaoInvalidaError);
  });
});
