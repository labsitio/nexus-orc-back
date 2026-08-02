import { describe, expect, it } from 'vitest';
import { iniciarObservabilidade } from '../../../../../src/bounded-contexts/busca-indexacao/infrastructure/observability/tracing.js';

describe('iniciarObservabilidade (busca-indexacao)', () => {
  it('inicia o NodeSDK sem lançar e permite shutdown limpo (não deve tentar exportar de verdade no teste)', async () => {
    const sdk = iniciarObservabilidade('teste-busca-indexacao');

    await expect(sdk.shutdown()).resolves.toBeUndefined();
  });
});
