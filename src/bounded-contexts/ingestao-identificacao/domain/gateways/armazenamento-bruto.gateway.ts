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
   * Confirma o objeto já enviado via `gerarUrlUpload` — copia de
   * `pending-uploads/` (retenção Object Lock curta, alvo da lifecycle rule
   * de expiração, T024/#29) para o prefixo definitivo do canal (mesma
   * retenção longa de `armazenar`); a chave temporária nunca vira a
   * referência persistida do agregado (achado BLOCKER do backend-reviewer:
   * sem essa cópia, o dado bruto confirmado seria apagado 1 dia depois pela
   * mesma lifecycle rule que existe para limpar upload nunca confirmado).
   * `undefined` se o cliente nunca completou o PUT (`confirmar-upload`,
   * T022/#27, retorna 409 Problem Details nesse caso).
   */
  confirmarUpload(
    canal: CanalValor,
    orcamentoId: OrcamentoId,
    nomeArquivo: string,
  ): Promise<ReferenciaS3 | undefined>;
}
