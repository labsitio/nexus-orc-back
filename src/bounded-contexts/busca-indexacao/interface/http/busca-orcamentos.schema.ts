import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/busca` (T039/#199), derivado
 * de `docs/openapi.yaml` -> `BuscaRequest`/`BuscaResponse`, com uma correção
 * de fonte de verdade: `precoMinimo`/`precoMaximo` aqui são `{valorCentavos,
 * moeda}` (o VO `Dinheiro` real deste BC), não o `number` solto do exemplo do
 * openapi.yaml — mesmo drift documentado em
 * `validacao/interface/http/faixa-preco-categoria.schema.ts`.
 *
 * `origemValidacao` do exemplo do openapi.yaml não é incluído na resposta:
 * `ResultadoBusca` (domain VO) não carrega esse campo — resposta reflete
 * exatamente o que o caso de uso `BuscarOrcamentos` (T038) retorna, nunca um
 * campo inventado na borda.
 */

export const dinheiroSchema = z.object({
  valorCentavos: z.number().int().nonnegative(),
  moeda: z.string().min(1),
});

export const buscaOrcamentosRequestSchema = z
  .object({
    consulta: z.string().default(''),
    categoria: z.string().min(1).optional(),
    precoMinimo: dinheiroSchema.optional(),
    precoMaximo: dinheiroSchema.optional(),
    periodoInicio: z.string().date().optional(),
    periodoFim: z.string().date().optional(),
    pagina: z.number().int().min(1).default(1),
    tamanhoPagina: z.number().int().min(1).max(100).default(20),
  })
  .refine((dados) => Boolean(dados.periodoInicio) === Boolean(dados.periodoFim), {
    message: 'periodoInicio e periodoFim devem ser informados juntos',
    path: ['periodoFim'],
  });

export type BuscaOrcamentosRequest = z.infer<typeof buscaOrcamentosRequestSchema>;

export const resultadoBuscaResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  scoreRelevancia: z.number().min(0).max(1),
  trechoDestacado: z.string().optional(),
});

export const buscaOrcamentosResponseSchema = z.object({
  resultados: z.array(resultadoBuscaResponseSchema),
  pagina: z.number().int().min(1),
  tamanhoPagina: z.number().int().min(1),
  /**
   * Contagem de itens dentro da janela de sobre-busca já buscada (ver
   * `LIMITE_MAXIMO_SOBRE_BUSCA`/`registrarRotaBuscaOrcamentos`), **não** o
   * total real de matches no banco — quando a janela está cheia
   * (`temProximaPagina === true`), este número é um piso, não o total exato
   * (achado do `backend-reviewer`: nunca usar este campo para decidir "tem
   * próxima página?", usar `temProximaPagina`).
   */
  totalAproximado: z.number().int().min(0),
  temProximaPagina: z.boolean(),
});

export type BuscaOrcamentosResponse = z.infer<typeof buscaOrcamentosResponseSchema>;

export {
  problemDetailsSchema,
  type ProblemDetails,
} from '../../../../interface/shared/problem-details.schema.js';
