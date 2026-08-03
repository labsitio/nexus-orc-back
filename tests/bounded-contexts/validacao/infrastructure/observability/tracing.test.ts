import { describe, expect, it } from 'vitest';
import { iniciarObservabilidade } from '../../../../../src/bounded-contexts/validacao/infrastructure/observability/tracing.js';

describe('iniciarObservabilidade (validacao)', () => {
  it('inicia o NodeSDK sem lançar e permite shutdown limpo (não deve tentar exportar de verdade no teste)', async () => {
    const sdk = iniciarObservabilidade('teste-validacao');

    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
