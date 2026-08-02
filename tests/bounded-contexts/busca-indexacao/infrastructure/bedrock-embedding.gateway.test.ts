import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';
import { DIMENSAO_EMBEDDING_TITAN_V2 } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.acl.js';
import { BedrockEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.gateway.js';

function bedrockClientFake(send: (command: unknown) => unknown): BedrockRuntimeClient {
  return { send } as unknown as BedrockRuntimeClient;
}

function respostaInvokeModel(corpo: unknown): { body: Uint8Array } {
  return { body: new TextEncoder().encode(JSON.stringify(corpo)) };
}

function vetor(dimensao: number, valor = 0.1): number[] {
  return Array.from({ length: dimensao }, () => valor);
}

describe('BedrockEmbeddingGateway', () => {
  it('gerarEmbedding invoca o InvokeModel API com inputText/dimensions/normalize e devolve o VO Embedding', async () => {
    const send = vi
      .fn()
      .mockResolvedValue(
        respostaInvokeModel({
          embedding: vetor(DIMENSAO_EMBEDDING_TITAN_V2),
          inputTextTokenCount: 12,
        }),
      );
    const gateway = new BedrockEmbeddingGateway(
      bedrockClientFake(send),
      'amazon.titan-embed-text-v2:0',
    );

    const resultado = await gateway.gerarEmbedding('conteúdo indexável de exemplo');

    expect(resultado.dimensao).toBe(DIMENSAO_EMBEDDING_TITAN_V2);
    expect(resultado.modeloId).toBe('amazon.titan-embed-text-v2:0');

    const comando = send.mock.calls[0]?.[0] as {
      input: { modelId: string; body: string };
    };
    expect(comando.input.modelId).toBe('amazon.titan-embed-text-v2:0');
    const corpoEnviado = JSON.parse(comando.input.body) as {
      inputText: string;
      dimensions: number;
      normalize: boolean;
    };
    expect(corpoEnviado.inputText).toBe('conteúdo indexável de exemplo');
    expect(corpoEnviado.dimensions).toBe(DIMENSAO_EMBEDDING_TITAN_V2);
    expect(corpoEnviado.normalize).toBe(true);
  });

  it('lança erro se a resposta não tiver corpo', async () => {
    const send = vi.fn().mockResolvedValue({});
    const gateway = new BedrockEmbeddingGateway(bedrockClientFake(send), 'modelo-x');

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/sem corpo/i);
  });

  it('lança erro se o corpo da resposta não contiver um vetor de embedding válido', async () => {
    const send = vi.fn().mockResolvedValue(respostaInvokeModel({ mensagem: 'erro qualquer' }));
    const gateway = new BedrockEmbeddingGateway(bedrockClientFake(send), 'modelo-x');

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/vetor de embedding válido/i);
  });

  it('propaga BedrockEmbeddingACLInvalidaError quando a dimensão devolvida não bate com a esperada', async () => {
    const send = vi.fn().mockResolvedValue(respostaInvokeModel({ embedding: vetor(256) }));
    const gateway = new BedrockEmbeddingGateway(bedrockClientFake(send), 'modelo-x');

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/BedrockEmbeddingACL/);
  });
});
