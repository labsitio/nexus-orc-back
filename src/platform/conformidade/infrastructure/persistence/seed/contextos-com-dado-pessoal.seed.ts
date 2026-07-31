import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { contextosComDadoPessoal } from '../schema/platform.schema.js';

/**
 * Dado de seed (não regra de domínio) — linha por Bounded Context conforme
 * ele é arquitetado (plan.md, seção Infrastructure: "mantida por quem
 * arquiteta cada novo BC"). `ingestao-identificacao` é o único BC
 * arquitetado até T010 (spec 001); specs 002–007 MUST adicionar a própria
 * linha aqui quando forem desenhadas (tasks.md T046).
 */
export const CONTEXTOS_COM_DADO_PESSOAL_SEED = [
  { boundedContext: 'ingestao-identificacao', possuiDadoPessoal: true },
] as const;

/** Upsert idempotente — seguro para reexecutar manualmente em qualquer ambiente. */
export async function seedContextosComDadoPessoal(db: NodePgDatabase): Promise<void> {
  await db
    .insert(contextosComDadoPessoal)
    .values([...CONTEXTOS_COM_DADO_PESSOAL_SEED])
    .onConflictDoNothing();
}
