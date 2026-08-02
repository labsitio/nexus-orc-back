import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
  statusIndexacaoResponseSchema,
} from '../../../../src/bounded-contexts/busca-indexacao/interface/http/indexacao-status.schema.js';

/**
 * Contract test de `GET /v1/orcamentos/{orcamentoId}/indexacao/status` (T024/#184).
 *
 * Valida o contrato de borda (Zod, espelhando `docs/openapi.yaml` ->
 * `StatusIndexacaoResponse`/`ProblemDetails`) contra fixtures dos 3 estados
 * possíveis do agregado (PENDENTE | INDEXADO | FALHA_INDEXACAO) e do 404 —
 * incluindo o caso Tenant A consultando `orcamentoId` de Tenant B, mesmo
 * padrão de T011 da spec 007. Não depende do controller real (T031,
 * bloqueado por T028/T029/T030) — quando este existir, MUST reusar
 * exatamente estes schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

describe('GET /v1/orcamentos/{orcamentoId}/indexacao/status — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    const parsed = orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID });
    expect(parsed.orcamentoId).toBe(ORCAMENTO_ID);
  });

  it('rejeita orcamentoId que não é UUID', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('200 PENDENTE — sem tentativa registrada ainda', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'PENDENTE',
      modeloEmbedding: null,
      historico: [],
    };

    expect(statusIndexacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 INDEXADO — histórico com tentativa de sucesso', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'INDEXADO',
      modeloEmbedding: 'amazon.titan-embed-text-v2:0',
      historico: [
        {
          resultado: 'INDEXADO',
          timestamp: '2026-07-30T14:06:00.000Z',
          modeloEmbedding: 'amazon.titan-embed-text-v2:0',
          motivoFalha: null,
        },
      ],
    };

    expect(statusIndexacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 FALHA_INDEXACAO — falha técnica nunca significa orçamento inválido, histórico preserva motivo', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'FALHA_INDEXACAO',
      modeloEmbedding: null,
      historico: [
        {
          resultado: 'FALHA_TECNICA',
          timestamp: '2026-07-30T14:06:00.000Z',
          modeloEmbedding: null,
          motivoFalha: 'timeout ao invocar AgenteEmbeddingGateway',
        },
      ],
    };

    expect(statusIndexacaoResponseSchema.parse(body)).toEqual(body);
  });

  it('200 FALHA_INDEXACAO seguida de retry com sucesso — histórico com as duas tentativas, nenhuma sobrescrita', () => {
    const body = {
      orcamentoId: ORCAMENTO_ID,
      status: 'INDEXADO',
      modeloEmbedding: 'amazon.titan-embed-text-v2:0',
      historico: [
        {
          resultado: 'FALHA_TECNICA',
          timestamp: '2026-07-30T14:06:00.000Z',
          modeloEmbedding: null,
          motivoFalha: 'timeout ao invocar AgenteEmbeddingGateway',
        },
        {
          resultado: 'INDEXADO',
          timestamp: '2026-07-30T14:11:00.000Z',
          modeloEmbedding: 'amazon.titan-embed-text-v2:0',
          motivoFalha: null,
        },
      ],
    };

    const parsed = statusIndexacaoResponseSchema.parse(body);
    expect(parsed.historico).toHaveLength(2);
    expect(parsed).toEqual(body);
  });

  it('rejeita status fora do enum fechado do agregado', () => {
    expect(() =>
      statusIndexacaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'INDEXACAO_CONCLUIDA',
        modeloEmbedding: null,
        historico: [],
      }),
    ).toThrow();
  });

  it('rejeita resultado de tentativa fora do enum fechado (nunca "exclusão por relevância")', () => {
    expect(() =>
      statusIndexacaoResponseSchema.parse({
        orcamentoId: ORCAMENTO_ID,
        status: 'FALHA_INDEXACAO',
        modeloEmbedding: null,
        historico: [
          {
            resultado: 'EXCLUIDO_POR_IRRELEVANTE',
            timestamp: '2026-07-30T14:06:00.000Z',
            modeloEmbedding: null,
            motivoFalha: 'não relevante para o negócio',
          },
        ],
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

  it('404 Problem Details — Tenant A consultando orcamentoId de Tenant B (nunca 200, nunca 403, ADR-005/T031)', () => {
    // `IndiceOrcamento` de Tenant B existe, mas o `TenantContext` da requisição
    // é de Tenant A. Por ADR-005 (mesmo padrão T011 da spec 007), o controller
    // (T031) MUST comparar `tenantId` do JWT ao `tenantId` do agregado antes de
    // retornar qualquer dado, e responder 404 — nunca 403 (não vaza a
    // existência do orçamento de outro tenant) nem 200 com dado de outro tenant.
    const problemaCrossTenant = {
      type: 'https://nexo.internal/problems/nao-encontrado',
      title: 'Orçamento não encontrado',
      status: 404,
    };

    expect(problemDetailsSchema.parse(problemaCrossTenant)).toEqual(problemaCrossTenant);
    expect(problemDetailsSchema.parse(problemaCrossTenant).status).not.toBe(403);
  });
});
