import { describe, expect, it, vi } from 'vitest';
import type { SftpTenantMappingRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/sftp-tenant-mapping.repository.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { S3SftpTenantResolverGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/s3-sftp-tenant-resolver.gateway.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

function s3ClientFake(tagSet?: Array<{ Key: string; Value: string }>) {
  return { send: vi.fn().mockResolvedValue({ TagSet: tagSet }) };
}

describe('S3SftpTenantResolverGateway', () => {
  const referencia = ReferenciaS3.de({ bucket: 'b', key: 'sftp-incoming/x.pdf', versionId: 'v-1' });

  it('resolve tenantId a partir das tags aws:transfer:server-id/aws:transfer:user-name + mapeamento', async () => {
    const s3 = s3ClientFake([
      { Key: 'aws:transfer:server-id', Value: 's-123' },
      { Key: 'aws:transfer:user-name', Value: 'fornecedor-x' },
    ]);
    const tenantId = TenantId.novo();
    const mapeamento: SftpTenantMappingRepository = {
      resolverTenantId: vi.fn().mockResolvedValue(tenantId),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new S3SftpTenantResolverGateway(s3 as any, mapeamento);

    const resolvido = await gateway.resolver(referencia);

    expect(mapeamento.resolverTenantId).toHaveBeenCalledWith('s-123', 'fornecedor-x');
    expect(resolvido?.toString()).toBe(tenantId.toString());
  });

  it('retorna undefined quando o objeto não tem as tags do AWS Transfer Family', async () => {
    const s3 = s3ClientFake([]);
    const mapeamento: SftpTenantMappingRepository = { resolverTenantId: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new S3SftpTenantResolverGateway(s3 as any, mapeamento);

    const resolvido = await gateway.resolver(referencia);

    expect(resolvido).toBeUndefined();
    expect(mapeamento.resolverTenantId).not.toHaveBeenCalled();
  });

  it('retorna undefined quando não há mapeamento para o par servidor/usuário', async () => {
    const s3 = s3ClientFake([
      { Key: 'aws:transfer:server-id', Value: 's-123' },
      { Key: 'aws:transfer:user-name', Value: 'fornecedor-desconhecido' },
    ]);
    const mapeamento: SftpTenantMappingRepository = {
      resolverTenantId: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new S3SftpTenantResolverGateway(s3 as any, mapeamento);

    const resolvido = await gateway.resolver(referencia);

    expect(resolvido).toBeUndefined();
  });
});
