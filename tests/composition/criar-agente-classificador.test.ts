import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';
import { criarAgenteClassificador } from '../../src/composition/ingestao-identificacao.js';
import { BedrockClassificadorGateway } from '../../src/bounded-contexts/ingestao-identificacao/infrastructure/bedrock-classificador.gateway.js';
import { OllamaClassificadorGateway } from '../../src/bounded-contexts/ingestao-identificacao/infrastructure/ollama-classificador.gateway.js';

/**
 * `criarAgenteClassificador` é o ponto único de seleção de gateway de IA por
 * `NEXO_AGENTE_IA` (issue #617, ADR-009) — nunca `if` espalhado no domínio.
 */
describe('criarAgenteClassificador', () => {
  it('agenteIa "local" devolve OllamaClassificadorGateway com defaults sensatos', () => {
    const gateway = criarAgenteClassificador({ agenteIa: 'local' });
    expect(gateway).toBeInstanceOf(OllamaClassificadorGateway);
  });

  it('agenteIa "local" aceita baseUrl e modelo customizados', () => {
    const gateway = criarAgenteClassificador({
      agenteIa: 'local',
      ollamaBaseUrl: 'http://ollama:11434',
      ollamaModeloClassificador: 'qwen2.5:7b',
    });
    expect(gateway).toBeInstanceOf(OllamaClassificadorGateway);
  });

  it('agenteIa "bedrock" devolve BedrockClassificadorGateway quando cliente e modelId estão presentes', () => {
    const bedrock = {} as BedrockRuntimeClient;
    const gateway = criarAgenteClassificador({
      agenteIa: 'bedrock',
      bedrock,
      bedrockModeloClassificadorId: 'arn:aws:bedrock:us-east-1::foundation-model/exemplo',
    });
    expect(gateway).toBeInstanceOf(BedrockClassificadorGateway);
  });

  it('agenteIa "bedrock" sem cliente/modelId falha rápido em vez de devolver gateway inválido', () => {
    expect(() => criarAgenteClassificador({ agenteIa: 'bedrock' })).toThrow(
      /cliente Bedrock e modelId/,
    );
  });
});
