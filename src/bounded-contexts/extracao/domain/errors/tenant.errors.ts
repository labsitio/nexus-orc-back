import { ErroDominio } from './erro-dominio.js';

/**
 * (spec 007, ADR-008 — cutover de contract, #632) Nunca deveria ocorrer:
 * todo `ExtracaoOrcamento.criar` neste BC recebe `tenantId` obrigatório
 * (extraído do envelope v2 de 001, ou do parâmetro do caso de uso). Fail-fast
 * contra reentrega de fila/confirmação humana sobre um agregado legado
 * (pré-retrofit) sem `tenantId` persistido — nunca publica evento com
 * `tenantId` inventado ou ausente.
 */
export class ExtracaoSemTenantIdError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(
      `ExtracaoOrcamento ${orcamentoId} não possui tenantId — registro pré-retrofit incompatível com o envelope de evento obrigatório (ADR-008)`,
    );
  }
}
