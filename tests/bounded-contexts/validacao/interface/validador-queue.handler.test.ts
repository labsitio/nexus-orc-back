import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarValidadorQueueHandler } from '../../../../src/bounded-contexts/validacao/interface/events/validador-queue.handler.js';
import type { ValidarOrcamento } from '../../../../src/bounded-contexts/validacao/application/use-cases/validar-orcamento.js';

function useCaseFake(executar: (payloadBruto: unknown) => Promise<void>): ValidarOrcamento {
  return { executar } as unknown as ValidarOrcamento;
}

function envelopeEventBridge(orcamentoId: string): string {
  return JSON.stringify({
    detail: {
      orcamentoId,
      cnpjFornecedor: '11222333000181',
      itens: [],
      condicoesComerciais: '30/60/90 dias',
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

describe('criarValidadorQueueHandler', () => {
  it('invoca ValidarOrcamento.executar com o detail bruto do envelope EventBridge, para cada mensagem', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarValidadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-1') },
        { messageId: 'm2', body: envelopeEventBridge('id-2') },
      ],
    });

    expect(executar).toHaveBeenNthCalledWith(1, expect.objectContaining({ orcamentoId: 'id-1' }));
    expect(executar).toHaveBeenNthCalledWith(2, expect.objectContaining({ orcamentoId: 'id-2' }));
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens', async () => {
    const executar = vi.fn().mockImplementation(async (payloadBruto: unknown) => {
      const { orcamentoId } = payloadBruto as { orcamentoId: string };
      if (orcamentoId === 'id-falha') {
        throw new Error('validação falhou');
      }
    });
    const handler = criarValidadorQueueHandler(useCaseFake(executar));

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
    const handler = criarValidadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('reporta falha se o corpo não for JSON válido', async () => {
    const executar = vi.fn();
    const handler = criarValidadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({ Records: [{ messageId: 'm1', body: 'não é json' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('correlaciona todo log por orcamentoId e messageId', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarValidadorQueueHandler(useCaseFake(executar), logger);

    await handler({ Records: [{ messageId: 'm1', body: envelopeEventBridge('id-1') }] });

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.orcamentoId).toBe('id-1');
      expect(linha.messageId).toBe('m1');
    }
  });

  it('loga erro correlacionado por messageId mesmo sem orcamentoId extraído (envelope inválido)', async () => {
    const { logger, linhas } = loggerDeTeste();
    const handler = criarValidadorQueueHandler(useCaseFake(vi.fn()), logger);

    await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.level).toBe(50); // pino: nível "error"
    expect(linhas[0]?.messageId).toBe('m1');
  });

  it('entrega duplicada (at-least-once) é idempotente por design do caso de uso — handler não precisa de tratamento especial', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarValidadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeEventBridge('id-ja-processado') }],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
  });
});
