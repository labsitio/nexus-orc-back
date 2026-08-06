import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `GET /v1/auditoria/orcamentos/export` (T019/#282),
 * derivado de `specs/007-isolamento-multitenant-dados/plan.md` (seção "BC
 * Acompanhamento" e ADR-006 — JSON paginado cursor-based, nunca arquivo
 * pré-gerado). Define apenas o contrato — controller real (T029, bloqueado
 * por T022-T028) ainda não existe; quando existir, MUST reusar exatamente
 * estes schemas (mesmo padrão de T024 da spec 004,
 * `busca-indexacao/interface/http/indexacao-status.schema.ts`).
 *
 * `tenantId` nunca aparece nesta query: por ADR-004/T005, vem exclusivamente
 * do `TenantContextMiddleware` (claim JWT), nunca de query param — resultado
 * observável na borda para request sem JWT válido é 401 Problem Details,
 * cross-tenant é 404 (o controller real de T029 exerce esse comportamento
 * fim-a-fim; este arquivo fixa apenas o formato de request/response).
 */

export const exportacaoAuditoriaQuerySchema = z
  .object({
    periodoInicio: z.string().datetime().optional(),
    periodoFim: z.string().datetime().optional(),
    fornecedorId: z.string().uuid().optional(),
    status: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((dados) => Boolean(dados.periodoInicio) === Boolean(dados.periodoFim), {
    message: 'periodoInicio e periodoFim devem ser informados juntos',
    path: ['periodoFim'],
  });

export type ExportacaoAuditoriaQuery = z.infer<typeof exportacaoAuditoriaQuerySchema>;

export const trilhaAuditoriaEventoResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  tipoEvento: z.string().min(1),
  sourceBc: z.string().min(1),
  ocorreuEm: z.string().datetime(),
  agenteOrigem: z.string().nullable().optional(),
  resumoPayload: z.object({
    fornecedorIdentificado: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    decisao: z.string().nullable().optional(),
  }),
  schemaVersion: z.number().int().positive(),
});

export const exportacaoAuditoriaResponseSchema = z.object({
  eventos: z.array(trilhaAuditoriaEventoResponseSchema),
  proximoCursor: z.string().nullable(),
});

export type ExportacaoAuditoriaResponse = z.infer<typeof exportacaoAuditoriaResponseSchema>;

export {
  problemDetailsSchema,
  type ProblemDetails,
} from '../../../../interface/shared/problem-details.schema.js';
