import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ConsolidarEDecidirWorkflow } from '../bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';
import { RegistrarContextoClassificacao } from '../bounded-contexts/orquestracao/application/use-cases/registrar-contexto-classificacao.js';
import { RegistrarContextoExtracao } from '../bounded-contexts/orquestracao/application/use-cases/registrar-contexto-extracao.js';
import type { CriarDecisaoWorkflowRepositorio } from '../bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { BedrockOrquestradorGateway } from '../bounded-contexts/orquestracao/infrastructure/bedrock-orquestrador.gateway.js';
import { EventBridgePublisher } from '../bounded-contexts/orquestracao/infrastructure/eventbridge.publisher.js';
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
