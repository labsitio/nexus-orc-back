import { GetObjectTaggingCommand, type S3Client } from '@aws-sdk/client-s3';
import type { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import type { SftpTenantResolverGateway } from '../domain/gateways/sftp-tenant-resolver.gateway.js';
import type { SftpTenantMappingRepository } from '../domain/repositories/sftp-tenant-mapping.repository.js';
import type { ReferenciaS3 } from '../domain/value-objects/referencia-s3.vo.js';

/**
 * AWS Transfer Family tagueia automaticamente todo objeto S3 gravado via
 * SFTP com `aws:transfer:server-id`/`aws:transfer:user-name` (metadado do
 * objeto, nunca conteúdo do arquivo) — fonte legítima de usuário/servidor
 * para resolver `tenantId` via `sftp_tenant_mapping` (T006).
 */
const TAG_SERVIDOR_ID = 'aws:transfer:server-id';
const TAG_USUARIO = 'aws:transfer:user-name';

export class S3SftpTenantResolverGateway implements SftpTenantResolverGateway {
  constructor(
    private readonly s3: S3Client,
    private readonly mapeamento: SftpTenantMappingRepository,
  ) {}

  async resolver(referencia: ReferenciaS3): Promise<TenantId | undefined> {
    const resultado = await this.s3.send(
      new GetObjectTaggingCommand({
        Bucket: referencia.bucket,
        Key: referencia.key,
        VersionId: referencia.versionId,
      }),
    );
    const tags = new Map((resultado.TagSet ?? []).map((tag) => [tag.Key, tag.Value]));
    const servidorId = tags.get(TAG_SERVIDOR_ID);
    const usuario = tags.get(TAG_USUARIO);
    if (!servidorId || !usuario) {
      return undefined;
    }
    return this.mapeamento.resolverTenantId(servidorId, usuario);
  }
}
