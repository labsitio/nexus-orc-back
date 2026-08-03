import { z } from 'zod';
import { ESTADOS_INDEXACAO } from '../../domain/aggregates/indice-orcamento.aggregate.js';
import { RESULTADOS_TENTATIVA_INDEXACAO } from '../../domain/value-objects/tentativa-indexacao.vo.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/indexacao/status`
 * (T024/#184), derivado de `docs/openapi.yaml` -> `StatusIndexacaoResponse`.
 * Define apenas o contrato — controller real (T031, bloqueado por T028/T029/T030)
 * ainda não existe; quando existir, MUST reusar exatamente estes schemas.
 *
 * `orcamentoId` de outro tenant nunca aparece aqui: por ADR-005, a restrição
 * de tenant acontece antes do corpo ser montado (`TenantContextMiddleware` +
 * comparação `tenantId` do JWT x `tenantId` do agregado no controller/T031) —
 * resultado observável na borda é sempre 404 Problem Details, nunca um campo
 * de tenant na resposta 200.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

export const tentativaIndexacaoResponseSchema = z.object({
  resultado: z.enum(RESULTADOS_TENTATIVA_INDEXACAO),
  timestamp: z.string().datetime(),
  modeloEmbedding: z.string().nullable().optional(),
  motivoFalha: z.string().nullable().optional(),
});

export const statusIndexacaoResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  status: z.enum(ESTADOS_INDEXACAO),
  modeloEmbedding: z.string().nullable(),
  historico: z.array(tentativaIndexacaoResponseSchema),
});

export type StatusIndexacaoResponse = z.infer<typeof statusIndexacaoResponseSchema>;

export {
  problemDetailsSchema,
  type ProblemDetails,
} from '../../../../interface/shared/problem-details.schema.js';
