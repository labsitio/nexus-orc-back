import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ConsultarStatusValidacao } from '../bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.js';
import { ValidarOrcamento } from '../bounded-contexts/validacao/application/use-cases/validar-orcamento.js';
import type { CriarOrcamentoValidacaoRepositorio } from '../bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { BedrockCategorizadorItemGateway } from '../bounded-contexts/validacao/infrastructure/bedrock-categorizador-item.gateway.js';
import { EventBridgePublisher } from '../bounded-contexts/validacao/infrastructure/eventbridge.publisher.js';
import { DrizzleFaixaPrecoRepository } from '../bounded-contexts/validacao/infrastructure/persistence/drizzle-faixa-preco.repository.js';
import { DrizzleOrcamentoValidacaoRepository } from '../bounded-contexts/validacao/infrastructure/persistence/drizzle-orcamento-validacao.repository.js';
import { FornecedorCadastradoHttpGateway } from '../bounded-contexts/validacao/infrastructure/fornecedor-cadastrado-http.gateway.js';
import { OrcamentoExtraidoEventACLImpl } from '../bounded-contexts/validacao/infrastructure/orcamento-extraido-event.acl.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';

/**
 * Composition root de produção do BC Validação (issue #615). Mesmo formato
 * de `extracao.ts`/`orquestracao.ts` (ADR-009): só monta dependências reais
 * a partir de clientes/config injetados, nenhuma regra de negócio aqui.
 *
 * Diferente de `src/dev/validacao.ts` (dev-only, nunca promovido a
 * produção): usa `FornecedorCadastradoHttpGateway` real (contra o sistema
 * externo de cadastro) e `BedrockCategorizadorItemGateway` real — não há
 * gateway Ollama para `AgenteCategorizadorItemGateway` (só a implementação
 * Bedrock existe, T041/US3), então não há `selecionarAgenteCategorizador`:
 * a única implementação de produção é sempre esta.
 */
export interface ValidacaoDeps {
  readonly db: NodePgDatabase;
  readonly eventBridge: EventBridgeClient;
  readonly eventBusName: string;
  readonly bedrock: BedrockRuntimeClient;
  readonly modeloCategorizacaoId: string;
  readonly fornecedorCadastradoBaseUrl: string;
}

export interface Validacao {
  readonly validarOrcamento: ValidarOrcamento;
  readonly consultarStatusValidacao: ConsultarStatusValidacao;
  readonly registrarDecisaoHumanaValidacao: RegistrarDecisaoHumanaValidacao;
}

export function criarValidacao(deps: ValidacaoDeps): Validacao {
  const criarRepositorio: CriarOrcamentoValidacaoRepositorio = (tenantId) =>
    new DrizzleOrcamentoValidacaoRepository(deps.db, criarTenantContext(tenantId));
  const publisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);
  const gatewayFaixaPreco = new DrizzleFaixaPrecoRepository(deps.db);

  return {
    validarOrcamento: new ValidarOrcamento(
      new OrcamentoExtraidoEventACLImpl(),
      criarRepositorio,
      new FornecedorCadastradoHttpGateway(deps.fornecedorCadastradoBaseUrl),
      gatewayFaixaPreco,
      publisher,
      new BedrockCategorizadorItemGateway(deps.bedrock, deps.modeloCategorizacaoId),
    ),
    consultarStatusValidacao: new ConsultarStatusValidacao(criarRepositorio),
    registrarDecisaoHumanaValidacao: new RegistrarDecisaoHumanaValidacao(
      criarRepositorio,
      publisher,
    ),
  };
}
