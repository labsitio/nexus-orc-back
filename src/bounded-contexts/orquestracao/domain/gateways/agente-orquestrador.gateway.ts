import type { ContextoClassificacao } from '../value-objects/contexto-classificacao.vo.js';
import type { ContextoExtracao } from '../value-objects/contexto-extracao.vo.js';
import type { ContextoValidacao } from '../value-objects/contexto-validacao.vo.js';
import type { ResultadoOrquestrador } from '../aggregates/decisao-workflow.aggregate.js';

export interface AgenteOrquestradorInput {
  readonly contextoClassificacao: ContextoClassificacao;
  readonly contextoExtracao: ContextoExtracao;
  readonly contextoValidacao: ContextoValidacao;
}

/**
 * Único agente de IA desta spec (Bedrock) — decide a ação de roteamento
 * (`acao`/`nivelConfianca`/`criterio`/`requerIntegracaoExterna`) a partir do
 * contexto consolidado, nunca reavaliando conteúdo de fornecedor/formato/
 * extração/validação já decidido pelos agentes anteriores (Princípio V,
 * plan.md). Implementado na Infrastructure (`BedrockOrquestradorGateway` +
 * `BedrockDecisaoWorkflowACL`, T025), com saída estruturada (tool-use)
 * exigindo obrigatoriamente `criterio` não vazio — nunca parsing de texto
 * livre por regex, nunca resposta aceita sem base auditável (ver Segurança
 * do plan.md).
 */
export interface AgenteOrquestradorGateway {
  decidir(input: AgenteOrquestradorInput): Promise<ResultadoOrquestrador>;
}
