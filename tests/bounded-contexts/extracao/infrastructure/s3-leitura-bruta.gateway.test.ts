import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { S3LeituraBrutaGateway } from '../../../../src/bounded-contexts/extracao/infrastructure/s3-leitura-bruta.gateway.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';

function s3ClientFake(send: (command: unknown) => unknown): S3Client {
  return { send } as unknown as S3Client;
}

describe('S3LeituraBrutaGateway', () => {
  it('ler busca pela versionId explícita da referência e devolve Buffer', async () => {
    const conteudo = new Uint8Array([9, 9, 9]);
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => conteudo },
    });
    const gateway = new S3LeituraBrutaGateway(s3ClientFake(send));

    const lido = await gateway.ler(
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'sftp-incoming/x.pdf',
        versionId: 'v-1',
      }),
    );

    expect(Buffer.isBuffer(lido)).toBe(true);
    expect(lido).toEqual(Buffer.from(conteudo));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ler lança erro se o S3 não devolver Body', async () => {
    const send = vi.fn().mockResolvedValue({});
    const gateway = new S3LeituraBrutaGateway(s3ClientFake(send));

    await expect(
      gateway.ler(
        ReferenciaS3.de({
          bucket: 'nexo-orcamentos-raw',
          key: 'sftp-incoming/x.pdf',
          versionId: 'v-1',
        }),
      ),
    ).rejects.toThrow(/Body/);
  });
});
