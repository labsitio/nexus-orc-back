import { describe, expect, it } from 'vitest';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../../../../src/bounded-contexts/extracao/domain/events/extracao-escalonada-revisao-humana.event.js';
import { OrcamentoExtraidoComPendenciaConfirmada } from '../../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido-pendencia-confirmada.event.js';
import { OrcamentoExtraido } from '../../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const itens: never[] = [];
const condicoesComerciaisPayload = {
  condicoesPagamento: {
    valor: '30 dias',
    confianca: 95,
    extraido: true,
    agenteOrigem: 'EXTRATOR' as const,
  },
  prazoValidade: {
    valor: '2026-12-31T00:00:00.000Z',
    confianca: 95,
    extraido: true,
    agenteOrigem: 'EXTRATOR' as const,
  },
  condicoesEntrega: {
    valor: 'FOB',
    confianca: 95,
    extraido: true,
    agenteOrigem: 'EXTRATOR' as const,
  },
};

describe.each([
  {
    nome: 'OrcamentoExtraido',
    detailType: 'OrcamentoExtraido',
    criar: () => new OrcamentoExtraido(orcamentoId, itens, condicoesComerciaisPayload),
  },
  {
    nome: 'ExtracaoEscalonadaParaRevisaoHumana',
    detailType: 'ExtracaoEscalonadaParaRevisaoHumana',
    criar: () =>
      new ExtracaoEscalonadaParaRevisaoHumana(
        orcamentoId,
        '1+ campo obrigatório sem confiança suficiente',
      ),
  },
  {
    nome: 'OrcamentoExtraidoComPendenciaConfirmada',
    detailType: 'OrcamentoExtraidoComPendenciaConfirmada',
    criar: () =>
      new OrcamentoExtraidoComPendenciaConfirmada(orcamentoId, itens, condicoesComerciaisPayload),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 1, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(1);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});
