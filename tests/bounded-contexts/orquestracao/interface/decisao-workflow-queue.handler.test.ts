import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarDecisaoWorkflowQueueHandler } from '../../../../src/bounded-contexts/orquestracao/interface/events/decisao-workflow-queue.handler.js';
import { OrcamentoValidadoEventACL } from '../../../../src/bounded-contexts/orquestracao/infrastructure/orcamento-validado-event.acl.js';
import type { ConsolidarEDecidirWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.js';

const TENANT_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const ORCAMENTO_ID_1 = '01890a5d-ac96-774b-bcce-b302099a8058';
const ORCAMENTO_ID_2 = '01890a5d-ac96-774b-bcce-b302099a8059';
const ORCAMENTO_ID_FALHA = '01890a5d-ac96-774b-bcce-b302099a805a';
const ORCAMENTO_ID_OK = '01890a5d-ac96-774b-bcce-b302099a805b';

function useCaseFake(
  executar: (payloadBruto: unknown) => Promise<void>,
): ConsolidarEDecidirWorkflow {
  return { executar } as unknown as ConsolidarEDecidirWorkflow;
}

function payloadValido(orcamentoId: string, detailType: string, tenantId?: string | null) {
  return {
    orcamentoId,
    detailType,
    ...(detailType === 'OrcamentoValidadoComRessalva'
      ? { inconsistencias: [{ regra: 'preco-fora-da-faixa', detalhe: 'item 1 acima do limite' }] }
      : {}),
    ...(tenantId === null ? {} : { tenantId: tenantId ?? TENANT_ID }),
  };
}

function envelopeEventBridge(
  detailType: 'OrcamentoValidado' | 'OrcamentoValidadoComRessalva',
  orcamentoId: string,
  tenantId: string | null = TENANT_ID,
): string {
  return JSON.stringify({
    'detail-type': detailType,
    detail: payloadValido(orcamentoId, detailType, tenantId),
  });
}

function loggerDeTeste() {
  const linhas: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (linha: string) => linhas.push(JSON.parse(linha) as Record<string, unknown>) },
  );
  return { logger, linhas };
}

describe('criarDecisaoWorkflowQueueHandler', () => {
  it('invoca ConsolidarEDecidirWorkflow.executar com o detail bruto para cada mensagem, aceitando os 2 detail-types', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_1) },
        {
          messageId: 'm2',
          body: envelopeEventBridge('OrcamentoValidadoComRessalva', ORCAMENTO_ID_2),
        },
      ],
    });

    expect(executar).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ orcamentoId: ORCAMENTO_ID_1 }),
    );
    expect(executar).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ orcamentoId: ORCAMENTO_ID_2 }),
    );
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens — ex.: ContextoIncompletoError (entrega fora de ordem)', async () => {
    const executar = vi.fn().mockImplementation(async (payloadBruto: unknown) => {
      const { orcamentoId } = payloadBruto as { orcamentoId: string };
      if (orcamentoId === ORCAMENTO_ID_FALHA) {
        throw new Error('ContextoIncompletoError: contexto ainda não consolidado');
      }
    });
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_FALHA) },
        { messageId: 'm2', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_OK) },
      ],
    });

    expect(executar).toHaveBeenCalledTimes(2);
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('reporta falha (nunca lança) se o corpo não for um envelope EventBridge válido', async () => {
    const executar = vi.fn();
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: '{"algo":"invalido"}' },
        {
          messageId: 'm2',
          body: JSON.stringify({ 'detail-type': 'TipoDesconhecido', detail: {} }),
        },
      ],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([
      { itemIdentifier: 'm1' },
      { itemIdentifier: 'm2' },
    ]);
  });

  it('reporta falha se o corpo não for JSON válido', async () => {
    const executar = vi.fn();
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({ Records: [{ messageId: 'm1', body: 'não é json' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('(ADR-008/#632) rejeita via ACL (batch item failure) quando tenantId está ausente no envelope', async () => {
    const executar = vi.fn();
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_1, null) },
      ],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('correlaciona todo log por orcamentoId, tenantId e messageId', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarDecisaoWorkflowQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
      logger,
    );

    await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_1) },
      ],
    });

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.orcamentoId).toBe(ORCAMENTO_ID_1);
      expect(linha.tenantId).toBe(TENANT_ID);
      expect(linha.messageId).toBe('m1');
    }
  });
});
