import { describe, expect, it } from 'vitest';
import {
  exportacaoAuditoriaQuerySchema,
  exportacaoAuditoriaResponseSchema,
  problemDetailsSchema,
  trilhaAuditoriaEventoResponseSchema,
} from '../../../../src/bounded-contexts/acompanhamento/interface/http/exportacao-auditoria.schema.js';

/**
 * Contract test de `GET /v1/auditoria/orcamentos/export` (T019/#282).
 *
 * Valida o contrato de borda (Zod, `exportacao-auditoria.schema.ts`,
 * derivado de `docs/openapi.yaml`) — query de filtro/paginação e envelope de
 * resposta. Não depende do controller real (T029, bloqueado por T022-T028
 * desta fase) — mesmo padrão de T024 da spec 004
 * (`indexacao-status.contract.test.ts`): quando o controller existir, MUST
 * reusar exatamente estes schemas.
 *
 * O comportamento fim-a-fim exigido pelo título desta task — 401 sem JWT
 * válido, nunca retornar evento de Tenant B para JWT de Tenant A — é
 * exercido pelo `TenantContextMiddleware` (spec 007, T005, já implementado e
 * testado em `tests/interface/shared/tenant-context.middleware.test.ts`) e
 * pelo controller real de T029, que ainda não existe (T022-T028 pendentes).
 * Os testes de `problemDetailsSchema` abaixo fixam o formato dos dois casos
 * (401/404) que T029 MUST retornar; o teste de integração real (request
 * HTTP sem JWT, request cross-tenant) fica com T029, mesma divisão de
 * responsabilidade T024→T031 da spec 004.
 */

describe('GET /v1/auditoria/orcamentos/export — contrato', () => {
  it('aceita query vazia (todos os filtros opcionais, limit default 50)', () => {
    const parsed = exportacaoAuditoriaQuerySchema.parse({});
    expect(parsed).toMatchObject({ limit: 50 });
  });

  it('aceita periodo_inicio e periodo_fim informados juntos', () => {
    const parsed = exportacaoAuditoriaQuerySchema.parse({
      periodo_inicio: '2026-01-01',
      periodo_fim: '2026-01-31',
      fornecedorId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
      status: 'PENDENTE',
      cursor: 'opaco-abc123',
      limit: 120,
    });
    expect(parsed.periodo_inicio).toBe('2026-01-01');
  });

  it('rejeita periodo_inicio sem periodo_fim (e vice-versa)', () => {
    expect(() => exportacaoAuditoriaQuerySchema.parse({ periodo_inicio: '2026-01-01' })).toThrow();
    expect(() => exportacaoAuditoriaQuerySchema.parse({ periodo_fim: '2026-01-31' })).toThrow();
  });

  it('rejeita limit fora do intervalo [1, 200] (openapi: minimum 1, maximum 200)', () => {
    expect(() => exportacaoAuditoriaQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => exportacaoAuditoriaQuerySchema.parse({ limit: 201 })).toThrow();
  });

  it('rejeita periodo_inicio/periodo_fim que não é data ISO (openapi: format date)', () => {
    expect(() =>
      exportacaoAuditoriaQuerySchema.parse({
        periodo_inicio: '2026-01-01T00:00:00.000Z',
        periodo_fim: '2026-01-31',
      }),
    ).toThrow();
  });

  it('valida item de trilha de auditoria com resumoPayload sanitizado (nunca texto bruto do fornecedor)', () => {
    const item = {
      tenantId: '0189abcd-1111-7000-8000-000000000001',
      orcamentoId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
      tipoEvento: 'OrcamentoClassificado',
      sourceBc: 'nexo.ingestao-identificacao',
      ocorreuEm: '2026-01-05T10:00:00.000Z',
      agenteOrigem: 'AgenteClassificador',
      resumoPayload: {
        fornecedorIdentificado: 'Fornecedor XYZ',
        status: 'CLASSIFICADO',
        decisao: null,
      },
    };
    expect(trilhaAuditoriaEventoResponseSchema.parse(item)).toEqual(item);
  });

  it('valida envelope de resposta paginado (cursor-based) — itens + proximoCursor nullable (openapi: AuditoriaExportResponse)', () => {
    const semProximaPagina = {
      itens: [] as unknown[],
      proximoCursor: null,
    };
    expect(exportacaoAuditoriaResponseSchema.parse(semProximaPagina)).toEqual(semProximaPagina);

    const comProximaPagina = {
      itens: [
        {
          tenantId: '0189abcd-1111-7000-8000-000000000001',
          orcamentoId: '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f',
          tipoEvento: 'OrcamentoRecebido',
          sourceBc: 'nexo.ingestao-identificacao',
          ocorreuEm: '2026-01-05T09:00:00.000Z',
          agenteOrigem: null,
          resumoPayload: { fornecedorIdentificado: null, status: 'RECEBIDO', decisao: null },
        },
      ],
      proximoCursor: 'opaco-def456',
    };
    expect(exportacaoAuditoriaResponseSchema.parse(comProximaPagina)).toEqual(comProximaPagina);
  });

  it('401 Problem Details — sem JWT válido (T029 MUST responder este formato antes de alcançar o controller)', () => {
    const problema = {
      title: 'Não autorizado',
      status: 401,
      detail: 'Claim de tenant ausente ou inválida no JWT',
    };
    expect(problemDetailsSchema.parse(problema)).toEqual(problema);
  });

  it('404 Problem Details — nunca revela evento de Tenant B para JWT de Tenant A (nunca 200, nunca 403)', () => {
    const problemaCrossTenant = {
      title: 'Recurso não encontrado',
      status: 404,
      detail: 'Nenhum evento de auditoria encontrado para os filtros informados',
    };
    expect(problemDetailsSchema.parse(problemaCrossTenant)).toEqual(problemaCrossTenant);
    expect(problemDetailsSchema.parse(problemaCrossTenant).status).not.toBe(403);
  });
});
