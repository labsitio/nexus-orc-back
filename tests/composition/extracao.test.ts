import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { criarExtracao } from '../../src/composition/extracao.js';

/**
 * Guarda simétrica à de `ingestao-identificacao.test.ts`: se
 * `criarExtracao` deixar de construir `extrairDadosOrcamento` (renomear
 * dependência, esquecer de injetar um gateway), o wiring quebra em silêncio
 * até alguém rodar o poller local. Nenhum I/O acontece aqui — os
 * repositórios/gateways concretos só conectam sob demanda.
 */
function stub<T>(): T {
  return {} as T;
}

describe('composition root de extracao', () => {
  it('constrói extrairDadosOrcamento com os stubs injetados', () => {
    const modulo = criarExtracao({
      db: stub<NodePgDatabase>(),
      s3: stub<S3Client>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      extrator: { extrair: async () => ({}) as never },
      conversor: { converter: async () => '' },
    });

    expect(modulo.extrairDadosOrcamento).toBeDefined();
  });
});
