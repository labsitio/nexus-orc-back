/**
 * Wiring de desenvolvimento do BC Validação (spec 003) — `src/composition/validacao.ts`
 * de produção não existe (composição raiz de produção é escopo das issues
 * #615/#616, que têm dono). Esta fábrica é exclusiva de `src/dev/local.ts`,
 * só para destravar o encadeamento local 002→003→004→005; espelha o padrão
 * dos demais `src/composition/*.ts`, mas nunca deve ser promovida a
 * composição de produção.
 *
 * `fornecedorCadastradoLocal` e `agenteCategorizadorLocal` são stubs
 * determinísticos: o sistema externo de cadastro de fornecedores
 * (`FornecedorCadastradoHttpGateway`) não existe localmente, e não há
 * gateway Ollama para `AgenteCategorizadorItemGateway` (só
 * `BedrockCategorizadorItemGateway`) — mesma disciplina dos stubs de
 * MarkItDown em `local.ts`: nunca promovidos a adaptador de produção.
 */
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ConsultarStatusValidacao } from '../bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.js';
import { ValidarOrcamento } from '../bounded-contexts/validacao/application/use-cases/validar-orcamento.js';
import type { AgenteCategorizadorItemGateway } from '../bounded-contexts/validacao/domain/gateways/agente-categorizador-item.gateway.js';
import type { FornecedorCadastradoGateway } from '../bounded-contexts/validacao/domain/gateways/fornecedor-cadastrado.gateway.js';
import type { CriarOrcamentoValidacaoRepositorio } from '../bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { CategoriaItem } from '../bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { EventBridgePublisher } from '../bounded-contexts/validacao/infrastructure/eventbridge.publisher.js';
import { OrcamentoExtraidoEventACLImpl } from '../bounded-contexts/validacao/infrastructure/orcamento-extraido-event.acl.js';
import { DrizzleFaixaPrecoRepository } from '../bounded-contexts/validacao/infrastructure/persistence/drizzle-faixa-preco.repository.js';
import { DrizzleOrcamentoValidacaoRepository } from '../bounded-contexts/validacao/infrastructure/persistence/drizzle-orcamento-validacao.repository.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';

export interface ValidacaoDevDeps {
  readonly db: NodePgDatabase;
  readonly eventBridge: EventBridgeClient;
  readonly eventBusName: string;
}

export interface ValidacaoDev {
  readonly validarOrcamento: ValidarOrcamento;
  readonly consultarStatusValidacao: ConsultarStatusValidacao;
  readonly registrarDecisaoHumanaValidacao: RegistrarDecisaoHumanaValidacao;
  readonly gatewayFaixaPreco: DrizzleFaixaPrecoRepository;
}

/** Sem sistema externo de cadastro localmente — sempre "cadastrado", nunca em produção. */
const fornecedorCadastradoLocal: FornecedorCadastradoGateway = {
  async estaCadastrado(): Promise<boolean> {
    return true;
  },
};

/** Sem Ollama para este agente — categoriza sempre pela 1ª categoria do catálogo configurado. */
const agenteCategorizadorLocal: AgenteCategorizadorItemGateway = {
  async categorizar({ catalogoCategorias }) {
    const [primeiraCategoria] = catalogoCategorias;
    if (!primeiraCategoria) {
      throw new Error(
        'agenteCategorizadorLocal: catalogoCategorias vazio — ValidarOrcamento não deveria chamar o agente nesse caso',
      );
    }
    return CategoriaItem.de(primeiraCategoria);
  },
};

export function criarValidacaoDev(deps: ValidacaoDevDeps): ValidacaoDev {
  const criarRepositorio: CriarOrcamentoValidacaoRepositorio = (tenantId) =>
    new DrizzleOrcamentoValidacaoRepository(deps.db, criarTenantContext(tenantId));
  const publisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);
  const gatewayFaixaPreco = new DrizzleFaixaPrecoRepository(deps.db);

  return {
    validarOrcamento: new ValidarOrcamento(
      new OrcamentoExtraidoEventACLImpl(),
      criarRepositorio,
      fornecedorCadastradoLocal,
      gatewayFaixaPreco,
      publisher,
      agenteCategorizadorLocal,
    ),
    consultarStatusValidacao: new ConsultarStatusValidacao(criarRepositorio),
    registrarDecisaoHumanaValidacao: new RegistrarDecisaoHumanaValidacao(
      criarRepositorio,
      publisher,
    ),
    gatewayFaixaPreco,
  };
}
