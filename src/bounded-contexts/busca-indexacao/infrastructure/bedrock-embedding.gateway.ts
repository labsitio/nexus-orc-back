import { InvokeModelCommand, type BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { AgenteEmbeddingGateway } from '../domain/gateways/agente-embedding.gateway.js';
import type { Embedding } from '../domain/value-objects/embedding.vo.js';
import {
  BedrockEmbeddingACL,
  DIMENSAO_EMBEDDING_TITAN_V2,
  ehEmbeddingBruto,
} from './bedrock-embedding.acl.js';

const decodificadorUtf8 = new TextDecoder();

/**
 * Implementa `AgenteEmbeddingGateway` sobre o Bedrock InvokeModel API usando
 * Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`, plan.md).
 * Diferente de `BedrockClassificadorGateway`/`BedrockExtratorGateway` (spec
 * 001/002), modelos de embedding não expõem tool-use/Converse API — a
 * chamada é InvokeModel com corpo `{ inputText, dimensions, normalize }` e a
 * resposta já é o vetor bruto, sem passo de "ferramenta". A tradução do JSON
 * bruto para o VO `Embedding` é delegada a `BedrockEmbeddingACL` — este
 * gateway nunca constrói o VO diretamente (mesma disciplina de ACL das
 * specs 001–003).
 */
export class BedrockEmbeddingGateway implements AgenteEmbeddingGateway {
  constructor(
    private readonly bedrock: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly acl: BedrockEmbeddingACL = new BedrockEmbeddingACL(),
  ) {}

  async gerarEmbedding(texto: string): Promise<Embedding> {
    const resposta = await this.bedrock.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: texto,
          dimensions: DIMENSAO_EMBEDDING_TITAN_V2,
          normalize: true,
        }),
      }),
    );

    if (!resposta.body) {
      throw new Error('BedrockEmbeddingGateway: resposta do modelo sem corpo');
    }

    const bruto: unknown = JSON.parse(decodificadorUtf8.decode(resposta.body));

    if (!ehEmbeddingBruto(bruto)) {
      throw new Error(
        'BedrockEmbeddingGateway: resposta do modelo não contém um vetor de embedding válido',
      );
    }

    return this.acl.converter(bruto, this.modelId);
  }
}
