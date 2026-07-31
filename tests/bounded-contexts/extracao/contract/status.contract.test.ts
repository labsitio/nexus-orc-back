import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
  statusExtracaoResponseSchema,
} from '../../../../src/bounded-contexts/extracao/interface/http/status.schema.js';

/**
 * Contract test de `GET /v1/orcamentos/{orcamentoId}/extracao/status` (T019/#84).
 *
 * Valida o contrato de borda (Zod, espelhando o shape real de `paraPayload()`
 * dos VOs deste BC) contra fixtures dos 4 estados possíveis do agregado
 * `ExtracaoOrcamento` + 404. Não depende do controller real (T024) —
 * quando este existir, deve reusar exatamente estes schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

const itemExemplo = {
  descricao: {
    valor: { descricao: 'Caixa de papelão ondulado 40x30x20' },
    confianca: 96,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
  quantidade: { valor: 500, confianca: 94, extraido: true, agenteOrigem: 'EXTRATOR' },
  precoUnitario: {
    valor: { valorCentavos: 320, moeda: 'BRL' },
    confianca: 91,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
};

const condicoesExemplo = {
  condicoesPagamento: {
    valor: '30/60/90 dias',
    confianca: 88,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
  prazoValidade: {
    valor: '2026-08-30T00:00:00.000Z',
    confianca: 90,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
  condicoesEntrega: {
    valor: 'CIF, até 10 dias úteis',
    confianca: 85,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
};

describe('GET /v1/orcamentos/{orcamentoId}/extracao/status — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    const parsed = orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID });
    expect(parsed.orcamentoId).toBe(ORCAMENTO_ID);
  });

  it('rejeita orcamentoId que não é UUID', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('200 PENDENTE — sem itens nem condições ainda', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE',
      itens: [],
      condicoesComerciais: null,
      historico: [],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 EXTRAIDO — itens e condições comerciais completos', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'EXTRAIDO',
      itens: [itemExemplo],
      condicoesComerciais: condicoesExemplo,
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:06:00.000Z',
          resultado: 'EXTRAIDO',
          motivoInsucesso: null,
        },
      ],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 PENDENTE_REVISAO_HUMANA — campo obrigatório sem confiança preservado como não extraído (nunca inventa valor)', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE_REVISAO_HUMANA',
      itens: [
        {
          ...itemExemplo,
          precoUnitario: { valor: null, confianca: 20, extraido: false, agenteOrigem: 'EXTRATOR' },
        },
      ],
      condicoesComerciais: condicoesExemplo,
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:06:12.000Z',
          resultado: null,
          motivoInsucesso: '1+ campo obrigatório sem confiança suficiente',
        },
      ],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 EXTRAIDO_COM_PENDENCIA_CONFIRMADA — indisponibilidade confirmada pelo humano é decisão definitiva', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA',
      itens: [
        {
          ...itemExemplo,
          precoUnitario: { valor: null, confianca: 20, extraido: false, agenteOrigem: 'HUMANO' },
        },
      ],
      condicoesComerciais: condicoesExemplo,
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:06:12.000Z',
          resultado: null,
          motivoInsucesso: '1+ campo obrigatório sem confiança suficiente',
        },
        {
          agente: 'HUMANO',
          ocorreuEm: '2026-07-30T15:00:00.000Z',
          resultado: 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA',
          motivoInsucesso: null,
        },
      ],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('rejeita status fora do enum fechado do agregado', () => {
    expect(() =>
      statusExtracaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'APROVADO_AUTOMATICO',
        itens: [],
        condicoesComerciais: null,
        historico: [],
      }),
    ).toThrow();
  });

  it('404 Problem Details para orcamentoId inexistente', () => {
    const problem = {
      type: 'https://nexo.internal/problems/nao-encontrado',
      title: 'Extração não encontrada',
      status: 404,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
