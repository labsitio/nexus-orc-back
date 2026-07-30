import type { ReferenciaS3 } from '../value-objects/referencia-s3.vo.js';

/**
 * Leitura read-only do arquivo bruto do orçamento (bucket `nexo-orcamentos-raw`,
 * propriedade da Ingestão) — implementado na Infrastructure (`S3LeituraBrutaGateway`).
 * Nenhuma implementação deste gateway pode escrever no bucket (Princípio III).
 */
export interface LeituraBrutaGateway {
  ler(referencia: ReferenciaS3): Promise<Buffer>;
}
