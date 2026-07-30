import { describe, expect, it, vi } from 'vitest';
import { criarClassificadorQueueHandler } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.handler.js';
import type { ClassificarOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.js';

function useCaseFake(executar: (orcamentoId: string) => Promise<void>): ClassificarOrcamento {
  return { executar } as unknown as ClassificarOrcamento;
}

function envelopeEventBridge(orcamentoId: string): string {
  return JSON.stringify({ detail: { orcamentoId } });
}

describe('criarClassificadorQueueHandler', () => {
  it('invoca ClassificarOrcamento para cada mensagem com o orcamentoId extraído do envelope EventBridge', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarClassificadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-1') },
        { messageId: 'm2', body: envelopeEventBridge('id-2') },
      ],
    });

    expect(executar).toHaveBeenNthCalledWith(1, 'id-1');
    expect(executar).toHaveBeenNthCalledWith(2, 'id-2');
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens', async () => {
    const executar = vi.fn().mockImplementation(async (orcamentoId: string) => {
      if (orcamentoId === 'id-falha') {
        throw new Error('classificação falhou');
      }
    });
    const handler = criarClassificadorQueueHandler(useCaseFake(executar));

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
    const handler = criarClassificadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });
});
