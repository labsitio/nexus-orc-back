import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { IndexarOrcamento } from '../bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.js';
import type { AgenteEmbeddingGateway } from '../bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import type { AgenteInterpretadorConsultaGateway } from '../bounded-contexts/busca-indexacao/domain/gateways/agente-interpretador-consulta.gateway.js';
import type { OrcamentoValidadoEventDetailType } from '../bounded-contexts/busca-indexacao/domain/gateways/orcamento-validado-event.acl.js';
import type { IndiceOrcamentoRepository } from '../bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { BedrockEmbeddingGateway } from '../bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.gateway.js';
import { BedrockInterpretadorConsultaGateway } from '../bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretador-consulta.gateway.js';
import { EventBridgePublisher } from '../bounded-contexts/busca-indexacao/infrastructure/eventbridge.publisher.js';
import { OllamaEmbeddingGateway } from '../bounded-contexts/busca-indexacao/infrastructure/ollama-embedding.gateway.js';
import { OllamaInterpretadorConsultaGateway } from '../bounded-contexts/busca-indexacao/infrastructure/ollama-interpretador-consulta.gateway.js';
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
  readonly embeddingGateway: AgenteEmbeddingGateway;
}

export interface BuscaIndexacao {
  readonly indexarOrcamento: IndexarOrcamento;
  /** Mesma ACL usada internamente por `indexarOrcamento` — exposta para o handler (T030) extrair `tenantId` cedo/correlação de log, sem duplicar instância. */
  readonly acl: OrcamentoValidadoEventACL;
}

/** Config de cada implementação de `AgenteEmbeddingGateway` — só a lida é obrigatória. */
export interface SelecaoAgenteEmbeddingConfig {
  readonly bedrock?: { readonly client: BedrockRuntimeClient; readonly modelId: string };
  readonly ollama?: { readonly baseUrl: string; readonly modelo: string };
}

/**
 * Lê `NEXO_AGENTE_IA` (ADR-009, issue #620) e constrói o `AgenteEmbeddingGateway`
 * correspondente — `local` → `OllamaEmbeddingGateway`, `bedrock` →
 * `BedrockEmbeddingGateway`. Mesmo contrato de `selecionarAgenteExtrator`
 * (issue #619): única leitura de env desta seleção, falha rápida no boot se
 * a variável estiver ausente/inválida ou se a config exigida pelo valor
 * escolhido não tiver sido fornecida.
 */
export function selecionarAgenteEmbedding(
  config: SelecaoAgenteEmbeddingConfig,
  agenteIa = process.env.NEXO_AGENTE_IA,
): AgenteEmbeddingGateway {
  if (agenteIa === 'bedrock') {
    if (!config.bedrock) {
      throw new Error('selecionarAgenteEmbedding: NEXO_AGENTE_IA=bedrock exige config.bedrock');
    }
    return new BedrockEmbeddingGateway(config.bedrock.client, config.bedrock.modelId);
  }
  if (agenteIa === 'local') {
    if (!config.ollama) {
      throw new Error('selecionarAgenteEmbedding: NEXO_AGENTE_IA=local exige config.ollama');
    }
    return new OllamaEmbeddingGateway(config.ollama.baseUrl, config.ollama.modelo);
  }
  throw new Error(
    `selecionarAgenteEmbedding: NEXO_AGENTE_IA deve ser "local" ou "bedrock" — recebido "${agenteIa ?? '(ausente)'}".`,
  );
}

/** Config de cada implementação de `AgenteInterpretadorConsultaGateway` — só a lida é obrigatória. */
export interface SelecaoAgenteInterpretadorConfig {
  readonly bedrock?: { readonly client: BedrockRuntimeClient; readonly modelId: string };
  readonly ollama?: { readonly baseUrl: string; readonly modelo: string };
}

/**
 * Lê `NEXO_AGENTE_IA` (ADR-009, issue #746) e constrói o
 * `AgenteInterpretadorConsultaGateway` correspondente — `local` →
 * `OllamaInterpretadorConsultaGateway`, `bedrock` →
 * `BedrockInterpretadorConsultaGateway`. Mesmo contrato de
 * `selecionarAgenteEmbedding`/`selecionarAgenteExtrator`: única leitura de env
 * desta seleção, falha rápida no boot se a variável estiver ausente/inválida
 * ou se a config exigida pelo valor escolhido não tiver sido fornecida.
 */
export function selecionarAgenteInterpretador(
  config: SelecaoAgenteInterpretadorConfig,
  agenteIa = process.env.NEXO_AGENTE_IA,
): AgenteInterpretadorConsultaGateway {
  if (agenteIa === 'bedrock') {
    if (!config.bedrock) {
      throw new Error('selecionarAgenteInterpretador: NEXO_AGENTE_IA=bedrock exige config.bedrock');
    }
    return new BedrockInterpretadorConsultaGateway(config.bedrock.client, config.bedrock.modelId);
  }
  if (agenteIa === 'local') {
    if (!config.ollama) {
      throw new Error('selecionarAgenteInterpretador: NEXO_AGENTE_IA=local exige config.ollama');
    }
    return new OllamaInterpretadorConsultaGateway(config.ollama.baseUrl, config.ollama.modelo);
  }
  throw new Error(
    `selecionarAgenteInterpretador: NEXO_AGENTE_IA deve ser "local" ou "bedrock" — recebido "${agenteIa ?? '(ausente)'}".`,
  );
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
    private readonly embeddingGatewayCompartilhado: AgenteEmbeddingGateway,
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
  const eventPublisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);

  return {
    indexarOrcamento: new IndexarOrcamentoPorMensagem(
      deps.db,
      acl,
      deps.embeddingGateway,
      eventPublisher,
    ),
    acl,
  };
}
