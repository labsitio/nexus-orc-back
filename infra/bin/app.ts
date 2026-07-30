import { App } from 'aws-cdk-lib';
import { IngestaoIdentificacaoStorageStack } from '../lib/ingestao-identificacao-storage-stack.ts';

const app = new App();

new IngestaoIdentificacaoStorageStack(app, 'IngestaoIdentificacaoStorageStack', {
  description: 'Storage (S3) do BC Ingestão & Identificação — spec 001, T012.',
});
