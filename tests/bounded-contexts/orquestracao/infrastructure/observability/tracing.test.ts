import { describe, expect, it } from 'vitest';
import { iniciarObservabilidade } from '../../../../../src/bounded-contexts/orquestracao/infrastructure/observability/tracing.js';

describe('iniciarObservabilidade (orquestracao)', () => {
  it('inicia o NodeSDK sem lançar e permite shutdown limpo (não deve tentar exportar de verdade no teste)', async () => {
    const sdk = iniciarObservabilidade('teste-orquestracao');

    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
