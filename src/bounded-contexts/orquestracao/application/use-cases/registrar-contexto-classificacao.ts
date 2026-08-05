import { DecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import type { OrcamentoClassificadoEventACL } from '../../domain/gateways/orcamento-classificado-event.acl.js';
import type { CriarDecisaoWorkflowRepositorio } from '../../domain/repositories/decisao-workflow.repository.js';

/**
 * Consumidor do evento `OrcamentoClassificado` (via SQS `contexto-classificacao-queue`,
 * plan.md) — traduz o payload bruto via `OrcamentoClassificadoEventACL`, cria
 * o agregado `DecisaoWorkflow` (se ainda não existir) ou recupera o existente,
 * aplica `registrarContextoClassificacao` e persiste.
 *
 * Nunca decide, nunca publica evento de negócio: consolidação/decisão só
 * ocorrem em `ConsolidarEDecidirWorkflow` (T028), disparado pelo último
 * evento da cadeia causal (`OrcamentoValidado`/`ComRessalva`). Reentrega do
 * mesmo evento (at-least-once) é idempotente por construção do agregado
 * (`registrarContextoClassificacao` não duplica valor igual); payload
 * divergente do já registrado propaga `ContextoImutavelError` do Domain,
 * para a Interface decidir a política de fila/DLQ (plan.md).
 */
export class RegistrarContextoClassificacao {
  constructor(
    private readonly acl: OrcamentoClassificadoEventACL,
    private readonly criarRepositorio: CriarDecisaoWorkflowRepositorio,
  ) {}

  async executar(payloadBruto: unknown): Promise<void> {
    const { orcamentoId, contextoClassificacao, tenantId } = this.acl.traduzir(payloadBruto);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado pela ACL — nunca reaproveitado como campo fixo entre
    // chamadas (mesmo padrão de `CriarOrcamentoRepositorio`, spec 001).
    const repositorio = this.criarRepositorio(tenantId);

    const decisaoWorkflow =
      (await repositorio.buscarPorOrcamentoId(orcamentoId)) ??
      DecisaoWorkflow.criar(orcamentoId, tenantId);

    decisaoWorkflow.registrarContextoClassificacao(contextoClassificacao, tenantId);

    await repositorio.salvar(decisaoWorkflow);
  }
}
