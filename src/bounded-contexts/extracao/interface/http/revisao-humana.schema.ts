import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana`
 * (T037/#102), derivado de `docs/openapi.yaml` (`RevisaoHumanaExtracaoRequest` —
 * marcado lá como PROVISÓRIO, pois a spec 002 descreve o comportamento esperado,
 * não o schema exato de payload). Consumido pelo controller (T039) quando este
 * existir — aqui define-se apenas o contrato, sem depender de nenhum caso de uso.
 *
 * Regra de negócio (spec.md): cada campo confirmado recebe valor real OU marcação
 * explícita de indisponibilidade — nunca ambos ausentes (`valor: null` só é válido
 * quando `indisponivel: true`).
 */
const campoConfirmadoSchema = z
  .object({
    caminho: z.string().min(1),
    valor: z.unknown().nullable(),
    indisponivel: z.boolean(),
  })
  .refine((campo) => campo.indisponivel === true || campo.valor !== null, {
    message: 'campo confirmado exige valor real ou indisponivel: true — nunca ambos ausentes',
    path: ['valor'],
  });

export const revisaoHumanaExtracaoBodySchema = z.object({
  camposConfirmados: z.array(campoConfirmadoSchema).min(1),
});

export type RevisaoHumanaExtracaoBody = z.infer<typeof revisaoHumanaExtracaoBodySchema>;
