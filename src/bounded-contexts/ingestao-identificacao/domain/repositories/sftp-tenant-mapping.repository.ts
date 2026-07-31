import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

/**
 * Contrato de resolução de tenant do canal SFTP (T006,
 * `specs/007-isolamento-multitenant-dados/plan.md`). O mapeamento
 * `servidorId`/`usuario` → `tenantId` é preenchido no onboarding
 * operacional do tenant (fora de escopo desta spec) — este contrato apenas
 * lê. `undefined` quando não há mapeamento (usuário/servidor desconhecido) —
 * quem chama decide o que fazer (rejeitar o arquivo, nunca assumir tenant).
 */
export interface SftpTenantMappingRepository {
  resolverTenantId(servidorId: string, usuario: string): Promise<TenantId | undefined>;
}
