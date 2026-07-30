import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
  statusIngestaoResponseSchema,
} from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/status.schema.js';

/**
 * Contract test de `GET /v1/orcamentos/{orcamentoId}/status` (T044/#49).
 *
 * Valida o contrato de borda (Zod, espelhando `docs/openapi.yaml` ->
 * `StatusIngestaoResponse`/`ProblemDetails`) contra fixtures dos 3 estados
 * possíveis do agregado + 404. Não depende do controller real (T047/#52,
 * bloqueado por #16/#51) — quando este existir, deve reusar exatamente
 * estes schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

describe('GET /v1/orcamentos/{orcamentoId}/status — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    const parsed = orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID });
    expect(parsed.orcamentoId).toBe(ORCAMENTO_ID);
  });

  it('rejeita orcamentoId que não é UUID', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('200 RECEBIDO — sem resultado nem histórico ainda', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      canal: 'PORTAL_WEB',
      status: 'RECEBIDO',
      resultadoAtual: null,
      historico: [],
    };

    expect(statusIngestaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 CLASSIFICADO — resultado e histórico do Classificador presentes', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      canal: 'API_REST',
      status: 'CLASSIFICADO',
      resultadoAtual: {
        fornecedorIdentificado: 'Distribuidora ABC Ltda',
        formatoIdentificado: 'PDF_TABELA_PADRAO',
        nivelConfianca: 92,
        agenteOrigem: 'CLASSIFICADOR',
      },
      historico: [
        {
          agente: 'CLASSIFICADOR',
          ocorreuEm: '2026-07-30T14:06:00.000Z',
          resultado: {
            fornecedorIdentificado: 'Distribuidora ABC Ltda',
            formatoIdentificado: 'PDF_TABELA_PADRAO',
            nivelConfianca: 92,
            agenteOrigem: 'CLASSIFICADOR',
          },
          motivoInsucesso: null,
        },
      ],
    };

    expect(statusIngestaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 PENDENTE_REVISAO_HUMANA — tentativa do Classificador preservada como insucesso', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      canal: 'PORTAL_WEB',
      status: 'PENDENTE_REVISAO_HUMANA',
      resultadoAtual: null,
      historico: [
        {
          agente: 'CLASSIFICADOR',
          ocorreuEm: '2026-07-30T14:06:12.000Z',
          resultado: null,
          motivoInsucesso: 'confianca 62% abaixo do limiar de 80%',
        },
      ],
    };

    expect(statusIngestaoResponseSchema.parse(body)).toEqual(body);
  });

  it('rejeita status fora do enum fechado do agregado', () => {
    expect(() =>
      statusIngestaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        canal: 'PORTAL_WEB',
        status: 'APROVADO_AUTOMATICO',
        resultadoAtual: null,
        historico: [],
      }),
    ).toThrow();
  });

  it('404 Problem Details para orcamentoId inexistente', () => {
    const problem = {
      type: 'https://nexo.internal/problems/nao-encontrado',
      title: 'Orçamento não encontrado',
      status: 404,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
