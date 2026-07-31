import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { ReferenciaS3 } from '../value-objects/referencia-s3.vo.js';

/**
 * Resolve `tenantId` do canal SFTP a partir do mapeamento usuário/servidor
 * (T006, `specs/007-isolamento-multitenant-dados/plan.md`) — nunca do
 * conteúdo do arquivo. `undefined` quando o objeto não tem tags de
 * usuário/servidor AWS Transfer Family, ou o par não está em
 * `sftp_tenant_mapping` (onboarding pendente/usuário desconhecido).
 */
export interface SftpTenantResolverGateway {
  resolver(referencia: ReferenciaS3): Promise<TenantId | undefined>;
}
