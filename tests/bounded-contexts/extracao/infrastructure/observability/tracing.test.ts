import { describe, expect, it } from 'vitest';
import { iniciarObservabilidade } from '../../../../../src/bounded-contexts/extracao/infrastructure/observability/tracing.js';

describe('iniciarObservabilidade (extracao)', () => {
  it('inicia o NodeSDK sem lançar e permite shutdown limpo (não deve tentar exportar de verdade no teste)', async () => {
    const sdk = iniciarObservabilidade('teste-extracao');

    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
