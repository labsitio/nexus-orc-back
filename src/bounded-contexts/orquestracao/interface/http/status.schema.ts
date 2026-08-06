import { z } from 'zod';
import { STATUS_DECISAO_WORKFLOW } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import {
  ACOES_ROTEAMENTO,
  AGENTES_ORIGEM_DECISAO,
} from '../../domain/value-objects/decisao-roteamento.vo.js';
import { RESULTADOS_VALIDACAO } from '../../domain/value-objects/contexto-validacao.vo.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/workflow/status`
 * (T030/#236, plan.md linhas 139/158) — fonte de verdade é o domínio deste
 * BC (`DecisaoWorkflow`, `DecisaoRoteamento`, `ContextoValidacao`), mesma
 * convenção já usada em `validacao/interface/http/status.schema.ts`.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

export const contextoClassificacaoResponseSchema = z.object({
  fornecedorIdentificado: z.string(),
  formatoIdentificado: z.string(),
});

export const contextoExtracaoResponseSchema = z.object({
  itensResumo: z.string(),
  condicoesComerciaisResumo: z.string(),
  houvePendenciaConfirmada: z.boolean(),
});

export const inconsistenciaAceitaResponseSchema = z.object({
  regra: z.string(),
  detalhe: z.string(),
});

export const contextoValidacaoResponseSchema = z.object({
  resultado: z.enum(RESULTADOS_VALIDACAO),
  inconsistenciasAceitas: z.array(inconsistenciaAceitaResponseSchema),
});

export const decisaoRoteamentoResponseSchema = z.object({
  acao: z.enum(ACOES_ROTEAMENTO),
  nivelConfianca: z.number().int().min(0).max(100).nullable(),
  criterio: z.string(),
  agenteOrigem: z.enum(AGENTES_ORIGEM_DECISAO),
  requerIntegracaoExterna: z.boolean(),
  motivoDadoAusente: z.string().optional(),
});

export const tentativaDecisaoWorkflowResponseSchema = z.object({
  agente: z.enum(AGENTES_ORIGEM_DECISAO),
  timestamp: z.string().datetime(),
  resultado: decisaoRoteamentoResponseSchema.optional(),
  motivoInsucesso: z.string().optional(),
});

export const statusDecisaoWorkflowResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  status: z.enum(STATUS_DECISAO_WORKFLOW),
  contextoClassificacao: contextoClassificacaoResponseSchema.optional(),
  contextoExtracao: contextoExtracaoResponseSchema.optional(),
  contextoValidacao: contextoValidacaoResponseSchema.optional(),
  decisaoAtual: decisaoRoteamentoResponseSchema.optional(),
  historico: z.array(tentativaDecisaoWorkflowResponseSchema),
});

export type StatusDecisaoWorkflowResponse = z.infer<typeof statusDecisaoWorkflowResponseSchema>;

// ponytail: ProblemDetails duplicado localmente (RFC 7807), mesma decisão já
// tomada nos demais BCs (`validacao`, `extracao`, `ingestao-identificacao`) —
// promoção para shared-kernel é decisão de arquitetura, fora do escopo desta task.
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
