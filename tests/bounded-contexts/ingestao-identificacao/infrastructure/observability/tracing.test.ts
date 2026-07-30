import { describe, expect, it } from 'vitest';
import { iniciarObservabilidade } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/observability/tracing.js';

describe('iniciarObservabilidade', () => {
  it('inicia o NodeSDK sem lançar e permite shutdown limpo (não deve tentar exportar de verdade no teste)', async () => {
    const sdk = iniciarObservabilidade('teste-ingestao-identificacao');

    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
