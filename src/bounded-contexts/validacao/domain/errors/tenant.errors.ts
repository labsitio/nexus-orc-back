import { ErroDominio } from './erro-dominio.js';

/**
 * (spec 007, ADR-008 — cutover de contract, #632) Nunca deveria ocorrer: o
 * `tenantId` do agregado `OrcamentoValidacao` é preenchido na criação
 * (`OrcamentoValidacao.criar`, sempre chamado com `tenantId` extraído de uma
 * ACL estrita que rejeita evento sem o campo). Fail-fast contra reentrega de
 * fila com um agregado legado (pré-retrofit) sem `tenantId` persistido —
 * nunca publica evento com `tenantId` inventado ou ausente.
 */
export class OrcamentoValidacaoSemTenantIdError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(
      `OrcamentoValidacao ${orcamentoId} não possui tenantId — registro pré-retrofit incompatível com o envelope de evento obrigatório (ADR-008)`,
    );
  }
}
