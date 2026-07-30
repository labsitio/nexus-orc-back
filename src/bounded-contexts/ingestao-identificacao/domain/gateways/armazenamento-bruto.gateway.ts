import type { CanalValor } from '../value-objects/canal.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { ReferenciaS3 } from '../value-objects/referencia-s3.vo.js';

/** Contrato do dado bruto imutável — implementado em Infrastructure sobre S3 (Princípio III). */
export interface ArmazenamentoBrutoGateway {
  armazenar(canal: CanalValor, conteudo: Uint8Array, nomeArquivo: string): Promise<ReferenciaS3>;
  lerConteudoBruto(referencia: ReferenciaS3): Promise<Uint8Array>;
  /**
   * URL presigned de PUT direto ao S3 (ADR-002) — cliente sobe o arquivo sem
   * passar pelo Lambda. `orcamentoId` (já gerado por `POST /upload-url`,
   * T021/#26) determina a chave; `confirmar-upload` (T022/#27) localiza o
   * mesmo objeto depois via essa chave determinística.
   */
  gerarUrlUpload(orcamentoId: OrcamentoId, nomeArquivo: string): Promise<string>;
  /**
   * Referência do objeto já enviado via `gerarUrlUpload` (mesma chave
   * determinística) — `undefined` se o cliente nunca completou o PUT
   * (`confirmar-upload`, T022/#27, retorna 409 Problem Details nesse caso).
   */
  obterReferenciaAposUpload(
    orcamentoId: OrcamentoId,
    nomeArquivo: string,
  ): Promise<ReferenciaS3 | undefined>;
}
