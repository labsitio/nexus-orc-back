import { z } from 'zod';

/**
 * Contrato RFC 7807 (Problem Details), compartilhado por todos os BCs na
 * camada Interface. Promovido de duplicação local (T005, #268) — não vai
 * para `shared-kernel/` porque ADR-004 (`specs/007-isolamento-multitenant-dados/plan.md`)
 * restringe o Shared Kernel exclusivamente a `tenant-id.vo.ts`. `src/interface/shared/`
 * é análogo (fora de `bounded-contexts/`, então nenhuma importação daqui viola
 * a regra de import direto entre Bounded Contexts), mas é escopo de Interface,
 * não de Domain.
 */
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
