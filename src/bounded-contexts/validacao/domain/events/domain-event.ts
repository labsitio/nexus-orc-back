/**
 * Contrato comum a todo Domain Event deste BC (plan.md, seção Domain Events).
 * `detailType` = nome do evento no EventBridge; `source` (fixo em Infra) = `nexo.validacao`.
 * Diferente de 001/002, os 3 eventos deste BC são todos contratos externos
 * estáveis — não há evento "interno" de baixa confiança, pois não existe
 * camada de IA revisora intermediária (ADR-001).
 *
 * **Amendment ADR-003 (spec 004, T006, retrofit)**: `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` sobem para `schemaVersion: 2` ao incorporar
 * `itens`/`condicoesComerciais` — payload enriquecido exigido pelo BC Busca
 * & Indexação (`OrcamentoValidadoEventACL`, T018) para montar
 * `ConteudoIndexavel`, sem introduzir uma segunda assinatura cross-BC a
 * eventos de Extração (ver `plan.md` da spec 004). `OrcamentoInconsistenciaDetectada`
 * permanece em `schemaVersion: 1` — não é consumido pela spec 004.
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 1 | 2;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  /**
   * Tenant dono do orçamento (spec-007, T041 — expand/contract).
   * Opcional e `schemaVersion` de cada evento mantido de propósito: os sites de
   * emissão deste BC ainda não preenchem este campo. Uma PR de contract
   * futura torna `tenantId` obrigatório (uniforme entre v1/v2, via ADR-008 —
   * cutover único, sem suporte dual publicado).
   */
  readonly tenantId?: string;
}
