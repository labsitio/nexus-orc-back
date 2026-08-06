import { describe, expect, it } from 'vitest';
import {
  exportacaoAuditoriaQuerySchema,
  exportacaoAuditoriaResponseSchema,
  trilhaAuditoriaEventoResponseSchema,
} from '../../../../src/bounded-contexts/acompanhamento/interface/http/exportacao-auditoria.schema.js';

/**
 * Contract test de `GET /v1/auditoria/orcamentos/export` (T019/#282).
 *
 * Valida o contrato de borda (Zod, `exportacao-auditoria.schema.ts`) — query
 * de filtro/paginação e envelope de resposta. Não depende do controller real
 * (T029, bloqueado por T022-T028 desta fase) — mesmo padrão de T024 da spec
 * 004 (`indexacao-status.contract.test.ts`): quando o controller existir,
 * MUST reusar exatamente estes schemas.
 *
 * O comportamento fim-a-fim exigido pelo título desta task — 401 sem JWT
 * válido, nunca retornar evento de Tenant B para JWT de Tenant A — é
 * exercido pelo `TenantContextMiddleware` (spec 007, T005, já implementado e
 * testado em `tests/interface/shared/tenant-context.middleware.test.ts`) e
 * pelo controller real de T029, que ainda não existe (T022-T028 pendentes).
 * Este arquivo fixa o contrato de request/response que T029 MUST reusar; o
 * teste de integração 401/cross-tenant fim-a-fim contra o controller real
 * fica com T029 (mesma divisão de responsabilidade T024→T031 da spec 004).
 */

describe('GET /v1/auditoria/orcamentos/export — contrato', () => {
  it('aceita query vazia (todos os filtros opcionais, limit default 20)', () => {
    const parsed = exportacaoAuditoriaQuerySchema.parse({});
    expect(parsed).toMatchObject({ limit: 20 });
  });

  it('aceita periodoInicio e periodoFim informados juntos', () => {
    const parsed = exportacaoAuditoriaQuerySchema.parse({
      periodoInicio: '2026-01-01T00:00:00.000Z',
      periodoFim: '2026-01-31T23:59:59.000Z',
      fornecedorId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
      status: 'PENDENTE',
      cursor: 'opaco-abc123',
      limit: 50,
    });
    expect(parsed.periodoInicio).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejeita periodoInicio sem periodoFim (e vice-versa)', () => {
    expect(() =>
      exportacaoAuditoriaQuerySchema.parse({ periodoInicio: '2026-01-01T00:00:00.000Z' }),
    ).toThrow();
    expect(() =>
      exportacaoAuditoriaQuerySchema.parse({ periodoFim: '2026-01-31T23:59:59.000Z' }),
    ).toThrow();
  });

  it('rejeita limit fora do intervalo [1, 100]', () => {
    expect(() => exportacaoAuditoriaQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => exportacaoAuditoriaQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('rejeita fornecedorId que não é UUID', () => {
    expect(() => exportacaoAuditoriaQuerySchema.parse({ fornecedorId: 'nao-e-uuid' })).toThrow();
  });

  it('valida item de trilha de auditoria com resumoPayload sanitizado (nunca texto bruto do fornecedor)', () => {
    const item = {
      orcamentoId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
      tipoEvento: 'OrcamentoClassificado',
      sourceBc: 'ingestao-identificacao',
      ocorreuEm: '2026-01-05T10:00:00.000Z',
      agenteOrigem: 'AgenteClassificador',
      resumoPayload: {
        fornecedorIdentificado: 'Fornecedor XYZ',
        status: 'CLASSIFICADO',
        decisao: null,
      },
      schemaVersion: 2,
    };
    expect(trilhaAuditoriaEventoResponseSchema.parse(item)).toEqual(item);
  });

  it('valida envelope de resposta paginado (cursor-based) — eventos + proximoCursor nullable', () => {
    const semProximaPagina = {
      eventos: [] as unknown[],
      proximoCursor: null,
    };
    expect(exportacaoAuditoriaResponseSchema.parse(semProximaPagina)).toEqual(semProximaPagina);

    const comProximaPagina = {
      eventos: [
        {
          orcamentoId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
          tipoEvento: 'OrcamentoRecebido',
          sourceBc: 'ingestao-identificacao',
          ocorreuEm: '2026-01-05T09:00:00.000Z',
          agenteOrigem: null,
          resumoPayload: { fornecedorIdentificado: null, status: 'RECEBIDO', decisao: null },
          schemaVersion: 2,
        },
      ],
      proximoCursor: 'opaco-def456',
    };
    expect(exportacaoAuditoriaResponseSchema.parse(comProximaPagina)).toEqual(comProximaPagina);
  });

  it('nunca inclui tenantId no corpo da resposta — isolamento vem do TenantContextMiddleware, não de campo exposto', () => {
    const item = {
      orcamentoId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
      tipoEvento: 'OrcamentoValidado',
      sourceBc: 'validacao',
      ocorreuEm: '2026-01-06T11:00:00.000Z',
      resumoPayload: { status: 'VALIDADO' },
      schemaVersion: 2,
      tenantId: '018f2f6a-0000-7000-9000-000000000000',
    };
    const parsed = trilhaAuditoriaEventoResponseSchema.parse(item);
    expect(parsed).not.toHaveProperty('tenantId');
  });
});
