import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `GET /v1/auditoria/orcamentos/export` (T019/#282),
 * derivado de `docs/openapi.yaml` (path `/auditoria/orcamentos/export`,
 * schemas `AuditoriaExportResponse`/`TrilhaAuditoriaEvento`) — mesma fonte de
 * verdade que o precedente `indexacao-status.schema.ts` (T024, spec 004)
 * usa. Define apenas o contrato — controller real (T029, bloqueado por
 * T022-T028) ainda não existe; quando existir, MUST reusar exatamente estes
 * schemas.
 *
 * Nomes de query param em snake_case (`periodo_inicio`/`periodo_fim`) e
 * `limit` (min 1, max 200, default 50) espelham exatamente o openapi —
 * divergem da convenção camelCase de outros schemas do repo
 * (`busca-orcamentos.schema.ts`) porque aquele é um `POST` com corpo JSON
 * (convenção interna), este é `GET` com query string já fixada no contrato
 * público (`docs/openapi.yaml`, parâmetros do path).
 *
 * `tenantId` aparece no item de resposta (`TrilhaAuditoriaEvento.tenantId`,
 * required no openapi) — é o próprio tenant do requisitante, nunca de outro
 * tenant (RLS + `TenantContextMiddleware` garantem isso antes da query
 * rodar), não um leak. Nunca aceito como query param de entrada: por
 * ADR-004/T005, `tenantId` vem exclusivamente do `TenantContextMiddleware`
 * (claim JWT) — request sem JWT válido é 401 Problem Details, cross-tenant é
 * 404 (o controller real de T029 exerce esse comportamento fim-a-fim; este
 * arquivo fixa apenas o formato de request/response).
 */

export const exportacaoAuditoriaQuerySchema = z
  .object({
    periodo_inicio: z.string().date().optional(),
    periodo_fim: z.string().date().optional(),
    fornecedorId: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((dados) => Boolean(dados.periodo_inicio) === Boolean(dados.periodo_fim), {
    message: 'periodo_inicio e periodo_fim devem ser informados juntos',
    path: ['periodo_fim'],
  });

export type ExportacaoAuditoriaQuery = z.infer<typeof exportacaoAuditoriaQuerySchema>;

export const trilhaAuditoriaEventoResponseSchema = z.object({
  tenantId: z.string().uuid(),
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
});

export const exportacaoAuditoriaResponseSchema = z.object({
  itens: z.array(trilhaAuditoriaEventoResponseSchema),
  proximoCursor: z.string().nullable(),
});

export type ExportacaoAuditoriaResponse = z.infer<typeof exportacaoAuditoriaResponseSchema>;

export {
  problemDetailsSchema,
  type ProblemDetails,
} from '../../../../interface/shared/problem-details.schema.js';
