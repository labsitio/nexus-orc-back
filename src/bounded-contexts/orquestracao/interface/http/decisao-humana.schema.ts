import { z } from 'zod';
import { ACOES_ROTEAMENTO } from '../../domain/value-objects/decisao-roteamento.vo.js';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana`
 * (T044/#250, `docs/openapi.yaml` — schema `DecisaoHumanaWorkflowRequest`, linhas
 * 1066-1075). Deliberadamente sem `requerIntegracaoExterna`: o contrato aprovado não
 * inclui o campo no corpo — ADR-003 (`plan.md`) reserva esse flag ao agente decisor
 * automático, nunca ao comprador.
 */
export const decisaoHumanaWorkflowRequestSchema = z
  .object({
    acao: z.enum(ACOES_ROTEAMENTO),
    justificativa: z.string().trim().min(1, 'justificativa é obrigatória'),
    motivoDadoAusente: z.string().trim().min(1).optional(),
  })
  .superRefine((valor, ctx) => {
    if (valor.acao === 'SOLICITAR_REENVIO' && !valor.motivoDadoAusente) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['motivoDadoAusente'],
        message: 'motivoDadoAusente é obrigatório quando acao === SOLICITAR_REENVIO',
      });
    }
  });

export type DecisaoHumanaWorkflowRequest = z.infer<typeof decisaoHumanaWorkflowRequestSchema>;
