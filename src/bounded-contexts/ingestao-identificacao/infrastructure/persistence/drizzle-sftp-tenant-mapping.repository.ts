import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { SftpTenantMappingRepository } from '../../domain/repositories/sftp-tenant-mapping.repository.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { sftpTenantMapping } from './schema/sftp-tenant-mapping.schema.js';

/** Implementa `SftpTenantMappingRepository` (T006) sobre a tabela `sftp_tenant_mapping`. */
export class DrizzleSftpTenantMappingRepository implements SftpTenantMappingRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async resolverTenantId(servidorId: string, usuario: string): Promise<TenantId | undefined> {
    const [linha] = await this.db
      .select()
      .from(sftpTenantMapping)
      .where(
        and(eq(sftpTenantMapping.servidorId, servidorId), eq(sftpTenantMapping.usuario, usuario)),
      );
    return linha ? TenantId.de(linha.tenantId) : undefined;
  }
}
