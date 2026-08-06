import type { AgenteEmbeddingGateway } from '../domain/gateways/agente-embedding.gateway.js';
import type { Embedding } from '../domain/value-objects/embedding.vo.js';
import { OllamaEmbeddingACL, ehEmbeddingBrutoOllama } from './ollama-embedding.acl.js';

interface RespostaOllamaEmbed {
  readonly embeddings?: ReadonlyArray<readonly unknown[]>;
}

function primeiroEmbeddingBruto(corpo: RespostaOllamaEmbed): unknown {
  if (!Array.isArray(corpo.embeddings) || corpo.embeddings.length === 0) {
    return undefined;
  }
  return { embedding: corpo.embeddings[0] };
}

/**
 * Implementa `AgenteEmbeddingGateway` sobre a API HTTP do Ollama
 * (`POST /api/embed`) — alternativa local ao `BedrockEmbeddingGateway`
 * (ADR-009, issue #620, `docs/plano-infra-ambientes.md` §5). Mesma
 * disciplina de ACL: este gateway nunca constrói o VO `Embedding`
 * diretamente — a tradução e a validação de dimensão são delegadas a
 * `OllamaEmbeddingACL`.
 *
 * Restrição exclusiva desta porta (diferente das demais portas de IA, que
 * são texto-para-texto): o schema pgvector já existente
 * (`indice-orcamento.schema.ts:54`) fixa vetores de exatamente 1024
 * dimensões. Só `mxbai-embed-large` produz essa dimensionalidade entre os
 * modelos de embedding do Ollama — `nomic-embed-text` (768) não serve.
 *
 * PoC de realismo de ambiente (docs/plano-infra-ambientes.md §5) — não prova
 * qualidade semântica do embedding local comparada ao Titan V2 real: índices
 * gerados com este gateway não são intercambiáveis com os de produção
 * (ver `docs/poc-ollama-embedding.md`).
 */
export class OllamaEmbeddingGateway implements AgenteEmbeddingGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly modelo: string,
    private readonly acl: OllamaEmbeddingACL = new OllamaEmbeddingACL(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async gerarEmbedding(texto: string): Promise<Embedding> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Inferência em CPU pode ser lenta no primeiro carregamento do modelo —
      // 60s evita travar indefinidamente se o Ollama não responder.
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: this.modelo, input: texto }),
    });

    if (!resposta.ok) {
      throw new Error(
        `OllamaEmbeddingGateway: requisição ao Ollama falhou com status ${resposta.status}`,
      );
    }

    const corpo = (await resposta.json()) as RespostaOllamaEmbed;
    const bruto = primeiroEmbeddingBruto(corpo);

    if (!ehEmbeddingBrutoOllama(bruto)) {
      throw new Error(
        'OllamaEmbeddingGateway: resposta do modelo não contém um vetor de embedding válido ' +
          '("embeddings" ausente, vazio ou com item não numérico)',
      );
    }

    return this.acl.converter(bruto, this.modelo);
  }
}
