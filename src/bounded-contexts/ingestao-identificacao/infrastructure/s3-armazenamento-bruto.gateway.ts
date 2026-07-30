import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { ArmazenamentoBrutoGateway } from '../domain/gateways/armazenamento-bruto.gateway.js';
import type { CanalValor } from '../domain/value-objects/canal.vo.js';
import type { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../domain/value-objects/referencia-s3.vo.js';

/** Prefixo de objeto por canal — `sftp-incoming/` é o mesmo usado pelo AWS Transfer Family (plan.md). */
const PREFIXO_POR_CANAL: Record<CanalValor, string> = {
  PORTAL_WEB: 'portal-web',
  API_REST: 'api-rest',
  SFTP: 'sftp-incoming',
  APP_MOBILE: 'app-mobile',
};

/** Prefixo de upload ainda não confirmado (T021/T024) — alvo da lifecycle rule de expiração de "órfão". */
const PREFIXO_UPLOAD_PENDENTE = 'pending-uploads';

/** TTL da URL presigned de upload — curto, o suficiente para o cliente concluir o PUT. */
const PRESIGNED_URL_TTL_SEGUNDOS = 15 * 60;

/** Chave determinística — `confirmar-upload` (T022/#27) recalcula a mesma chave para localizar o objeto. */
export function chaveUploadPendente(orcamentoId: OrcamentoId, nomeArquivo: string): string {
  return `${PREFIXO_UPLOAD_PENDENTE}/${orcamentoId.toString()}-${nomeArquivo}`;
}

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

  async gerarUrlUpload(orcamentoId: OrcamentoId, nomeArquivo: string): Promise<string> {
    const key = chaveUploadPendente(orcamentoId, nomeArquivo);
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGNED_URL_TTL_SEGUNDOS,
    });
  }

  async obterReferenciaAposUpload(
    orcamentoId: OrcamentoId,
    nomeArquivo: string,
  ): Promise<ReferenciaS3 | undefined> {
    const key = chaveUploadPendente(orcamentoId, nomeArquivo);
    try {
      const resultado = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!resultado.VersionId) {
        throw new Error(
          `HeadObject não retornou VersionId — bucket "${this.bucket}" precisa de versionamento habilitado`,
        );
      }
      return ReferenciaS3.de({ bucket: this.bucket, key, versionId: resultado.VersionId });
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'NotFound') {
        return undefined;
      }
      throw erro;
    }
  }
}
