import { DecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import type { OrcamentoExtraidoEventACL } from '../../domain/gateways/orcamento-extraido-event.acl.js';
import type { CriarDecisaoWorkflowRepositorio } from '../../domain/repositories/decisao-workflow.repository.js';

/**
 * Consumidor dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (via SQS `contexto-extracao-queue`, plan.md) — traduz o payload bruto via
 * `OrcamentoExtraidoEventACL`, cria o agregado `DecisaoWorkflow` (se ainda
 * não existir) ou recupera o existente, aplica `registrarContextoExtracao` e
 * persiste.
 *
 * Mesmo padrão de `RegistrarContextoClassificacao` (T026): nunca decide,
 * nunca publica evento de negócio — consolidação/decisão só ocorrem em
 * `ConsolidarEDecidirWorkflow` (T028), disparado pelo último evento da
 * cadeia causal (`OrcamentoValidado`/`ComRessalva`). Reentrega do mesmo
 * evento (at-least-once) é idempotente por construção do agregado; payload
 * divergente do já registrado propaga `ContextoImutavelError` do Domain,
 * para a Interface decidir a política de fila/DLQ (plan.md).
 */
export class RegistrarContextoExtracao {
  constructor(
    private readonly acl: OrcamentoExtraidoEventACL,
    private readonly criarRepositorio: CriarDecisaoWorkflowRepositorio,
  ) {}

  async executar(payloadBruto: unknown): Promise<void> {
    const { orcamentoId, contextoExtracao, tenantId } = this.acl.traduzir(payloadBruto);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado pela ACL — nunca reaproveitado como campo fixo entre
    // chamadas (mesmo padrão de `RegistrarContextoClassificacao`).
    const repositorio = this.criarRepositorio(tenantId);

    const decisaoWorkflow =
      (await repositorio.buscarPorOrcamentoId(orcamentoId)) ??
      DecisaoWorkflow.criar(orcamentoId, tenantId);

    decisaoWorkflow.registrarContextoExtracao(contextoExtracao, tenantId);

    await repositorio.salvar(decisaoWorkflow);
  }
}
