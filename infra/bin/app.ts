import { App } from 'aws-cdk-lib';
import { ClassificadorLambdaRoleStack } from '../lib/classificador-lambda-role-stack.ts';
import { ClassificadorQueueStack } from '../lib/classificador-queue-stack.ts';
import { ConfirmarRevisaoHumanaLambdaRoleStack } from '../lib/confirmar-revisao-humana-lambda-role-stack.ts';
import { ContextoClassificacaoQueueStack } from '../lib/contexto-classificacao-queue-stack.ts';
import { ContextoExtracaoQueueStack } from '../lib/contexto-extracao-queue-stack.ts';
import { DecisaoWorkflowQueueStack } from '../lib/decisao-workflow-queue-stack.ts';
import { DominioEventBusStack } from '../lib/dominio-event-bus-stack.ts';
import { ExtratorQueueStack } from '../lib/extrator-queue-stack.ts';
import { IndexadorQueueStack } from '../lib/indexador-queue-stack.ts';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';
import { ReceberOrcamentoLambdaRoleStack } from '../lib/receber-orcamento-lambda-role-stack.ts';
import { ValidadorQueueStack } from '../lib/validador-queue-stack.ts';

const app = new App();

const storageStack = new IngestaoIdentificacaoStorageStack(
  app,
  'IngestaoIdentificacaoStorageStack',
  { description: 'Storage (S3) do BC Ingestão & Identificação — spec 001, T012.' },
);

new ReceberOrcamentoLambdaRoleStack(app, 'ReceberOrcamentoLambdaRoleStack', {
  description: 'IAM role do(s) Lambda(s) que executam ReceberOrcamento — spec 001, T026.',
  orcamentosRawBucket: storageStack.orcamentosRawBucket,
});

const dominioEventBusStack = new DominioEventBusStack(app, 'DominioEventBusStack', {
  description:
    'Bus de domínio único (EventBridge), compartilhado por todos os Bounded Contexts — spec 001, T013.',
});

const classificadorQueueStack = new ClassificadorQueueStack(app, 'ClassificadorQueueStack', {
  description:
    'Fila classificador-queue + DLQ + alarme, roteada por regra EventBridge — spec 001, T033.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ClassificadorLambdaRoleStack(app, 'ClassificadorLambdaRoleStack', {
  description: 'Role IAM least-privilege da Lambda Classificador — spec 001, T035.',
  orcamentosRawBucket: storageStack.orcamentosRawBucket,
  classificadorQueue: classificadorQueueStack.classificadorQueue,
});

new ConfirmarRevisaoHumanaLambdaRoleStack(app, 'ConfirmarRevisaoHumanaLambdaRoleStack', {
  description:
    'Role IAM least-privilege da Lambda de confirmação humana (sem Bedrock/S3 raw) — spec 001, T054.',
});

new ExtratorQueueStack(app, 'ExtratorQueueStack', {
  description:
    'Fila extrator-queue + DLQ + alarme, roteada por regra EventBridge — spec 002, T003/T004.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ValidadorQueueStack(app, 'ValidadorQueueStack', {
  description:
    'Fila validador-queue + DLQ + alarme, roteada por regra EventBridge — spec 003, T003/T004.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ContextoClassificacaoQueueStack(app, 'ContextoClassificacaoQueueStack', {
  description:
    'Fila contexto-classificacao-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T004.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ContextoExtracaoQueueStack(app, 'ContextoExtracaoQueueStack', {
  description:
    'Fila contexto-extracao-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T005.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new DecisaoWorkflowQueueStack(app, 'DecisaoWorkflowQueueStack', {
  description:
    'Fila decisao-workflow-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T006.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new IndexadorQueueStack(app, 'IndexadorQueueStack', {
  description: 'Fila indexador-queue + DLQ + alarme (BC Busca & Indexação) — spec 004, T004.',
});
