import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/{orcamentoId}/revisao-humana`
 * (T051/#56) — body com fornecedor/formato confirmados pela pessoa que
 * revisou o orçamento escalonado (plan.md).
 */
export const revisaoHumanaBodySchema = z.object({
  fornecedorIdentificado: z.string().min(1),
  formatoIdentificado: z.string().min(1),
});

export type RevisaoHumanaBody = z.infer<typeof revisaoHumanaBodySchema>;
