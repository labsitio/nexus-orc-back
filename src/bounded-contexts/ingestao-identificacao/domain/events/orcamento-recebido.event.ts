import type { CanalValor } from "../value-objects/canal.vo.js";
import type { DomainEventEnvelope } from "./domain-event.js";

export interface ReferenciaBrutaPayload {
  readonly bucket: string;
  readonly key: string;
  readonly versionId: string;
}

export interface OrcamentoRecebidoPayload extends DomainEventEnvelope {
  readonly canal: CanalValor;
  readonly referenciaBruta: ReferenciaBrutaPayload;
  readonly referenciaExterna?: string;
}

/** Publicado pelo caso de uso `ReceberOrcamento` — dispara o Classificador. */
export class OrcamentoRecebido implements OrcamentoRecebidoPayload {
  static readonly detailType = "OrcamentoRecebido" as const;
  readonly detailType = OrcamentoRecebido.detailType;
  readonly schemaVersion = 1 as const;
  readonly ocorreuEm: string;

  constructor(
    readonly orcamentoId: string,
    readonly canal: CanalValor,
    readonly referenciaBruta: ReferenciaBrutaPayload,
    readonly referenciaExterna?: string,
    readonly tenantId?: string,
    ocorreuEm: Date = new Date(),
  ) {
    this.ocorreuEm = ocorreuEm.toISOString();
  }
}
