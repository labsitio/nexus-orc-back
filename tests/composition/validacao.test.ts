import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { criarValidacao } from '../../src/composition/validacao.js';

/**
 * Guarda simétrica à de `extracao.test.ts`: se `criarValidacao` deixar de
 * construir algum caso de uso (renomear dependência, esquecer de injetar um
 * gateway), o wiring quebra em silêncio até alguém rodar em produção.
 * Nenhum I/O acontece aqui — os repositórios/gateways concretos só conectam
 * sob demanda.
 */
function stub<T>(): T {
  return {} as T;
}

describe('composition root de validacao', () => {
  it('constrói os casos de uso com os stubs injetados', () => {
    const modulo = criarValidacao({
      db: stub<NodePgDatabase>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      bedrock: stub<BedrockRuntimeClient>(),
      modeloCategorizacaoId: 'modelo-x',
      fornecedorCadastradoBaseUrl: 'http://fornecedor-cadastrado.exemplo',
    });

    expect(modulo.validarOrcamento).toBeDefined();
    expect(modulo.consultarStatusValidacao).toBeDefined();
    expect(modulo.registrarDecisaoHumanaValidacao).toBeDefined();
  });
});
