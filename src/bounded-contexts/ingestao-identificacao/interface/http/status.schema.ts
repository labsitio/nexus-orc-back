import { z } from 'zod';
import { CANAIS_VALIDOS } from '../../domain/value-objects/canal.vo.js';
import { AGENTES_ORIGEM } from '../../domain/value-objects/resultado-classificacao.vo.js';
import { STATUS_ORCAMENTO } from '../../domain/orcamento.aggregate.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/status`,
 * derivado de `docs/openapi.yaml` (`StatusIngestaoResponse`). Consumido pelo
 * controller (T047/#52) quando este existir — aqui define-se apenas o
 * contrato, sem depender de nenhuma implementação de caso de uso.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

export const resultadoClassificacaoResponseSchema = z
  .object({
    fornecedorIdentificado: z.string(),
    formatoIdentificado: z.string(),
    nivelConfianca: z.number().int().min(0).max(100),
    agenteOrigem: z.enum(AGENTES_ORIGEM),
  })
  .nullable();

export const tentativaClassificacaoResponseSchema = z.object({
  agente: z.enum(AGENTES_ORIGEM),
  ocorreuEm: z.string().datetime(),
  resultado: resultadoClassificacaoResponseSchema,
  motivoInsucesso: z.string().nullable(),
});

export const statusIngestaoResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  canal: z.enum(CANAIS_VALIDOS),
  status: z.enum(STATUS_ORCAMENTO),
  resultadoAtual: resultadoClassificacaoResponseSchema,
  historico: z.array(tentativaClassificacaoResponseSchema),
});

export type StatusIngestaoResponse = z.infer<typeof statusIngestaoResponseSchema>;

// Promovido para src/interface/shared/ (T005, #268) — segundo consumidor
// (TenantContextMiddleware) apareceu, conforme o ponytail original previa.
// Não vai para shared-kernel/: ADR-004 restringe o Shared Kernel exclusivamente
// a tenant-id.vo.ts.
export { problemDetailsSchema, type ProblemDetails } from '../../../../interface/shared/problem-details.schema.js';
