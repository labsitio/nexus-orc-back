import { z, type ZodType } from 'zod';
import { STATUS_EXTRACAO } from '../../domain/extracao-orcamento.aggregate.js';
import { AGENTES_ORIGEM_CAMPO } from '../../domain/value-objects/campo-extraido.vo.js';

/**
 * Contrato de borda (Zod) de `GET /v1/orcamentos/{orcamentoId}/extracao/status`,
 * espelhando o shape real de `paraPayload()` dos VOs deste BC (não o exemplo
 * `montante`/`Dinheiro` de `docs/openapi.yaml` — provisório e divergente do
 * domínio já implementado, que usa `valorCentavos` inteiro). Consumido pelo
 * controller (T024) quando este existir — aqui define-se apenas o contrato,
 * sem depender de nenhuma implementação de caso de uso.
 */

export const orcamentoIdParamSchema = z.object({
  orcamentoId: z.string().uuid(),
});

/** `CampoExtraido<T>.paraPayload()` — genérico no tipo de `valor` (sempre nullable). */
function campoExtraidoSchema<T extends ZodType>(valorSchema: T) {
  return z.object({
    valor: valorSchema.nullable(),
    confianca: z.number().int().min(0).max(100),
    extraido: z.boolean(),
    agenteOrigem: z.enum(AGENTES_ORIGEM_CAMPO),
  });
}

const descricaoProdutoPayloadSchema = z.object({
  descricao: z.string(),
  sku: z.string().optional(),
});

const dinheiroPayloadSchema = z.object({
  valorCentavos: z.number().int().min(0),
  moeda: z.string(),
});

export const itemOrcamentoResponseSchema = z.object({
  descricao: campoExtraidoSchema(descricaoProdutoPayloadSchema),
  quantidade: campoExtraidoSchema(z.number()),
  precoUnitario: campoExtraidoSchema(dinheiroPayloadSchema),
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

// ponytail: ProblemDetails duplicado localmente (RFC 7807) — já duplicado
// também em `ingestao-identificacao/interface/http/status.schema.ts` (spec
// 001, mesmo comentário lá). Este é o 2º BC repetindo o contrato: promover
// para shared-kernel quando algum agente puder tocar os dois BCs na mesma
// mudança (fora do escopo desta trilha, que não pode editar
// `ingestao-identificacao/**`).
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
