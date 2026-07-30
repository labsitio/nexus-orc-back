import type { CanalValor } from "../value-objects/canal.vo.js";
import type { ReferenciaS3 } from "../value-objects/referencia-s3.vo.js";

/** Contrato do dado bruto imutável — implementado em Infrastructure sobre S3 (Princípio III). */
export interface ArmazenamentoBrutoGateway {
  armazenar(
    canal: CanalValor,
    conteudo: Uint8Array,
    nomeArquivo: string,
  ): Promise<ReferenciaS3>;
  lerConteudoBruto(referencia: ReferenciaS3): Promise<Uint8Array>;
}
