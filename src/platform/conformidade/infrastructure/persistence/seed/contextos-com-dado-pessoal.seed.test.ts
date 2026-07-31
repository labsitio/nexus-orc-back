import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXTOS_COM_DADO_PESSOAL_SEED,
  seedContextosComDadoPessoal,
} from './contextos-com-dado-pessoal.seed.js';

describe('seedContextosComDadoPessoal', () => {
  it('contém a linha ingestao-identificacao (único BC arquitetado até T010)', () => {
    expect(CONTEXTOS_COM_DADO_PESSOAL_SEED).toEqual([
      { boundedContext: 'ingestao-identificacao', possuiDadoPessoal: true },
    ]);
  });

  it('faz upsert idempotente (onConflictDoNothing) com os dados de seed', async () => {
    const onConflictDoNothing = vi.fn();
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Parameters<typeof seedContextosComDadoPessoal>[0];

    await seedContextosComDadoPessoal(db);

    expect(values).toHaveBeenCalledWith(CONTEXTOS_COM_DADO_PESSOAL_SEED);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
