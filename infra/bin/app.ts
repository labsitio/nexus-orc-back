import { App } from 'aws-cdk-lib';
import { ClassificadorLambdaRoleStack } from '../lib/classificador-lambda-role-stack.ts';
import { ClassificadorQueueStack } from '../lib/classificador-queue-stack.ts';
import { ConfirmarRevisaoHumanaExtracaoLambdaRoleStack } from '../lib/confirmar-revisao-humana-extracao-lambda-role-stack.ts';
import { ConfirmarRevisaoHumanaLambdaRoleStack } from '../lib/confirmar-revisao-humana-lambda-role-stack.ts';
import { ConsultaStatusLambdaRoleStack } from '../lib/consulta-status-lambda-role-stack.ts';
import { ContextoClassificacaoFunctionStack } from '../lib/contexto-classificacao-function-stack.ts';
import { ContextoClassificacaoLambdaRoleStack } from '../lib/contexto-classificacao-lambda-role-stack.ts';
import { ContextoClassificacaoQueueStack } from '../lib/contexto-classificacao-queue-stack.ts';
import { ContextoExtracaoFunctionStack } from '../lib/contexto-extracao-function-stack.ts';
import { ContextoExtracaoLambdaRoleStack } from '../lib/contexto-extracao-lambda-role-stack.ts';
import { ContextoExtracaoQueueStack } from '../lib/contexto-extracao-queue-stack.ts';
import { DecisaoWorkflowFunctionStack } from '../lib/decisao-workflow-function-stack.ts';
import { DecisaoWorkflowLambdaRoleStack } from '../lib/decisao-workflow-lambda-role-stack.ts';
import { DecisaoWorkflowQueueStack } from '../lib/decisao-workflow-queue-stack.ts';
import { DominioEventBusStack } from '../lib/dominio-event-bus-stack.ts';
import { ExtratorLambdaRoleStack } from '../lib/extrator-lambda-role-stack.ts';
import { ExtratorQueueStack } from '../lib/extrator-queue-stack.ts';
import { IndexadorFunctionStack } from '../lib/indexador-function-stack.ts';
import { IndexadorLambdaRoleStack } from '../lib/indexador-lambda-role-stack.ts';
import { IndexadorQueueStack } from '../lib/indexador-queue-stack.ts';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';
import { ReceberOrcamentoLambdaRoleStack } from '../lib/receber-orcamento-lambda-role-stack.ts';
import { RegistrarDecisaoHumanaValidacaoLambdaRoleStack } from '../lib/registrar-decisao-humana-validacao-lambda-role-stack.ts';
import { ValidadorQueueStack } from '../lib/validador-queue-stack.ts';
import { ValidarOrcamentoLambdaRoleStack } from '../lib/validar-orcamento-lambda-role-stack.ts';

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

new ConsultaStatusLambdaRoleStack(app, 'ConsultaStatusLambdaRoleStack', {
  description:
    'Role IAM least-privilege da Lambda ConsultarStatusOrcamento (somente leitura, sem Bedrock/S3/EventBridge) — spec 001, T048.',
});

const extratorQueueStack = new ExtratorQueueStack(app, 'ExtratorQueueStack', {
  description:
    'Fila extrator-queue + DLQ + alarme, roteada por regra EventBridge — spec 002, T003/T004.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ExtratorLambdaRoleStack(app, 'ExtratorLambdaRoleStack', {
  description: 'Role IAM least-privilege da Lambda Extrator — spec 002, T026.',
  orcamentosRawBucket: storageStack.orcamentosRawBucket,
  extratorQueue: extratorQueueStack.extratorQueue,
});

new ConfirmarRevisaoHumanaExtracaoLambdaRoleStack(
  app,
  'ConfirmarRevisaoHumanaExtracaoLambdaRoleStack',
  {
    description:
      'Role IAM least-privilege da Lambda de confirmação humana da Extração (sem Bedrock/S3 raw) — spec 002, T040.',
  },
);

const validadorQueueStack = new ValidadorQueueStack(app, 'ValidadorQueueStack', {
  description:
    'Fila validador-queue + DLQ + alarme, roteada por regra EventBridge — spec 003, T003/T004.',
  dominioBus: dominioEventBusStack.dominioBus,
});

new ValidarOrcamentoLambdaRoleStack(app, 'ValidarOrcamentoLambdaRoleStack', {
  description:
    'Role IAM least-privilege da Lambda ValidarOrcamento (sem S3 raw; bedrock:InvokeModel restrito ao ARN do modelo de categorização aprovado) — spec 003, T028/T045.',
  validadorQueue: validadorQueueStack.validadorQueue,
});

new RegistrarDecisaoHumanaValidacaoLambdaRoleStack(
  app,
  'RegistrarDecisaoHumanaValidacaoLambdaRoleStack',
  {
    description:
      'Role IAM least-privilege da Lambda RegistrarDecisaoHumanaValidacao (sem Bedrock/S3 raw) — spec 003, T037.',
  },
);

const contextoClassificacaoQueueStack = new ContextoClassificacaoQueueStack(
  app,
  'ContextoClassificacaoQueueStack',
  {
    description:
      'Fila contexto-classificacao-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T004.',
    dominioBus: dominioEventBusStack.dominioBus,
  },
);

const contextoClassificacaoLambdaRoleStack = new ContextoClassificacaoLambdaRoleStack(
  app,
  'ContextoClassificacaoLambdaRoleStack',
  {
    description:
      'Role IAM least-privilege da Lambda RegistrarContextoClassificacao — spec 005, issue #624.',
    contextoClassificacaoQueue: contextoClassificacaoQueueStack.contextoClassificacaoQueue,
  },
);

new ContextoClassificacaoFunctionStack(app, 'ContextoClassificacaoFunctionStack', {
  description:
    'NodejsFunction de produção do handler consumidor de contexto-classificacao-queue — spec 005, issue #624.',
  contextoClassificacaoLambdaRole:
    contextoClassificacaoLambdaRoleStack.contextoClassificacaoLambdaRole,
  contextoClassificacaoQueue: contextoClassificacaoQueueStack.contextoClassificacaoQueue,
});

const contextoExtracaoQueueStack = new ContextoExtracaoQueueStack(
  app,
  'ContextoExtracaoQueueStack',
  {
    description:
      'Fila contexto-extracao-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T005.',
    dominioBus: dominioEventBusStack.dominioBus,
  },
);

const contextoExtracaoLambdaRoleStack = new ContextoExtracaoLambdaRoleStack(
  app,
  'ContextoExtracaoLambdaRoleStack',
  {
    description:
      'Role IAM least-privilege da Lambda RegistrarContextoExtracao — spec 005, issue #624.',
    contextoExtracaoQueue: contextoExtracaoQueueStack.contextoExtracaoQueue,
  },
);

new ContextoExtracaoFunctionStack(app, 'ContextoExtracaoFunctionStack', {
  description:
    'NodejsFunction de produção do handler consumidor de contexto-extracao-queue — spec 005, issue #624.',
  contextoExtracaoLambdaRole: contextoExtracaoLambdaRoleStack.contextoExtracaoLambdaRole,
  contextoExtracaoQueue: contextoExtracaoQueueStack.contextoExtracaoQueue,
});

const decisaoWorkflowQueueStack = new DecisaoWorkflowQueueStack(app, 'DecisaoWorkflowQueueStack', {
  description:
    'Fila decisao-workflow-queue + DLQ + alarme, roteada por regra EventBridge — spec 005, T003/T006.',
  dominioBus: dominioEventBusStack.dominioBus,
});

const decisaoWorkflowLambdaRoleStack = new DecisaoWorkflowLambdaRoleStack(
  app,
  'DecisaoWorkflowLambdaRoleStack',
  {
    description:
      'Role IAM least-privilege da Lambda ConsolidarEDecidirWorkflow — spec 005, issue #624.',
    decisaoWorkflowQueue: decisaoWorkflowQueueStack.decisaoWorkflowQueue,
    dominioBus: dominioEventBusStack.dominioBus,
  },
);

new DecisaoWorkflowFunctionStack(app, 'DecisaoWorkflowFunctionStack', {
  description:
    'NodejsFunction de produção do handler consumidor de decisao-workflow-queue — spec 005, issue #624.',
  decisaoWorkflowLambdaRole: decisaoWorkflowLambdaRoleStack.decisaoWorkflowLambdaRole,
  decisaoWorkflowQueue: decisaoWorkflowQueueStack.decisaoWorkflowQueue,
  dominioBus: dominioEventBusStack.dominioBus,
});

const indexadorQueueStack = new IndexadorQueueStack(app, 'IndexadorQueueStack', {
  description:
    'Fila indexador-queue + DLQ + alarme, roteada por regra EventBridge — spec 004, T004/T005.',
  dominioBus: dominioEventBusStack.dominioBus,
});

const indexadorLambdaRoleStack = new IndexadorLambdaRoleStack(app, 'IndexadorLambdaRoleStack', {
  description: 'Role IAM least-privilege da Lambda IndexarOrcamento — spec 004, issue #623.',
  indexadorQueue: indexadorQueueStack.indexadorQueue,
  dominioBus: dominioEventBusStack.dominioBus,
});

new IndexadorFunctionStack(app, 'IndexadorFunctionStack', {
  description:
    'NodejsFunction de produção do handler consumidor de indexador-queue — spec 004, issue #623 (primeira Lambda de produção do repositório, ADR-009).',
  indexadorLambdaRole: indexadorLambdaRoleStack.indexadorLambdaRole,
  indexadorQueue: indexadorQueueStack.indexadorQueue,
  dominioBus: dominioEventBusStack.dominioBus,
});
