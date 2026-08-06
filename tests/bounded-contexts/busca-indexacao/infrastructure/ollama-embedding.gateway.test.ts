import { describe, expect, it, vi } from 'vitest';
import { OllamaEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/ollama-embedding.gateway.js';

function fetchFake(status: number, corpo: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }) as unknown as typeof fetch;
}

function vetor(dimensao: number, valor = 0.1): number[] {
  return Array.from({ length: dimensao }, () => valor);
}

function respostaOllamaEmbed(embeddings: number[][]): unknown {
  return { embeddings };
}

describe('OllamaEmbeddingGateway', () => {
  it('gerarEmbedding chama POST /api/embed e devolve VO Embedding traduzido pela ACL', async () => {
    const fetchImpl = fetchFake(200, respostaOllamaEmbed([vetor(1024)]));
    const gateway = new OllamaEmbeddingGateway(
      'http://localhost:11434',
      'mxbai-embed-large',
      undefined,
      fetchImpl,
    );

    const resultado = await gateway.gerarEmbedding('descrição do item do orçamento');

    expect(resultado.dimensao).toBe(1024);
    expect(resultado.vetor).toHaveLength(1024);
    expect(resultado.modeloId).toBe('mxbai-embed-large');

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toBe('http://localhost:11434/api/embed');
    const corpoRequisicao = JSON.parse(init.body) as { model: string; input: string };
    expect(corpoRequisicao.model).toBe('mxbai-embed-large');
    expect(corpoRequisicao.input).toBe('descrição do item do orçamento');
  });

  it('lança erro se a requisição HTTP falhar', async () => {
    const fetchImpl = fetchFake(500, {});
    const gateway = new OllamaEmbeddingGateway(
      'http://localhost:11434',
      'mxbai-embed-large',
      undefined,
      fetchImpl,
    );

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/status 500/);
  });

  it('lança erro se "embeddings" estiver ausente ou vazio (nunca confia cegamente no modelo)', async () => {
    const fetchImpl = fetchFake(200, {});
    const gateway = new OllamaEmbeddingGateway(
      'http://localhost:11434',
      'mxbai-embed-large',
      undefined,
      fetchImpl,
    );

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/vetor de embedding válido/);
  });

  /**
   * Restrição dura da issue #620: se o modelo Ollama configurado devolver
   * dimensionalidade diferente de 1024 (ex.: `nomic-embed-text`, 768), o
   * gateway tem que falhar explicitamente, nunca truncar/normalizar o vetor
   * em silêncio — vetor de dimensão errada corrompe a busca semântica sem
   * erro visível.
   */
  it('lança erro explícito se o modelo devolver vetor com dimensão diferente de 1024', async () => {
    const fetchImpl = fetchFake(200, respostaOllamaEmbed([vetor(768)]));
    const gateway = new OllamaEmbeddingGateway(
      'http://localhost:11434',
      'nomic-embed-text',
      undefined,
      fetchImpl,
    );

    await expect(gateway.gerarEmbedding('texto')).rejects.toThrow(/1024/);
  });
});
