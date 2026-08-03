import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST`/`GET /v1/configuracoes/faixas-preco-categoria`
 * (T038, US3, spec 003) — derivado de `docs/openapi.yaml` (`FaixaPrecoCategoria`)
 * e do VO real deste BC (`Dinheiro.paraPayload()`) — fonte de verdade é o domínio,
 * não o exemplo do openapi.yaml (que usa `montante` em vez de
 * `valorCentavos`/`moeda`, mesmo drift já registrado em `extracao/status.schema.ts`).
 *
 * CRUD simples de parâmetro operacional (nota de complexidade YAGNI do
 * `plan.md`, seção Interface) — sem agregado rico, transaction script direto
 * sobre `faixas_preco_categoria`. Consumido pelo controller (T044) quando
 * este existir — aqui define-se apenas o contrato.
 */

export const dinheiroSchema = z.object({
  valorCentavos: z.number().int().nonnegative(),
  moeda: z.string().min(1),
});

export const faixaPrecoCategoriaRequestSchema = z.object({
  categoria: z.string().min(1),
  precoMinimo: dinheiroSchema,
  precoMaximo: dinheiroSchema,
});

export type FaixaPrecoCategoriaRequest = z.infer<typeof faixaPrecoCategoriaRequestSchema>;

export const faixaPrecoCategoriaResponseSchema = faixaPrecoCategoriaRequestSchema;

export type FaixaPrecoCategoriaResponse = z.infer<typeof faixaPrecoCategoriaResponseSchema>;

export const listaFaixasPrecoCategoriaResponseSchema = z.array(faixaPrecoCategoriaResponseSchema);

// ponytail: ProblemDetails duplicado localmente (RFC 7807), mesma decisão já
// tomada em `status.schema.ts`/`decisao-humana.schema.ts` deste BC.
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
