import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { exigirAgenteIaBedrockEmProducao as ExigirAgenteIaBedrockEmProducao } from '../../src/composition/aws-clients.production.js';

/**
 * `exigirAgenteIaBedrockEmProducao` (ADR-009, Decisão 3) — fail-fast no cold
 * start se `NEXO_AGENTE_IA` não for exatamente "bedrock". Único ponto de
 * lógica de decisão em `aws-clients.production.ts` (o resto é construção
 * direta de clientes SDK, sem branch) — `clientesProducao()` não é testado
 * aqui pelo mesmo motivo de `clientesLocais()` (src/dev/config.ts) não ser:
 * wrapper fino sem lógica própria em cima do SDK.
 *
 * Import dinâmico após fixar `DATABASE_URL`: o módulo importa `db` de
 * `shared-kernel/database/client.js`, que exige a variável no top-level
 * (mesmo fail-fast, ver client.ts) — import estático quebraria a suíte
 * inteira sem a variável setada antes da avaliação do módulo.
 */
describe('exigirAgenteIaBedrockEmProducao', () => {
  let exigirAgenteIaBedrockEmProducao: typeof ExigirAgenteIaBedrockEmProducao;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/db';
    ({ exigirAgenteIaBedrockEmProducao } =
      await import('../../src/composition/aws-clients.production.js'));
  });

  const original = process.env.NEXO_AGENTE_IA;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXO_AGENTE_IA;
    } else {
      process.env.NEXO_AGENTE_IA = original;
    }
  });

  it('não lança quando NEXO_AGENTE_IA é "bedrock"', () => {
    process.env.NEXO_AGENTE_IA = 'bedrock';
    expect(() => exigirAgenteIaBedrockEmProducao()).not.toThrow();
  });

  it('lança quando NEXO_AGENTE_IA está ausente', () => {
    delete process.env.NEXO_AGENTE_IA;
    expect(() => exigirAgenteIaBedrockEmProducao()).toThrow(/NEXO_AGENTE_IA/);
  });

  it('lança quando NEXO_AGENTE_IA tem valor diferente de "bedrock" (ex.: "ollama")', () => {
    process.env.NEXO_AGENTE_IA = 'ollama';
    expect(() => exigirAgenteIaBedrockEmProducao()).toThrow(/ollama/);
  });
});
