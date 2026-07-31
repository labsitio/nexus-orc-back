import { describe, expect, it } from 'vitest';
import { criarLogger } from '../../../../../src/bounded-contexts/validacao/infrastructure/observability/logger.js';

describe('criarLogger (validacao)', () => {
  it('usa nível "info" por padrão quando LOG_LEVEL não está definido', () => {
    const original = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;

    const logger = criarLogger();

    expect(logger.level).toBe('info');
    if (original !== undefined) process.env.LOG_LEVEL = original;
    else delete process.env.LOG_LEVEL;
  });

  it('respeita LOG_LEVEL do ambiente', () => {
    const original = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';

    const logger = criarLogger();

    expect(logger.level).toBe('debug');
    if (original === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = original;
  });

  it('fixa bindings (ex.: orcamentoId) no log para correlação ponta a ponta', () => {
    const logger = criarLogger({ orcamentoId: '01973b1e-0000-7000-8000-000000000000' });

    expect(logger.bindings()).toMatchObject({
      orcamentoId: '01973b1e-0000-7000-8000-000000000000',
    });
  });
});
