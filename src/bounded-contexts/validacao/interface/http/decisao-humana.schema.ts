import { z } from 'zod';
import { problemDetailsSchema, statusValidacaoResponseSchema } from './status.schema.js';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana`,
 * derivado de `docs/openapi.yaml` (`DecisaoHumanaValidacaoRequest`). Consumido pelo
 * controller (T036) quando este existir — aqui define-se apenas o contrato,
 * sem depender do caso de uso `RegistrarDecisaoHumanaValidacao` (T035, ainda
 * não implementado). Mesma convenção de `status.schema.ts` (T020/T026).
 */

export const DECISOES_HUMANAS = ['CORRECAO_APLICADA', 'ACEITE_COM_RESSALVA'] as const;

export const decisaoHumanaValidacaoRequestSchema = z.object({
  decisao: z.enum(DECISOES_HUMANAS),
  justificativa: z.string(),
  // PROVISÓRIO no shape (openapi.yaml): obrigatório quando decisao === CORRECAO_APLICADA,
  // validação cruzada fica para o caso de uso (T035) — schema de borda só garante o shape.
  dadosCorrigidos: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type DecisaoHumanaValidacaoRequest = z.infer<typeof decisaoHumanaValidacaoRequestSchema>;

// Reexportados para o controller (T036) montar a resposta 200/409 sem precisar
// importar de dois módulos diferentes.
export { problemDetailsSchema, statusValidacaoResponseSchema };
