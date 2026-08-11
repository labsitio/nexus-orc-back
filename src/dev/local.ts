/**
 * Execução local do fluxo 001 → 005 (spec 001 T067/#589, retomado por esta
 * task de ambiente local).
 *
 * Sobe o servidor HTTP com as rotas de todos os BCs em produção e um poller
 * por fila, chamando **os mesmos handlers** que as Lambdas usam em produção.
 * Postgres, S3, EventBridge e SQS são reais (docker-compose + LocalStack).
 *
 * Substitutos locais (nunca promovidos a adaptador/composição de produção):
 *
 * - **`tenantContextLocal`** — substituto do `TenantContextMiddleware`
 *   (`src/interface/shared/tenant-context.middleware.ts`). Não há Cognito em
 *   dev: popula `request.tenantContext`/`request.papeis` a partir de
 *   `NEXO_LOCAL_TENANT_ID`/`NEXO_LOCAL_PAPEIS` (`src/dev/config.ts`), sem
 *   verificar JWT nenhum. Produção nunca usa isto — sempre o middleware real.
 * - **MarkItDown** (`conversorLocal`/`conversorExtracaoLocal`) — o Lambda
 *   Python que os ACLs de produção invocam ainda não existe (issues #588 e
 *   #590). Enquanto não existir, aqui só passa texto (`.txt`/`.md`/`.csv`).
 * - **`fornecedorCadastradoLocal`/`agenteCategorizadorLocal`**
 *   (`src/dev/validacao.ts`) — sistema externo de cadastro de fornecedores
 *   não existe localmente, e não há gateway Ollama para
 *   `AgenteCategorizadorItemGateway` (só Bedrock).
 * - **`src/composition/validacao.ts` de produção não existe** — o wiring do
 *   BC Validação usado aqui (`criarValidacaoDev`) é dev-only (issues #615/
 *   #616 têm dono da composição de produção).
 *
 * Bedrock (classificador/extrator/embedding/orquestrador) usa os mesmos
 * seletores de `NEXO_AGENTE_IA` da composition root de produção (ADR-009):
 * com `NEXO_AGENTE_IA=local` (default deste ambiente) roda contra o Ollama
 * real do `docker-compose.yml` — sem credencial AWS, sem estimativa
 * silenciosa: modelo não puxado (`ollama pull`) faz a chamada HTTP falhar
 * explicitamente, propagada como batch item failure (nunca mascarada).
 *
 * IMPORTANTE: LocalStack não aplica IAM. Nada exercitado aqui prova que as
 * roles de produção têm `events:PutEvents` (ADR-004, issues #576-#580).
 */
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import Fastify, { type preHandlerHookHandler } from 'fastify';

import {
  criarAgenteClassificador,
  criarIngestaoIdentificacao,
  registrarRotasIngestaoIdentificacao,
} from '../composition/ingestao-identificacao.js';
import { criarExtracao, selecionarAgenteExtrator } from '../composition/extracao.js';
import { criarBuscaIndexacao, selecionarAgenteEmbedding } from '../composition/busca-indexacao.js';
import {
  criarRegistrarContextoClassificacao,
  criarRegistrarContextoExtracao,
  selecionarAgenteOrquestrador,
} from '../composition/orquestracao.js';
import type { MarkItDownConversaoACL } from '../bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.js';
import { sanitizarConteudoDocumento } from '../bounded-contexts/ingestao-identificacao/infrastructure/sanitizar-conteudo-documento.js';
import { criarClassificadorQueueHandler } from '../bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.handler.js';
import type { MarkItDownConversaoExtracaoACL } from '../bounded-contexts/extracao/domain/gateways/markitdown-conversao-extracao.acl.js';
import { ConfirmarRevisaoHumanaExtracao } from '../bounded-contexts/extracao/application/use-cases/confirmar-revisao-humana-extracao.js';
import { ConsultarStatusExtracao } from '../bounded-contexts/extracao/application/use-cases/consultar-status-extracao.js';
import { EventBridgePublisher as EventBridgePublisherExtracao } from '../bounded-contexts/extracao/infrastructure/eventbridge.publisher.js';
import { DrizzleExtracaoOrcamentoRepository } from '../bounded-contexts/extracao/infrastructure/persistence/drizzle-extracao-orcamento.repository.js';
import { sanitizarConteudoExtracao } from '../bounded-contexts/extracao/infrastructure/sanitizar-conteudo-extracao.js';
import { criarExtratorQueueHandler } from '../bounded-contexts/extracao/interface/events/extrator-queue.handler.js';
import { registrarRotaStatusExtracao } from '../bounded-contexts/extracao/interface/http/status.controller.js';
import { registrarRotaRevisaoHumanaExtracao } from '../bounded-contexts/extracao/interface/http/revisao-humana.controller.js';
import { registrarRotaStatusValidacao } from '../bounded-contexts/validacao/interface/http/status.controller.js';
import { registrarRotaDecisaoHumanaValidacao } from '../bounded-contexts/validacao/interface/http/decisao-humana.controller.js';
import { registrarRotaFaixaPrecoCategoria } from '../bounded-contexts/validacao/interface/http/faixa-preco-categoria.controller.js';
import { criarValidadorQueueHandler } from '../bounded-contexts/validacao/interface/events/validador-queue.handler.js';
import { criarIndexadorQueueHandler } from '../bounded-contexts/busca-indexacao/interface/events/indexador-queue.handler.js';
import { registrarRotaStatusIndexacao } from '../bounded-contexts/busca-indexacao/interface/http/indexacao-status.controller.js';
import { DrizzlePgvectorIndiceOrcamentoRepository } from '../bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.js';
import { criarContextoClassificacaoQueueHandler } from '../bounded-contexts/orquestracao/interface/events/contexto-classificacao-queue.handler.js';
import { criarContextoExtracaoQueueHandler } from '../bounded-contexts/orquestracao/interface/events/contexto-extracao-queue.handler.js';
import { criarDecisaoWorkflowQueueHandler } from '../bounded-contexts/orquestracao/interface/events/decisao-workflow-queue.handler.js';
import { registrarRotaStatusDecisaoWorkflow } from '../bounded-contexts/orquestracao/interface/http/status.controller.js';
import { registrarRotaDecisaoHumanaWorkflow } from '../bounded-contexts/orquestracao/interface/http/decisao-humana.controller.js';
import { ConsultarStatusDecisaoWorkflow } from '../bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import { RegistrarDecisaoHumanaWorkflow } from '../bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.js';
import { ConsolidarEDecidirWorkflow } from '../bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';
import { EventBridgePublisher as EventBridgePublisherOrquestracao } from '../bounded-contexts/orquestracao/infrastructure/eventbridge.publisher.js';
import { OrcamentoValidadoEventACL } from '../bounded-contexts/orquestracao/infrastructure/orcamento-validado-event.acl.js';
import { DrizzleDecisaoWorkflowRepository } from '../bounded-contexts/orquestracao/infrastructure/persistence/drizzle-decisao-workflow.repository.js';
import { criarValidacaoDev } from './validacao.js';
import { db } from '../shared-kernel/database/client.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';
import type { TenantContext } from '../shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../shared-kernel/tenant/tenant-id.vo.js';
import { clientesLocais, configLocal } from './config.js';

const cfg = configLocal();
const { s3, eventBridge, sqs } = clientesLocais();

/**
 * Substituto local do `TenantContextMiddleware`
 * (`src/interface/shared/tenant-context.middleware.ts`) — não há Cognito em
 * dev, então em vez de verificar um JWT esta função popula
 * `request.tenantContext`/`request.papeis` direto de configuração local
 * (`NEXO_LOCAL_TENANT_ID`/`NEXO_LOCAL_PAPEIS`). NUNCA em produção: produção
 * sempre passa pelo middleware real, que verifica o token.
 */
const tenantContextLocal: preHandlerHookHandler = async (request) => {
  request.tenantContext = criarTenantContext(TenantId.de(cfg.tenantIdLocal));
  request.papeis = cfg.papeisLocais;
};

/**
 * Extensões cuja conversão "leve" é honesta sem MarkItDown. PDF/XLSX falham de
 * propósito: decodificar bytes binários como UTF-8 produziria lixo que o
 * classificador aceitaria em silêncio — exatamente o falso positivo que este
 * ambiente não deve produzir.
 */
const EXTENSOES_SUPORTADAS_SEM_MARKITDOWN = ['.txt', '.md', '.csv'];

const ERRO_SEM_MARKITDOWN =
  'Conversão de documento binário exige o Lambda MarkItDown, que ainda não existe (issues #588/#590). ' +
  `Localmente só ${EXTENSOES_SUPORTADAS_SEM_MARKITDOWN.join(', ')} atravessam o fluxo.`;

const conversorLocal: MarkItDownConversaoACL = {
  async converterParaTexto(conteudoBruto: Uint8Array, nomeArquivo: string): Promise<string> {
    const nome = nomeArquivo.toLowerCase();
    if (!EXTENSOES_SUPORTADAS_SEM_MARKITDOWN.some((ext) => nome.endsWith(ext))) {
      throw new Error(`${ERRO_SEM_MARKITDOWN} Arquivo recebido: "${nomeArquivo}".`);
    }
    // Mantém a sanitização do caminho de produção — o texto do fornecedor
    // continua sendo entrada não confiável mesmo com conversor local.
    return sanitizarConteudoDocumento(Buffer.from(conteudoBruto).toString('utf8'));
  },
};

const conversorExtracaoLocal: MarkItDownConversaoExtracaoACL = {
  async converter(bruto: Buffer): Promise<string> {
    return sanitizarConteudoExtracao(bruto.toString('utf8'));
  },
};

// Seleção do gateway de IA (ADR-009): NEXO_AGENTE_IA=local (default deste
// ambiente) → Ollama real; =bedrock → mesma trava de config explícita que os
// seletores de `src/composition/*.ts` já aplicam (falha rápida se a config do
// Bedrock não for informada — este script não constrói cliente Bedrock).
const classificador = criarAgenteClassificador({
  agenteIa: cfg.agenteIa,
  ollamaBaseUrl: cfg.ollamaBaseUrl,
  ollamaModeloClassificador: cfg.ollamaModeloClassificador,
});
const extrator = selecionarAgenteExtrator(
  { ollama: { baseUrl: cfg.ollamaBaseUrl, modelo: cfg.ollamaModeloExtrator } },
  cfg.agenteIa,
);
const agenteEmbedding = selecionarAgenteEmbedding(
  { ollama: { baseUrl: cfg.ollamaBaseUrl, modelo: cfg.ollamaModeloEmbedding } },
  cfg.agenteIa,
);
const agenteOrquestrador = selecionarAgenteOrquestrador(
  { ollama: { baseUrl: cfg.ollamaBaseUrl, modelo: cfg.ollamaModeloOrquestrador } },
  cfg.agenteIa,
);

const ingestao = criarIngestaoIdentificacao({
  db,
  s3,
  eventBridge,
  bucket: cfg.bucket,
  eventBusName: cfg.eventBusName,
  classificador,
  conversor: conversorLocal,
});

const extracao = criarExtracao({
  db,
  s3,
  eventBridge,
  eventBusName: cfg.eventBusName,
  extrator,
  conversor: conversorExtracaoLocal,
});

// `criarExtracao` (composition/extracao.ts) só expõe `extrairDadosOrcamento`
// (consumo assíncrono) — as 2 rotas HTTP deste BC (status/revisão humana)
// não têm wiring de produção pronto ainda, então montadas aqui direto sobre
// o mesmo repositório tenant-scoped (`DrizzleExtracaoOrcamentoRepository`,
// mesmo padrão do `criarRepositorioExtracao` privado da composition root).
const criarRepositorioExtracaoHttp = (tenantId: TenantId) =>
  new DrizzleExtracaoOrcamentoRepository(db, criarTenantContext(tenantId));
const consultarStatusExtracao = new ConsultarStatusExtracao(criarRepositorioExtracaoHttp);
const confirmarRevisaoHumanaExtracao = new ConfirmarRevisaoHumanaExtracao(
  criarRepositorioExtracaoHttp,
  new EventBridgePublisherExtracao(eventBridge, cfg.eventBusName),
);

const validacao = criarValidacaoDev({ db, eventBridge, eventBusName: cfg.eventBusName });

const buscaIndexacao = criarBuscaIndexacao({
  db,
  eventBridge,
  eventBusName: cfg.eventBusName,
  embeddingGateway: agenteEmbedding,
});
const criarRepositorioIndiceOrcamentoHttp = (tenantContext: TenantContext) =>
  new DrizzlePgvectorIndiceOrcamentoRepository(db, tenantContext);

const contextoClassificacao = criarRegistrarContextoClassificacao({ db });
const contextoExtracao = criarRegistrarContextoExtracao({ db });

// `criarConsolidarEDecidirWorkflow` (composition/orquestracao.ts) constrói
// sempre `BedrockOrquestradorGateway` internamente — correto para produção
// (ADR-009 exige bedrock lá), mas não respeita `NEXO_AGENTE_IA` local. Aqui o
// caso de uso é montado direto com o gateway já resolvido por
// `selecionarAgenteOrquestrador` acima (mesmo agregado/repositório/ACL).
const aclOrcamentoValidado = new OrcamentoValidadoEventACL();
const criarRepositorioDecisaoWorkflow = (tenantId: TenantId) =>
  new DrizzleDecisaoWorkflowRepository(db, criarTenantContext(tenantId));
const publisherOrquestracao = new EventBridgePublisherOrquestracao(eventBridge, cfg.eventBusName);
const consolidarEDecidirWorkflow = new ConsolidarEDecidirWorkflow(
  aclOrcamentoValidado,
  criarRepositorioDecisaoWorkflow,
  agenteOrquestrador,
  publisherOrquestracao,
);
const consultarStatusDecisaoWorkflow = new ConsultarStatusDecisaoWorkflow(
  criarRepositorioDecisaoWorkflow,
);
const registrarDecisaoHumanaWorkflow = new RegistrarDecisaoHumanaWorkflow(
  criarRepositorioDecisaoWorkflow,
  publisherOrquestracao,
);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const opts = { preHandler: tenantContextLocal };

registrarRotasIngestaoIdentificacao(app, ingestao, opts);
registrarRotaStatusExtracao(app, consultarStatusExtracao, opts);
registrarRotaRevisaoHumanaExtracao(app, confirmarRevisaoHumanaExtracao, opts);
registrarRotaStatusValidacao(app, validacao.consultarStatusValidacao, opts);
registrarRotaDecisaoHumanaValidacao(
  app,
  validacao.registrarDecisaoHumanaValidacao,
  validacao.consultarStatusValidacao,
  opts,
);
registrarRotaFaixaPrecoCategoria(app, validacao.gatewayFaixaPreco, opts);
registrarRotaStatusIndexacao(app, criarRepositorioIndiceOrcamentoHttp, opts);
registrarRotaStatusDecisaoWorkflow(app, consultarStatusDecisaoWorkflow, opts);
registrarRotaDecisaoHumanaWorkflow(
  app,
  registrarDecisaoHumanaWorkflow,
  consultarStatusDecisaoWorkflow,
  opts,
);

const handlers = {
  'classificador-queue': criarClassificadorQueueHandler(ingestao.classificarOrcamento),
  'extrator-queue': criarExtratorQueueHandler(extracao.extrairDadosOrcamento),
  'validador-queue': criarValidadorQueueHandler(validacao.validarOrcamento),
  'indexador-queue': criarIndexadorQueueHandler(
    buscaIndexacao.indexarOrcamento,
    buscaIndexacao.acl,
  ),
  'contexto-classificacao-queue': criarContextoClassificacaoQueueHandler(
    contextoClassificacao.registrarContextoClassificacao,
    contextoClassificacao.acl,
  ),
  'contexto-extracao-queue': criarContextoExtracaoQueueHandler(
    contextoExtracao.registrarContextoExtracao,
    contextoExtracao.acl,
  ),
  'decisao-workflow-queue': criarDecisaoWorkflowQueueHandler(
    consolidarEDecidirWorkflow,
    aclOrcamentoValidado,
  ),
} as const;

let rodando = true;

/**
 * Substituto local do event source mapping do Lambda: long-poll na fila,
 * invoca o handler de produção e apaga só as mensagens que ele NÃO reportou
 * como `batchItemFailures` — as falhas voltam para a fila e, depois de
 * `maxReceiveCount`, para a DLQ, igual em produção.
 */
async function consumir(nomeFila: keyof typeof handlers): Promise<void> {
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: nomeFila }));
  if (!QueueUrl) {
    throw new Error(`Fila "${nomeFila}" não encontrada — rode o seed antes (pnpm dev:seed).`);
  }
  const handler = handlers[nomeFila];

  while (rodando) {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      }),
    );
    if (!Messages?.length) {
      continue;
    }

    const records = Messages.filter(
      (m): m is typeof m & { MessageId: string; Body: string; ReceiptHandle: string } =>
        m.MessageId !== undefined && m.Body !== undefined && m.ReceiptHandle !== undefined,
    ).map((m) => ({ messageId: m.MessageId, body: m.Body, receiptHandle: m.ReceiptHandle }));

    const { batchItemFailures } = await handler({
      Records: records.map(({ messageId, body }) => ({ messageId, body })),
    });
    const falhas = new Set(batchItemFailures.map((f) => f.itemIdentifier));

    for (const record of records) {
      if (falhas.has(record.messageId)) {
        app.log.warn({ fila: nomeFila, messageId: record.messageId }, 'batch item failure');
        continue;
      }
      await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: record.receiptHandle }));
    }
  }
}

async function main(): Promise<void> {
  await app.listen({ port: cfg.porta, host: '0.0.0.0' });
  app.log.info(
    {
      bucket: cfg.bucket,
      bus: cfg.eventBusName,
      agenteIa: cfg.agenteIa,
      confiancaClassificador: cfg.confiancaClassificador,
      extracaoCampoFaltando: cfg.extracaoCampoFaltando,
      tenantIdLocal: cfg.tenantIdLocal,
    },
    'ambiente local pronto — MarkItDown substituído por stub determinístico; IA via Ollama (NEXO_AGENTE_IA=local)',
  );

  const pollers = (Object.keys(handlers) as (keyof typeof handlers)[]).map((fila) =>
    consumir(fila).catch((erro: unknown) => {
      app.log.error({ err: erro, fila }, 'poller encerrado por erro');
      rodando = false;
    }),
  );

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sinal, () => {
      rodando = false;
      void app.close().then(() => process.exit(0));
    });
  }

  await Promise.all(pollers);
}

await main();
