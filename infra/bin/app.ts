import { App } from 'aws-cdk-lib';
import { ClassificadorQueueStack } from '../lib/classificador-queue-stack.ts';
import { DominioEventBusStack } from '../lib/dominio-event-bus-stack.ts';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';

const app = new App();

new IngestaoIdentificacaoStorageStack(app, 'IngestaoIdentificacaoStorageStack', {
  description: 'Storage (S3) do BC Ingestão & Identificação — spec 001, T012.',
});

const dominioEventBusStack = new DominioEventBusStack(app, 'DominioEventBusStack', {
  description:
    'Bus de domínio único (EventBridge), compartilhado por todos os Bounded Contexts — spec 001, T013.',
});

new ClassificadorQueueStack(app, 'ClassificadorQueueStack', {
  description:
    'Fila classificador-queue + DLQ + alarme, roteada por regra EventBridge — spec 001, T033.',
  dominioBus: dominioEventBusStack.dominioBus,
});
