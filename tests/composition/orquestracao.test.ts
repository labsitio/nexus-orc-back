import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import {
  criarConsolidarEDecidirWorkflow,
  criarRegistrarContextoClassificacao,
  criarRegistrarContextoExtracao,
  selecionarAgenteOrquestrador,
} from '../../src/composition/orquestracao.js';
import { BedrockOrquestradorGateway } from '../../src/bounded-contexts/orquestracao/infrastructure/bedrock-orquestrador.gateway.js';
import { OllamaOrquestradorGateway } from '../../src/bounded-contexts/orquestracao/infrastructure/ollama-orquestrador.gateway.js';

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

/**
 * `selecionarAgenteOrquestrador` (issue #621, ADR-009) — única leitura de
 * `NEXO_AGENTE_IA` desta composition root. Injeta o valor por parâmetro em
 * vez de `process.env` para não deixar teste dependente de ordem de execução
 * (simétrico a `tests/composition/extracao.test.ts`, issue #619).
 */
describe('selecionarAgenteOrquestrador', () => {
  it('NEXO_AGENTE_IA=bedrock constrói BedrockOrquestradorGateway', () => {
    const gateway = selecionarAgenteOrquestrador(
      { bedrock: { client: stub<BedrockRuntimeClient>(), modelId: 'modelo-x' } },
      'bedrock',
    );
    expect(gateway).toBeInstanceOf(BedrockOrquestradorGateway);
  });

  it('NEXO_AGENTE_IA=local constrói OllamaOrquestradorGateway', () => {
    const gateway = selecionarAgenteOrquestrador(
      { ollama: { baseUrl: 'http://localhost:11434', modelo: 'qwen2.5:7b' } },
      'local',
    );
    expect(gateway).toBeInstanceOf(OllamaOrquestradorGateway);
  });

  it('NEXO_AGENTE_IA=local sem config.ollama usa defaults (baseUrl/modelo padrão)', () => {
    const gateway = selecionarAgenteOrquestrador({}, 'local');
    expect(gateway).toBeInstanceOf(OllamaOrquestradorGateway);
  });

  it('lança erro se NEXO_AGENTE_IA=bedrock sem config.bedrock', () => {
    expect(() => selecionarAgenteOrquestrador({}, 'bedrock')).toThrow(/config.bedrock/);
  });

  it('falha rápido se NEXO_AGENTE_IA estiver ausente ou com valor inválido', () => {
    expect(() => selecionarAgenteOrquestrador({}, undefined)).toThrow(/local.*bedrock/);
    expect(() => selecionarAgenteOrquestrador({}, 'outro')).toThrow(/local.*bedrock/);
  });
});
