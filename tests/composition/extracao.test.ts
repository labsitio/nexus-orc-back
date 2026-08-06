import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { criarExtracao, selecionarAgenteExtrator } from '../../src/composition/extracao.js';
import { BedrockExtratorGateway } from '../../src/bounded-contexts/extracao/infrastructure/bedrock-extrator.gateway.js';
import { OllamaExtratorGateway } from '../../src/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.js';

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

/**
 * `selecionarAgenteExtrator` (issue #619, ADR-009) — única leitura de
 * `NEXO_AGENTE_IA` desta composition root. Injeta o valor por parâmetro em
 * vez de `process.env` para não deixar teste dependente de ordem de execução.
 */
describe('selecionarAgenteExtrator', () => {
  it('NEXO_AGENTE_IA=bedrock constrói BedrockExtratorGateway', () => {
    const gateway = selecionarAgenteExtrator(
      { bedrock: { client: stub<BedrockRuntimeClient>(), modelId: 'modelo-x' } },
      'bedrock',
    );
    expect(gateway).toBeInstanceOf(BedrockExtratorGateway);
  });

  it('NEXO_AGENTE_IA=local constrói OllamaExtratorGateway', () => {
    const gateway = selecionarAgenteExtrator(
      { ollama: { baseUrl: 'http://localhost:11434', modelo: 'qwen2.5:7b' } },
      'local',
    );
    expect(gateway).toBeInstanceOf(OllamaExtratorGateway);
  });

  it('lança erro se NEXO_AGENTE_IA=bedrock sem config.bedrock', () => {
    expect(() => selecionarAgenteExtrator({}, 'bedrock')).toThrow(/config.bedrock/);
  });

  it('lança erro se NEXO_AGENTE_IA=local sem config.ollama', () => {
    expect(() => selecionarAgenteExtrator({}, 'local')).toThrow(/config.ollama/);
  });

  it('falha rápido se NEXO_AGENTE_IA estiver ausente ou com valor inválido', () => {
    expect(() => selecionarAgenteExtrator({}, undefined)).toThrow(/local.*bedrock/);
    expect(() => selecionarAgenteExtrator({}, 'outro')).toThrow(/local.*bedrock/);
  });
});
