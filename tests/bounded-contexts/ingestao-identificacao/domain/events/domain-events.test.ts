import { describe, expect, it } from "vitest";
import { OrcamentoClassificado } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.js";
import { OrcamentoEscalonadoParaRevisaoHumana } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.js";
import { OrcamentoReclassificadoPorRevisaoHumana } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-reclassificado-revisao-humana.event.js";
import { OrcamentoRecebido } from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js";

const orcamentoId = "018f4b1a-0000-7000-8000-000000000000";
const resultadoPayload = {
  fornecedorIdentificado: "Fornecedor X",
  formatoIdentificado: "PDF",
  nivelConfianca: 90,
  agenteOrigem: "CLASSIFICADOR" as const,
};

describe.each([
  {
    nome: "OrcamentoRecebido",
    detailType: "OrcamentoRecebido",
    criar: () =>
      new OrcamentoRecebido(orcamentoId, "PORTAL_WEB", {
        bucket: "nexo-orcamentos-raw",
        key: "k",
        versionId: "v1",
      }),
  },
  {
    nome: "OrcamentoClassificado",
    detailType: "OrcamentoClassificado",
    criar: () => new OrcamentoClassificado(orcamentoId, resultadoPayload),
  },
  {
    nome: "OrcamentoEscalonadoParaRevisaoHumana",
    detailType: "OrcamentoEscalonadoParaRevisaoHumana",
    criar: () =>
      new OrcamentoEscalonadoParaRevisaoHumana(orcamentoId, resultadoPayload),
  },
  {
    nome: "OrcamentoReclassificadoPorRevisaoHumana",
    detailType: "OrcamentoReclassificadoPorRevisaoHumana",
    criar: () =>
      new OrcamentoReclassificadoPorRevisaoHumana(
        orcamentoId,
        resultadoPayload,
      ),
  },
])("$nome", ({ detailType, criar }) => {
  it(`schemaVersion 1, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(1);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});
