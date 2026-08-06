import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ConsolidarEDecidirWorkflow } from '../bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';
import { RegistrarContextoClassificacao } from '../bounded-contexts/orquestracao/application/use-cases/registrar-contexto-classificacao.js';
import { RegistrarContextoExtracao } from '../bounded-contexts/orquestracao/application/use-cases/registrar-contexto-extracao.js';
import type { AgenteOrquestradorGateway } from '../bounded-contexts/orquestracao/domain/gateways/agente-orquestrador.gateway.js';
import type { CriarDecisaoWorkflowRepositorio } from '../bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { BedrockOrquestradorGateway } from '../bounded-contexts/orquestracao/infrastructure/bedrock-orquestrador.gateway.js';
import { EventBridgePublisher } from '../bounded-contexts/orquestracao/infrastructure/eventbridge.publisher.js';
import { OllamaOrquestradorGateway } from '../bounded-contexts/orquestracao/infrastructure/ollama-orquestrador.gateway.js';
import { OrcamentoClassificadoEventACL } from '../bounded-contexts/orquestracao/infrastructure/orcamento-classificado-event.acl.js';
import { OrcamentoExtraidoEventACL } from '../bounded-contexts/orquestracao/infrastructure/orcamento-extraido-event.acl.js';
import { OrcamentoValidadoEventACL } from '../bounded-contexts/orquestracao/infrastructure/orcamento-validado-event.acl.js';
import { DrizzleDecisaoWorkflowRepository } from '../bounded-contexts/orquestracao/infrastructure/persistence/drizzle-decisao-workflow.repository.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';

/**
 * Composition root do BC Orquestração (issue #624), compartilhado pelas 3
 * Lambdas de produção deste contexto (`contexto-classificacao-queue`,
 * `contexto-extracao-queue`, `decisao-workflow-queue`). Simétrico a
 * `busca-indexacao.ts` (#623): nenhum adaptador concreto vaza para fora
 * daqui.
 *
 * Diferente de `busca-indexacao.ts`, os 3 casos de uso deste BC (T026/T027/
 * T028) já recebem `CriarDecisaoWorkflowRepositorio` — uma fábrica
 * `(tenantId) => repositorio` — diretamente no construtor (issue #656), não
 * um repositório fixo. Nenhum wrapper por mensagem é necessário aqui: basta
 * fechar a fábrica sobre o `db` compartilhado.
 *
 * 3 factories, não uma única `criarOrquestracao`: `RegistrarContexto*` nunca
 * decide nem publica, então nunca precisa de `bedrock`/`eventBridge` —
 * exigir esses clientes para compor um Lambda que nunca os usa violaria
 * least privilege (a role IAM de cada Lambda espelha exatamente o que sua
 * factory recebe aqui).
 */
function criarRepositorioFactory(db: NodePgDatabase): CriarDecisaoWorkflowRepositorio {
  return (tenantId) => new DrizzleDecisaoWorkflowRepository(db, criarTenantContext(tenantId));
}

export interface RegistrarContextoDeps {
  readonly db: NodePgDatabase;
}

export interface RegistrarContextoClassificacaoModulo {
  readonly registrarContextoClassificacao: RegistrarContextoClassificacao;
  readonly acl: OrcamentoClassificadoEventACL;
}

export function criarRegistrarContextoClassificacao(
  deps: RegistrarContextoDeps,
): RegistrarContextoClassificacaoModulo {
  const acl = new OrcamentoClassificadoEventACL();
  return {
    registrarContextoClassificacao: new RegistrarContextoClassificacao(
      acl,
      criarRepositorioFactory(deps.db),
    ),
    acl,
  };
}

export interface RegistrarContextoExtracaoModulo {
  readonly registrarContextoExtracao: RegistrarContextoExtracao;
  readonly acl: OrcamentoExtraidoEventACL;
}

export function criarRegistrarContextoExtracao(
  deps: RegistrarContextoDeps,
): RegistrarContextoExtracaoModulo {
  const acl = new OrcamentoExtraidoEventACL();
  return {
    registrarContextoExtracao: new RegistrarContextoExtracao(acl, criarRepositorioFactory(deps.db)),
    acl,
  };
}

export interface ConsolidarEDecidirWorkflowDeps {
  readonly db: NodePgDatabase;
  readonly eventBridge: EventBridgeClient;
  readonly eventBusName: string;
  readonly bedrock: BedrockRuntimeClient;
  readonly modeloOrquestradorId: string;
}

export interface ConsolidarEDecidirWorkflowModulo {
  readonly consolidarEDecidirWorkflow: ConsolidarEDecidirWorkflow;
  readonly acl: OrcamentoValidadoEventACL;
}

export function criarConsolidarEDecidirWorkflow(
  deps: ConsolidarEDecidirWorkflowDeps,
): ConsolidarEDecidirWorkflowModulo {
  const acl = new OrcamentoValidadoEventACL();
  const eventPublisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);
  const agenteOrquestrador = new BedrockOrquestradorGateway(
    deps.bedrock,
    deps.modeloOrquestradorId,
  );

  return {
    consolidarEDecidirWorkflow: new ConsolidarEDecidirWorkflow(
      acl,
      criarRepositorioFactory(deps.db),
      agenteOrquestrador,
      eventPublisher,
    ),
    acl,
  };
}

/** `llama3.1` roda em CPU — mesmo modelo de chat configurado pela issue #617. */
const OLLAMA_MODELO_ORQUESTRADOR_PADRAO = 'llama3.1';
const OLLAMA_BASE_URL_PADRAO = 'http://localhost:11434';

/** Config de cada implementação de `AgenteOrquestradorGateway` — só a lida é obrigatória. */
export interface ConfiguracaoAgenteOrquestrador {
  readonly bedrock?: { readonly client: BedrockRuntimeClient; readonly modelId: string };
  readonly ollama?: { readonly baseUrl?: string; readonly modelo?: string };
}

/**
 * Lê `NEXO_AGENTE_IA` (ADR-009, issue #621) e constrói o
 * `AgenteOrquestradorGateway` correspondente — `local` →
 * `OllamaOrquestradorGateway`, `bedrock` → `BedrockOrquestradorGateway`.
 * Mesmo contrato de `selecionarAgenteExtrator` (issue #619): falha rápido se
 * a variável estiver ausente/inválida ou se a config exigida pelo valor
 * escolhido não tiver sido fornecida — nunca cai silenciosamente para um
 * default ambíguo. Em produção, `exigirAgenteIaBedrockEmProducao()`
 * (`aws-clients.production.ts`, ADR-009 Decisão 3) já garante
 * `NEXO_AGENTE_IA=bedrock` antes de qualquer wiring — esta função não decide
 * essa trava, só reflete a mesma variável.
 */
export function selecionarAgenteOrquestrador(
  config: ConfiguracaoAgenteOrquestrador,
  agenteIa = process.env.NEXO_AGENTE_IA,
): AgenteOrquestradorGateway {
  if (agenteIa === 'bedrock') {
    if (!config.bedrock) {
      throw new Error('selecionarAgenteOrquestrador: NEXO_AGENTE_IA=bedrock exige config.bedrock');
    }
    return new BedrockOrquestradorGateway(config.bedrock.client, config.bedrock.modelId);
  }
  if (agenteIa === 'local') {
    return new OllamaOrquestradorGateway(
      config.ollama?.baseUrl ?? OLLAMA_BASE_URL_PADRAO,
      config.ollama?.modelo ?? OLLAMA_MODELO_ORQUESTRADOR_PADRAO,
    );
  }
  throw new Error(
    `selecionarAgenteOrquestrador: NEXO_AGENTE_IA deve ser "local" ou "bedrock" — recebido "${agenteIa ?? '(ausente)'}".`,
  );
}
