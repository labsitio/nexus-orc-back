import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
  statusExtracaoResponseSchema,
} from '../../../../src/bounded-contexts/extracao/interface/http/status.schema.js';

/**
 * Contract test de `GET /v1/orcamentos/{orcamentoId}/extracao/status` (T019/#84).
 *
 * Valida o contrato de borda (Zod, espelhando `docs/openapi.yaml` ->
 * `StatusExtracaoResponse`/`ProblemDetails`) contra fixtures dos 4 estados
 * possíveis do agregado `ExtracaoOrcamento` + 404. Não depende do controller
 * real (T024, ainda não implementado) — quando este existir, deve reusar
 * exatamente estes schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

const CAMPO_NAO_EXTRAIDO = {
  valor: null,
  confianca: 0,
  extraido: false,
  agenteOrigem: 'EXTRATOR',
};

describe('GET /v1/orcamentos/{orcamentoId}/extracao/status — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    const parsed = orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID });
    expect(parsed.orcamentoId).toBe(ORCAMENTO_ID);
  });

  it('rejeita orcamentoId que não é UUID', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('200 PENDENTE — sem itens/condições ainda, histórico vazio', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE',
      itens: [],
      condicoesComerciais: null,
      historico: [],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 EXTRAIDO — itens e condições comerciais completos, todo campo com valor real', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'EXTRAIDO',
      itens: [
        {
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
        },
      ],
      condicoesComerciais: {
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
      },
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:08:00.000Z',
          resultado: 'EXTRAIDO',
          motivoInsucesso: null,
        },
      ],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 PENDENTE_REVISAO_HUMANA — campo obrigatório sem confiança nunca tem valor inventado', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE_REVISAO_HUMANA',
      itens: [
        {
          descricao: {
            valor: { descricao: 'Caixa de papelão ondulado 40x30x20' },
            confianca: 96,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
          quantidade: CAMPO_NAO_EXTRAIDO,
          precoUnitario: CAMPO_NAO_EXTRAIDO,
        },
      ],
      condicoesComerciais: {
        condicoesPagamento: CAMPO_NAO_EXTRAIDO,
        prazoValidade: CAMPO_NAO_EXTRAIDO,
        condicoesEntrega: CAMPO_NAO_EXTRAIDO,
      },
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:08:00.000Z',
          resultado: null,
          motivoInsucesso: '1+ campo obrigatório sem confiança suficiente',
        },
      ],
    };

    expect(statusExtracaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 EXTRAIDO_COM_PENDENCIA_CONFIRMADA — confirmação humana registrada no histórico', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA',
      itens: [
        {
          descricao: {
            valor: { descricao: 'Caixa de papelão ondulado 40x30x20' },
            confianca: 96,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
          quantidade: { valor: 500, confianca: 94, extraido: true, agenteOrigem: 'EXTRATOR' },
          precoUnitario: {
            valor: null,
            confianca: 0,
            extraido: false,
            agenteOrigem: 'HUMANO',
          },
        },
      ],
      condicoesComerciais: {
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
      },
      historico: [
        {
          agente: 'EXTRATOR',
          ocorreuEm: '2026-07-30T14:08:00.000Z',
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

  it('rejeita agenteOrigem fora do enum fechado (EXTRATOR|HUMANO)', () => {
    expect(() =>
      statusExtracaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'PENDENTE',
        itens: [],
        condicoesComerciais: null,
        historico: [
          {
            agente: 'CLASSIFICADOR',
            ocorreuEm: '2026-07-30T14:08:00.000Z',
            resultado: null,
            motivoInsucesso: 'irrelevante',
          },
        ],
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
