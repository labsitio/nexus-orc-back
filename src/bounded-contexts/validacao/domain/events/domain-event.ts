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
 * eventos de Extração (ver `plan.md` da spec 004).
 *
 * **Amendment spec-007 (ADR-008 — cutover de contract, #632)**: a união
 * `1 | 2` fecha para `2` — `OrcamentoInconsistenciaDetectada` (que não
 * precisava do payload enriquecido de ADR-003) sobe junto por causa do
 * segundo bump fundido: `tenantId` obrigatório (ADR-008, decisão 2, "fundir").
 */
export interface DomainEventEnvelope {
  readonly detailType: string;
  readonly schemaVersion: 2;
  readonly orcamentoId: string;
  readonly ocorreuEm: string;
  /**
   * Tenant dono do orçamento (spec-007, ADR-008 — cutover de contract, #632).
   * Obrigatório desde `schemaVersion: 2`: cutover único, sem suporte dual
   * v1/v2 publicado (baseline de zero tenant real em produção e zero Lambda
   * implantada, #587/#297).
   */
  readonly tenantId: string;
}
