import {
  CopyObjectCommand,
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

/**
 * Retenção Object Lock explícita (curta) do objeto em `pending-uploads/` —
 * o bucket `nexo-orcamentos-raw` tem retenção GOVERNANCE default de anos
 * (T012/#17); sem sobrescrever no PUT presigned, todo upload pendente
 * herdaria essa retenção longa e a lifecycle rule de expiração de "órfão"
 * (T024/#29) nunca conseguiria de fato apagar nada (S3 Lifecycle nunca
 * ignora Object Lock). Exportada para a lifecycle rule (CDK) rodar depois
 * que esta janela já tiver passado.
 */
export const RETENCAO_UPLOAD_PENDENTE_HORAS = 2;

/** Chave determinística — `confirmar-upload` (T022/#27) recalcula a mesma chave para localizar o objeto. */
export function chaveUploadPendente(orcamentoId: OrcamentoId, nomeArquivo: string): string {
  return `${PREFIXO_UPLOAD_PENDENTE}/${orcamentoId.toString()}-${nomeArquivo}`;
}

/** Chave final por canal, usada tanto por `armazenar` (canal síncrono) quanto pelo destino de `confirmarUpload`. */
function chaveFinalDoCanal(
  canal: CanalValor,
  orcamentoId: OrcamentoId,
  nomeArquivo: string,
): string {
  return `${PREFIXO_POR_CANAL[canal]}/${orcamentoId.toString()}-${nomeArquivo}`;
}

/** Cada segmento de path percent-encoded, `/` preservado como separador literal (formato exigido por `CopySource`). */
function codificarCopySource(bucket: string, key: string, versionId: string): string {
  const keyCodificada = key.split('/').map(encodeURIComponent).join('/');
  return `${encodeURIComponent(bucket)}/${keyCodificada}?versionId=${encodeURIComponent(versionId)}`;
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

  /**
   * BUG-001: o `S3Client` injetado MUST ser construído com
   * `requestChecksumCalculation: 'WHEN_REQUIRED'`. Sem essa configuração, o
   * default do SDK v3 (`WHEN_SUPPORTED`) assina o `PutObjectCommand` com o
   * checksum do corpo vazio que o SDK conhece no momento da assinatura —
   * quem envia os bytes reais é o cliente, numa requisição HTTP posterior.
   * O S3 recusa o `PUT` real com 400 por divergência de checksum. Ver
   * `docs/.../bugs/BUG-001.md`.
   */
  async gerarUrlUpload(orcamentoId: OrcamentoId, nomeArquivo: string): Promise<string> {
    const key = chaveUploadPendente(orcamentoId, nomeArquivo);
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ObjectLockMode: 'GOVERNANCE',
        ObjectLockRetainUntilDate: new Date(
          Date.now() + RETENCAO_UPLOAD_PENDENTE_HORAS * 60 * 60 * 1000,
        ),
      }),
      { expiresIn: PRESIGNED_URL_TTL_SEGUNDOS },
    );
  }

  async confirmarUpload(
    canal: CanalValor,
    orcamentoId: OrcamentoId,
    nomeArquivo: string,
  ): Promise<ReferenciaS3 | undefined> {
    const chavePendente = chaveUploadPendente(orcamentoId, nomeArquivo);
    let versionIdPendente: string;
    try {
      const resultado = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: chavePendente }),
      );
      if (!resultado.VersionId) {
        throw new Error(
          `HeadObject não retornou VersionId — bucket "${this.bucket}" precisa de versionamento habilitado`,
        );
      }
      versionIdPendente = resultado.VersionId;
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'NotFound') {
        return undefined;
      }
      throw erro;
    }

    // Copia para o prefixo definitivo do canal — nunca referenciar
    // diretamente `pending-uploads/`, alvo da lifecycle rule de expiração
    // (T024/#29): o dado bruto confirmado precisa sobreviver além da janela
    // curta de retenção do upload pendente (achado BLOCKER do backend-reviewer).
    const chaveFinal = chaveFinalDoCanal(canal, orcamentoId, nomeArquivo);
    const copia = await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: chaveFinal,
        CopySource: codificarCopySource(this.bucket, chavePendente, versionIdPendente),
      }),
    );
    if (!copia.VersionId) {
      throw new Error(
        `CopyObject não retornou VersionId — bucket "${this.bucket}" precisa de versionamento habilitado`,
      );
    }
    return ReferenciaS3.de({ bucket: this.bucket, key: chaveFinal, versionId: copia.VersionId });
  }
}
