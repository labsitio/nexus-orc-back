import { ErroDominio } from '../errors/erro-dominio.js';

export class ReferenciaS3InvalidaError extends ErroDominio {
  constructor(campo: string) {
    super(`ReferenciaS3 inválida: "${campo}" não pode ser vazio`);
  }
}

/**
 * Segmento final de `key` (após o último "/") falha um invariante estrutural
 * — ver `validarSegmentoFinalDaKey`.
 */
export class ReferenciaS3KeyInvalidaError extends ErroDominio {
  constructor(key: string, motivo: string) {
    super(`ReferenciaS3 inválida: key "${key}" ${motivo}`);
  }
}

export interface ReferenciaS3Params {
  readonly bucket: string;
  readonly key: string;
  readonly versionId: string;
}

const SEGMENTO_FINAL_TAMANHO_MAXIMO = 255;

/** Caractere de controle ASCII (0x00–0x1F) ou DEL (0x7F). */
const CARACTERE_DE_CONTROLE = new RegExp(`[\\u0000-\\u001f\\u007f]`);

/**
 * `key` chega ao Domain sem passar por validação em todo canal que não é
 * `POST /v1/orcamentos/upload-url` (SFTP via evento S3 direto, ADR-013
 * emendado — issue #730) — chega até aqui como entrada não confiável, e este
 * é o chokepoint por onde todo agregado passa (construção e reidratação de
 * banco), independente do canal. Mesmo critério de
 * `nomeArquivoSchema` (`interface/http/upload-url.schema.ts`, PR #727): `..`,
 * separador de path, caractere de controle, tamanho máximo. Duplicado aqui
 * (e não importado) porque Domain nunca depende de Interface — mesmo
 * critério, chokepoints diferentes: Zod filtra o canal HTTP na borda, esta
 * validação é o invariante estrutural que vale para todo canal.
 */
function validarSegmentoFinalDaKey(key: string): void {
  const segmentoFinal = key.slice(key.lastIndexOf('/') + 1);
  if (segmentoFinal.length > SEGMENTO_FINAL_TAMANHO_MAXIMO) {
    throw new ReferenciaS3KeyInvalidaError(
      key,
      `excede ${SEGMENTO_FINAL_TAMANHO_MAXIMO} caracteres no segmento final`,
    );
  }
  if (segmentoFinal.includes('..')) {
    throw new ReferenciaS3KeyInvalidaError(key, 'contém ".." no segmento final');
  }
  // `/` é inalcançável por construção (`segmentoFinal` começa depois do último
  // `/` da key) — mantido de propósito para que a regra continue correta se a
  // forma de extrair o segmento mudar. Hoje, só `\` dispara aqui.
  if (/[/\\]/.test(segmentoFinal)) {
    throw new ReferenciaS3KeyInvalidaError(
      key,
      'contém separador de path ("/" ou "\\") no segmento final',
    );
  }
  if (CARACTERE_DE_CONTROLE.test(segmentoFinal)) {
    throw new ReferenciaS3KeyInvalidaError(key, 'contém caractere de controle no segmento final');
  }
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
    if (!params.bucket.trim()) throw new ReferenciaS3InvalidaError('bucket');
    if (!params.key.trim()) throw new ReferenciaS3InvalidaError('key');
    if (!params.versionId.trim()) throw new ReferenciaS3InvalidaError('versionId');
    validarSegmentoFinalDaKey(params.key);
    return new ReferenciaS3(params.bucket, params.key, params.versionId);
  }

  equals(outro: ReferenciaS3): boolean {
    return (
      this.bucket === outro.bucket && this.key === outro.key && this.versionId === outro.versionId
    );
  }
}
