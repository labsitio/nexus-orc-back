import { z } from 'zod';
import { problemDetailsSchema } from './status.schema.js';

export { problemDetailsSchema };
export type { ProblemDetails } from './status.schema.js';

/**
 * Contrato de borda (Zod) de `POST`/`GET /v1/configuracoes/faixas-preco-categoria`
 * (T038, US3, spec 003) — derivado de `docs/openapi.yaml` (`FaixaPrecoCategoria`)
 * e do VO real deste BC (`Dinheiro.paraPayload()`) — fonte de verdade é o domínio,
 * não o exemplo do openapi.yaml (que usa `montante` em vez de
 * `valorCentavos`/`moeda`, mesmo drift já registrado em `extracao/status.schema.ts`).
 *
 * CRUD simples de parâmetro operacional (nota de complexidade YAGNI do
 * `plan.md`, seção Interface) — sem agregado rico, transaction script direto
 * sobre `faixas_preco_categoria`. Consumido por
 * `faixa-preco-categoria.controller.ts` (T044).
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
