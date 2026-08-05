import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { IndexarOrcamento } from '../bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.js';
import type { OrcamentoValidadoEventDetailType } from '../bounded-contexts/busca-indexacao/domain/gateways/orcamento-validado-event.acl.js';
import type { IndiceOrcamentoRepository } from '../bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { BedrockEmbeddingGateway } from '../bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.gateway.js';
import { EventBridgePublisher } from '../bounded-contexts/busca-indexacao/infrastructure/eventbridge.publisher.js';
import { OrcamentoValidadoEventACL } from '../bounded-contexts/busca-indexacao/infrastructure/orcamento-validado-event.acl.js';
import { DrizzlePgvectorIndiceOrcamentoRepository } from '../bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';
import type { TenantId } from '../shared-kernel/tenant/tenant-id.vo.js';

/**
 * Composition root do BC Busca & Indexação (issue #623). Simétrico aos
 * demais (`extracao.ts`, `ingestao-identificacao.ts`): nenhum adaptador
 * concreto vaza para fora daqui.
 */
export interface BuscaIndexacaoDeps {
  readonly db: NodePgDatabase;
  readonly eventBridge: EventBridgeClient;
  readonly eventBusName: string;
  readonly bedrock: BedrockRuntimeClient;
  readonly modeloEmbeddingId: string;
}

export interface BuscaIndexacao {
  readonly indexarOrcamento: IndexarOrcamento;
  /** Mesma ACL usada internamente por `indexarOrcamento` — exposta para o handler (T030) extrair `tenantId` cedo/correlação de log, sem duplicar instância. */
  readonly acl: OrcamentoValidadoEventACL;
}

/**
 * Nunca invocado — `IndexarOrcamentoPorMensagem.executar` abaixo é
 * totalmente sobrescrito e nunca delega a `super.executar`, então o
 * construtor de `IndexarOrcamento` (T029) exige um `IndiceOrcamentoRepository`
 * apenas para satisfazer o tipo do parâmetro.
 */
const repositorioNuncaUsado: IndiceOrcamentoRepository = {
  upsert(): never {
    throw new Error(
      'repositorioNuncaUsado: nunca deveria ser chamado (ver IndexarOrcamentoPorMensagem)',
    );
  },
  buscarPorOrcamentoId(): never {
    throw new Error(
      'repositorioNuncaUsado: nunca deveria ser chamado (ver IndexarOrcamentoPorMensagem)',
    );
  },
  buscarPorCriterioEVetor(): never {
    throw new Error(
      'repositorioNuncaUsado: nunca deveria ser chamado (ver IndexarOrcamentoPorMensagem)',
    );
  },
};

/**
 * `IndiceOrcamentoRepository` (T016/ADR-005, spec 007) exige uma instância
 * por requisição/mensagem — `DrizzleTenantScopedRepositoryBase` nunca pode
 * ser reaproveitada entre tenants. `IndexarOrcamento.executar` (T029),
 * porém, recebe `tenantId` como parâmetro do método, e não do construtor —
 * o repositório é fixado uma única vez no construtor da classe.
 *
 * `indexador-queue` é uma fila única, não particionada por tenant: uma
 * mesma invocação (warm start) do handler Lambda (T030) processa mensagens
 * de qualquer tenant. Por isso esta subclasse ignora o repositório recebido
 * no construtor e, a cada chamada de `executar`, constrói um repositório
 * novo já escopado ao `tenantId` daquela mensagem — nunca reaproveitado —
 * delegando para uma instância real e efêmera de `IndexarOrcamento`. As
 * demais dependências (ACL, embedding gateway, publisher) são stateless e
 * seguras para reuso entre tenants/mensagens.
 */
class IndexarOrcamentoPorMensagem extends IndexarOrcamento {
  constructor(
    private readonly dbCompartilhado: NodePgDatabase,
    private readonly aclCompartilhada: OrcamentoValidadoEventACL,
    private readonly embeddingGatewayCompartilhado: BedrockEmbeddingGateway,
    private readonly eventPublisherCompartilhado: EventBridgePublisher,
  ) {
    super(
      aclCompartilhada,
      embeddingGatewayCompartilhado,
      repositorioNuncaUsado,
      eventPublisherCompartilhado,
    );
  }

  override async executar(
    tenantId: TenantId,
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): Promise<void> {
    const repositorio = new DrizzlePgvectorIndiceOrcamentoRepository(
      this.dbCompartilhado,
      criarTenantContext(tenantId),
    );
    return new IndexarOrcamento(
      this.aclCompartilhada,
      this.embeddingGatewayCompartilhado,
      repositorio,
      this.eventPublisherCompartilhado,
    ).executar(tenantId, detailType, payloadBruto);
  }
}

export function criarBuscaIndexacao(deps: BuscaIndexacaoDeps): BuscaIndexacao {
  const acl = new OrcamentoValidadoEventACL();
  const embeddingGateway = new BedrockEmbeddingGateway(deps.bedrock, deps.modeloEmbeddingId);
  const eventPublisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);

  return {
    indexarOrcamento: new IndexarOrcamentoPorMensagem(
      deps.db,
      acl,
      embeddingGateway,
      eventPublisher,
    ),
    acl,
  };
}
