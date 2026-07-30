import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { ArmazenamentoBrutoGateway } from '../domain/gateways/armazenamento-bruto.gateway.js';
import type { CanalValor } from '../domain/value-objects/canal.vo.js';
import { ReferenciaS3 } from '../domain/value-objects/referencia-s3.vo.js';

/** Prefixo de objeto por canal — `sftp-incoming/` é o mesmo usado pelo AWS Transfer Family (plan.md). */
const PREFIXO_POR_CANAL: Record<CanalValor, string> = {
  PORTAL_WEB: 'portal-web',
  API_REST: 'api-rest',
  SFTP: 'sftp-incoming',
  APP_MOBILE: 'app-mobile',
};

/**
 * Implementa `ArmazenamentoBrutoGateway` sobre o bucket versionado
 * `nexo-orcamentos-raw` (T012/#17). Princípio III: nunca sobrescreve —
 * cada `armazenar` grava um objeto novo (chave com UUID) em bucket
 * versionado, e `lerConteudoBruto` sempre lê a `versionId` explícita.
 */
export class S3ArmazenamentoBrutoGateway implements ArmazenamentoBrutoGateway {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async armazenar(
    canal: CanalValor,
    conteudo: Uint8Array,
    nomeArquivo: string,
  ): Promise<ReferenciaS3> {
    const key = `${PREFIXO_POR_CANAL[canal]}/${randomUUID()}-${nomeArquivo}`;
    const resultado = await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: conteudo,
      }),
    );
    if (!resultado.VersionId) {
      throw new Error(
        `PutObject não retornou VersionId — bucket "${this.bucket}" precisa de versionamento habilitado`,
      );
    }
    return ReferenciaS3.de({
      bucket: this.bucket,
      key,
      versionId: resultado.VersionId,
    });
  }

  async lerConteudoBruto(referencia: ReferenciaS3): Promise<Uint8Array> {
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
    return resultado.Body.transformToByteArray();
  }
}
