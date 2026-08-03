// Barrel de schemas Drizzle de todos os Bounded Contexts.
// Cada spec re-exporta seu(s) schema(s) daqui conforme forem criados.
export * from '../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/orcamento.schema.js';
export * from '../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/idempotency-key.schema.js';
export * from '../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/sftp-tenant-mapping.schema.js';
export * from '../src/platform/conformidade/infrastructure/persistence/schema/platform.schema.js';
export * from '../src/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.js';
export * from '../src/bounded-contexts/validacao/infrastructure/persistence/schema/validacao-orcamento.schema.js';
export * from '../src/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento.schema.js';
export * from '../src/bounded-contexts/orquestracao/infrastructure/persistence/schema/decisao-workflow.schema.js';
