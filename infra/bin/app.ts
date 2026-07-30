import { App } from 'aws-cdk-lib';
import { DominioEventBusStack } from '../lib/dominio-event-bus-stack.ts';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';

const app = new App();

new IngestaoIdentificacaoStorageStack(app, 'IngestaoIdentificacaoStorageStack', {
  description: 'Storage (S3) do BC Ingestão & Identificação — spec 001, T012.',
});

new DominioEventBusStack(app, 'DominioEventBusStack', {
  description:
    'Bus de domínio único (EventBridge), compartilhado por todos os Bounded Contexts — spec 001, T013.',
});
