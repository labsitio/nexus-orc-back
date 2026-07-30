import { ErroDominio } from "../errors/erro-dominio.js";

export class ReferenciaS3InvalidaError extends ErroDominio {
  constructor(campo: string) {
    super(`ReferenciaS3 inválida: "${campo}" não pode ser vazio`);
  }
}

export interface ReferenciaS3Params {
  readonly bucket: string;
  readonly key: string;
  readonly versionId: string;
}

/**
 * Ponteiro imutável para o dado bruto no S3 — sempre com `versionId`
 * (bucket versionado, Princípio III: dado bruto imutável).
 */
export class ReferenciaS3 {
  private constructor(
    readonly bucket: string,
    readonly key: string,
    readonly versionId: string,
  ) {}

  static de(params: ReferenciaS3Params): ReferenciaS3 {
    if (!params.bucket.trim()) throw new ReferenciaS3InvalidaError("bucket");
    if (!params.key.trim()) throw new ReferenciaS3InvalidaError("key");
    if (!params.versionId.trim())
      throw new ReferenciaS3InvalidaError("versionId");
    return new ReferenciaS3(params.bucket, params.key, params.versionId);
  }

  equals(outro: ReferenciaS3): boolean {
    return (
      this.bucket === outro.bucket &&
      this.key === outro.key &&
      this.versionId === outro.versionId
    );
  }
}
