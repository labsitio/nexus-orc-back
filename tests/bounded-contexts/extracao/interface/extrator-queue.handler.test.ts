import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarExtratorQueueHandler } from '../../../../src/bounded-contexts/extracao/interface/events/extrator-queue.handler.js';
import type {
  ExtrairDadosOrcamento,
  ExtrairDadosOrcamentoParams,
} from '../../../../src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.js';

function useCaseFake(
  executar: (params: ExtrairDadosOrcamentoParams) => Promise<void>,
): ExtrairDadosOrcamento {
  return { executar } as unknown as ExtrairDadosOrcamento;
}

function envelopeEventBridge(orcamentoId: string): string {
  return JSON.stringify({
    detail: {
      orcamentoId,
      resultado: {
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      },
      referenciaBruta: {
        bucket: 'nexo-orcamentos-raw',
        key: `portal-web/${orcamentoId}.pdf`,
        versionId: 'v1',
      },
    },
  });
}

/** Logger pino real gravando em memória — permite inspecionar os campos logados (correlação). */
function loggerDeTeste() {
  const linhas: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (linha: string) => linhas.push(JSON.parse(linha) as Record<string, unknown>) },
  );
  return { logger, linhas };
}

describe('criarExtratorQueueHandler', () => {
  it('invoca ExtrairDadosOrcamento para cada mensagem com os dados extraídos do envelope EventBridge', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarExtratorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-1') },
        { messageId: 'm2', body: envelopeEventBridge('id-2') },
      ],
    });

    expect(executar).toHaveBeenNthCalledWith(1, {
      orcamentoId: 'id-1',
      referenciaClassificacao: {
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      },
      referenciaBrutaS3: {
        bucket: 'nexo-orcamentos-raw',
        key: 'portal-web/id-1.pdf',
        versionId: 'v1',
      },
    });
    expect(executar).toHaveBeenNthCalledWith(2, expect.objectContaining({ orcamentoId: 'id-2' }));
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens', async () => {
    const executar = vi.fn().mockImplementation(async (params: ExtrairDadosOrcamentoParams) => {
      if (params.orcamentoId === 'id-falha') {
        throw new Error('extração falhou');
      }
    });
    const handler = criarExtratorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-falha') },
        { messageId: 'm2', body: envelopeEventBridge('id-ok') },
      ],
    });

    expect(executar).toHaveBeenCalledTimes(2);
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('reporta falha (nunca lança) se o corpo da mensagem não for um envelope EventBridge válido', async () => {
    const executar = vi.fn();
    const handler = criarExtratorQueueHandler(useCaseFake(executar));

    const resposta = await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('reporta falha se o envelope não contiver referenciaBruta (ADR-003 exige o ponteiro S3)', async () => {
    const executar = vi.fn();
    const handler = criarExtratorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        {
          messageId: 'm1',
          body: JSON.stringify({
            detail: {
              orcamentoId: 'id-1',
              resultado: {
                fornecedorIdentificado: 'Fornecedor X',
                formatoIdentificado: 'PDF',
                agenteOrigem: 'CLASSIFICADOR',
              },
            },
          }),
        },
      ],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('correlaciona todo log por orcamentoId e messageId', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarExtratorQueueHandler(useCaseFake(executar), logger);

    await handler({ Records: [{ messageId: 'm1', body: envelopeEventBridge('id-1') }] });

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.orcamentoId).toBe('id-1');
      expect(linha.messageId).toBe('m1');
    }
  });

  it('loga erro correlacionado por messageId mesmo sem orcamentoId extraído (envelope inválido)', async () => {
    const { logger, linhas } = loggerDeTeste();
    const handler = criarExtratorQueueHandler(useCaseFake(vi.fn()), logger);

    await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.level).toBe(50); // pino: nível "error"
    expect(linhas[0]?.messageId).toBe('m1');
  });

  it('entrega duplicada (at-least-once) é idempotente por design do caso de uso — handler não precisa de tratamento especial', async () => {
    // ExtrairDadosOrcamento.executar já retorna cedo (sem throw) quando a
    // extração não está mais em PENDENTE — diferente do handler análogo de
    // spec-001, que trata TransicaoInvalidaError. Aqui basta confirmar que
    // um retorno normal (void) nunca vira batch item failure.
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarExtratorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeEventBridge('id-ja-processado') }],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
  });
});
