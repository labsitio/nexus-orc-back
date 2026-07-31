import { z } from 'zod';
import { STATUS_EXTRACAO } from '../../domain/extracao-orcamento.aggregate.js';
import { AGENTES_ORIGEM_CAMPO } from '../../domain/value-objects/campo-extraido.vo.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/extracao/status`,
 * derivado de `docs/openapi.yaml` (`StatusExtracaoResponse`) e dos `paraPayload()`
 * dos VOs reais deste BC (`ItemOrcamento`, `CondicoesComerciais`, `CampoExtraido<T>`)
 * — fonte de verdade é o domínio, não o exemplo do openapi.yaml (que usa `montante`
 * em vez de `valorCentavos`/`moeda`, drift a corrigir em T041). Consumido pelo
 * controller (T024) quando este existir — aqui define-se apenas o contrato, sem
 * depender de nenhuma implementação de caso de uso.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

function campoExtraidoSchema<T extends z.ZodTypeAny>(valorSchema: T) {
  return z.object({
    valor: valorSchema.nullable(),
    confianca: z.number().int().min(0).max(100),
    extraido: z.boolean(),
    agenteOrigem: z.enum(AGENTES_ORIGEM_CAMPO),
  });
}

const dinheiroResponseSchema = z.object({
  valorCentavos: z.number().int().min(0),
  moeda: z.string(),
});

const descricaoProdutoResponseSchema = z.object({
  descricao: z.string(),
  sku: z.string().optional(),
});

export const itemOrcamentoResponseSchema = z.object({
  descricao: campoExtraidoSchema(descricaoProdutoResponseSchema),
  quantidade: campoExtraidoSchema(z.number()),
  precoUnitario: campoExtraidoSchema(dinheiroResponseSchema),
});

export const condicoesComerciaisResponseSchema = z.object({
  condicoesPagamento: campoExtraidoSchema(z.string()),
  prazoValidade: campoExtraidoSchema(z.string().datetime()),
  condicoesEntrega: campoExtraidoSchema(z.string()),
});

export const tentativaExtracaoResponseSchema = z.object({
  agente: z.enum(AGENTES_ORIGEM_CAMPO),
  ocorreuEm: z.string().datetime(),
  resultado: z.string().nullable(),
  motivoInsucesso: z.string().nullable(),
});

export const statusExtracaoResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  status: z.enum(STATUS_EXTRACAO),
  itens: z.array(itemOrcamentoResponseSchema),
  condicoesComerciais: condicoesComerciaisResponseSchema.nullable(),
  historico: z.array(tentativaExtracaoResponseSchema),
});

export type StatusExtracaoResponse = z.infer<typeof statusExtracaoResponseSchema>;

// ponytail: ProblemDetails duplicado localmente (RFC 7807), mesma decisão já
// tomada em `ingestao-identificacao/interface/http/status.schema.ts` — 2º BC a
// precisar do contrato; promoção para shared-kernel é decisão de arquitetura
// (fora do escopo desta task, que fica restrita a `extracao/**`).
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
