import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { LeituraBrutaGateway } from '../domain/gateways/leitura-bruta.gateway.js';
import type { ReferenciaS3 } from '../domain/value-objects/referencia-s3.vo.js';

/**
 * Implementa `LeituraBrutaGateway` sobre o bucket `nexo-orcamentos-raw`
 * (propriedade da Ingestão). Read-only por construção: nenhum método de
 * escrita é exposto — a permissão IAM anexada a este gateway deve conter
 * apenas `s3:GetObject` (Princípio III).
 */
export class S3LeituraBrutaGateway implements LeituraBrutaGateway {
  constructor(private readonly s3: S3Client) {}

  async ler(referencia: ReferenciaS3): Promise<Buffer> {
    const resultado = await this.s3.send(
      new GetObjectCommand({
        Bucket: referencia.bucket,
        Key: referencia.key,
        VersionId: referencia.versionId,
      }),
    );
    if (!resultado.Body) {
      throw new Error(
        `GetObject sem Body para s3://${referencia.bucket}/${referencia.key}?versionId=${referencia.versionId}`,
      );
    }
    const bytes = await resultado.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}
