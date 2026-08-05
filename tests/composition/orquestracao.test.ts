import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import {
  criarConsolidarEDecidirWorkflow,
  criarRegistrarContextoClassificacao,
  criarRegistrarContextoExtracao,
} from '../../src/composition/orquestracao.js';

/** Guarda simétrica a `tests/composition/busca-indexacao.test.ts` (#623). Nenhum I/O acontece aqui. */
function stub<T>(): T {
  return {} as T;
}

describe('composition root de orquestracao', () => {
  it('criarRegistrarContextoClassificacao constrói o caso de uso e a acl', () => {
    const modulo = criarRegistrarContextoClassificacao({ db: stub<NodePgDatabase>() });

    expect(modulo.registrarContextoClassificacao).toBeDefined();
    expect(modulo.acl).toBeDefined();
  });

  it('criarRegistrarContextoExtracao constrói o caso de uso e a acl', () => {
    const modulo = criarRegistrarContextoExtracao({ db: stub<NodePgDatabase>() });

    expect(modulo.registrarContextoExtracao).toBeDefined();
    expect(modulo.acl).toBeDefined();
  });

  it('criarConsolidarEDecidirWorkflow constrói o caso de uso e a acl', () => {
    const modulo = criarConsolidarEDecidirWorkflow({
      db: stub<NodePgDatabase>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      bedrock: stub<BedrockRuntimeClient>(),
      modeloOrquestradorId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });

    expect(modulo.consolidarEDecidirWorkflow).toBeDefined();
    expect(modulo.acl).toBeDefined();
  });
});
