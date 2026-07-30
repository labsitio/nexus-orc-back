// Barrel de schemas Drizzle de todos os Bounded Contexts.
// Cada spec re-exporta seu(s) schema(s) daqui conforme forem criados
// (ex.: src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/*.ts em T010).
export * from '../src/platform/conformidade/infrastructure/persistence/schema/platform.schema.js';
