import { App } from 'aws-cdk-lib';
import { ClassificadorLambdaRoleStack } from '../lib/classificador-lambda-role-stack.ts';
import { ClassificadorQueueStack } from '../lib/classificador-queue-stack.ts';
import { ConfirmarRevisaoHumanaLambdaRoleStack } from '../lib/confirmar-revisao-humana-lambda-role-stack.ts';
import { DominioEventBusStack } from '../lib/dominio-event-bus-stack.ts';
import { ExtratorQueueStack } from '../lib/extrator-queue-stack.ts';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';
import { ValidadorQueueStack } from '../lib/validador-queue-stack.ts';

const app = new App();

const storageStack = new IngestaoIdentificacaoStorageStack(
  app,
  'IngestaoIdentificacaoStorageStack',
  { description: 'Storage (S3) do BC Ingestão & Identificação — spec 001, T012.' },
);

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
  description: 'Fila extrator-queue + DLQ + alarme — spec 002, T003.',
});

new ValidadorQueueStack(app, 'ValidadorQueueStack', {
  description: 'Fila validador-queue + DLQ + alarme — spec 003, T003.',
});
