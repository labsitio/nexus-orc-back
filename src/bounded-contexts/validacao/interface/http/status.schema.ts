import { z } from 'zod';
import { STATUS_VALIDACAO } from '../../domain/orcamento-validacao.aggregate.js';
import { RESULTADOS_TENTATIVA_VALIDACAO } from '../../domain/value-objects/tentativa-validacao.vo.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/validacao/status`,
 * derivado de `docs/openapi.yaml` (`StatusValidacaoResponse`) e dos `paraPayload()`
 * dos VOs reais deste BC (`InconsistenciaDetectada`) — fonte de verdade é o
 * domínio, mesma convenção já usada em `extracao/interface/http/status.schema.ts`.
 * Consumido pelo controller (T026) quando este existir — aqui define-se apenas
 * o contrato, sem depender de nenhuma implementação de caso de uso.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

// ponytail: RegraInconsistencia (domain/value-objects/inconsistencia-detectada.vo.ts)
// é um union type, não uma const array exportada — lista replicada aqui até o
// Domain expor uma const própria (mesmo racional do ADR já aplicado a STATUS_VALIDACAO).
export const REGRAS_INCONSISTENCIA = [
  'CNPJ_INVALIDO',
  'CNPJ_DIVERGENTE_CADASTRO',
  'CAMPO_OBRIGATORIO_AUSENTE',
  'PRECO_FORA_DE_FAIXA',
  'PRAZO_INCOERENTE',
] as const;

export const inconsistenciaDetectadaResponseSchema = z.object({
  regra: z.enum(REGRAS_INCONSISTENCIA),
  referenciaItem: z.string().optional(),
  detalhe: z.string(),
});

export const tentativaValidacaoResponseSchema = z.object({
  resultado: z.enum(RESULTADOS_TENTATIVA_VALIDACAO),
  inconsistencias: z.array(inconsistenciaDetectadaResponseSchema),
  timestamp: z.string().datetime(),
  justificativa: z.string().optional(),
});

export const statusValidacaoResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  status: z.enum(STATUS_VALIDACAO),
  inconsistencias: z.array(inconsistenciaDetectadaResponseSchema),
  historico: z.array(tentativaValidacaoResponseSchema),
});

export type StatusValidacaoResponse = z.infer<typeof statusValidacaoResponseSchema>;

// ponytail: ProblemDetails duplicado localmente (RFC 7807), mesma decisão já
// tomada em `ingestao-identificacao`/`extracao` — promoção para shared-kernel
// é decisão de arquitetura, fora do escopo desta task.
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
