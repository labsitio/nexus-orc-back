import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
  statusValidacaoResponseSchema,
} from '../../../../src/bounded-contexts/validacao/interface/http/status.schema.js';

/**
 * Contract test de `GET /v1/orcamentos/{orcamentoId}/validacao/status` (T020/#130).
 *
 * Valida o contrato de borda (Zod, espelhando `docs/openapi.yaml` ->
 * `StatusValidacaoResponse`/`ProblemDetails`) contra fixtures dos 4 estados
 * possíveis do agregado `OrcamentoValidacao` + 404. Não depende do controller
 * real (T026, ainda não implementado) — quando este existir, deve reusar
 * exatamente estes schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

describe('GET /v1/orcamentos/{orcamentoId}/validacao/status — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    const parsed = orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID });
    expect(parsed.orcamentoId).toBe(ORCAMENTO_ID);
  });

  it('rejeita orcamentoId que não é UUID', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('200 PENDENTE — sem inconsistências ainda, histórico vazio', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE',
      inconsistencias: [],
      historico: [],
    };

    expect(statusValidacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 VALIDADO — todas as regras passaram na mesma tentativa', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'VALIDADO',
      inconsistencias: [],
      historico: [
        {
          resultado: 'VALIDADO',
          inconsistencias: [],
          timestamp: '2026-07-30T14:08:00.000Z',
        },
      ],
    };

    expect(statusValidacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 PENDENTE_REVISAO_HUMANA — inconsistência identifica a regra específica que falhou', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE_REVISAO_HUMANA',
      inconsistencias: [
        {
          regra: 'CNPJ_INVALIDO',
          detalhe: 'CNPJ do fornecedor com dígito verificador incorreto',
        },
        {
          regra: 'PRECO_FORA_DE_FAIXA',
          referenciaItem: 'itens[0]',
          detalhe: 'preço unitário fora da faixa esperada para a categoria "embalagem"',
        },
      ],
      historico: [
        {
          resultado: 'INCONSISTENTE',
          inconsistencias: [
            {
              regra: 'CNPJ_INVALIDO',
              detalhe: 'CNPJ do fornecedor com dígito verificador incorreto',
            },
            {
              regra: 'PRECO_FORA_DE_FAIXA',
              referenciaItem: 'itens[0]',
              detalhe: 'preço unitário fora da faixa esperada para a categoria "embalagem"',
            },
          ],
          timestamp: '2026-07-30T14:08:00.000Z',
        },
      ],
    };

    expect(statusValidacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 VALIDADO_COM_RESSALVA — decisão humana explícita registrada no histórico', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'VALIDADO_COM_RESSALVA',
      inconsistencias: [
        {
          regra: 'PRAZO_INCOERENTE',
          detalhe: 'prazo de validade anterior à data de emissão da proposta',
        },
      ],
      historico: [
        {
          resultado: 'INCONSISTENTE',
          inconsistencias: [
            {
              regra: 'PRAZO_INCOERENTE',
              detalhe: 'prazo de validade anterior à data de emissão da proposta',
            },
          ],
          timestamp: '2026-07-30T14:08:00.000Z',
        },
        {
          resultado: 'ACEITE_COM_RESSALVA',
          inconsistencias: [
            {
              regra: 'PRAZO_INCOERENTE',
              detalhe: 'prazo de validade anterior à data de emissão da proposta',
            },
          ],
          timestamp: '2026-07-30T15:00:00.000Z',
        },
      ],
    };

    expect(statusValidacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('rejeita status fora do enum fechado do agregado', () => {
    expect(() =>
      statusValidacaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'APROVADO_AUTOMATICO',
        inconsistencias: [],
        historico: [],
      }),
    ).toThrow();
  });

  it('rejeita regra de inconsistência fora do enum fechado', () => {
    expect(() =>
      statusValidacaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'PENDENTE_REVISAO_HUMANA',
        inconsistencias: [{ regra: 'CATEGORIA_DESCONHECIDA', detalhe: 'irrelevante' }],
        historico: [],
      }),
    ).toThrow();
  });

  it('rejeita resultado de tentativa fora do enum fechado (VALIDADO|INCONSISTENTE|ACEITE_COM_RESSALVA)', () => {
    expect(() =>
      statusValidacaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'PENDENTE',
        inconsistencias: [],
        historico: [
          {
            resultado: 'APROVADO_PARCIAL',
            inconsistencias: [],
            timestamp: '2026-07-30T14:08:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('404 Problem Details para orcamentoId inexistente', () => {
    const problem = {
      type: 'https://nexo.internal/problems/nao-encontrado',
      title: 'Validação não encontrada',
      status: 404,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
