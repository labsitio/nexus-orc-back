import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarClassificadorQueueHandler } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.handler.js';
import { TransicaoInvalidaError } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import {
  TenantDivergenciaError,
  type ClassificarOrcamento,
} from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.js';

function useCaseFake(
  executar: (orcamentoId: string, tenantId?: unknown) => Promise<void>,
): ClassificarOrcamento {
  return { executar } as unknown as ClassificarOrcamento;
}

function envelopeEventBridge(orcamentoId: string, tenantId?: string): string {
  return JSON.stringify({ detail: { orcamentoId, tenantId } });
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

describe('criarClassificadorQueueHandler', () => {
  it('invoca ClassificarOrcamento para cada mensagem com orcamentoId e tenantId extraídos do envelope EventBridge', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarClassificadorQueueHandler(useCaseFake(executar));

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-1', undefined) },
        { messageId: 'm2', body: envelopeEventBridge('id-2', undefined) },
      ],
    });

    // (spec 007, T017) tenantId é undefined durante transição (T015 não implementado);
    // no use case, isso resulta em 404 (divergência de tenant — agregado não tem tenantId).
    expect(executar).toHaveBeenNthCalledWith(1, 'id-1', undefined);
    expect(executar).toHaveBeenNthCalledWith(2, 'id-2', undefined);
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
        { messageId: 'm1', body: envelopeEventBridge('id-falha', undefined) },
        { messageId: 'm2', body: envelopeEventBridge('id-ok', undefined) },
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

  it('correlaciona todo log por orcamentoId e messageId (T036)', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarClassificadorQueueHandler(useCaseFake(executar), logger);

    await handler({ Records: [{ messageId: 'm1', body: envelopeEventBridge('id-1') }] });

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.orcamentoId).toBe('id-1');
      expect(linha.messageId).toBe('m1');
    }
  });

  it('loga erro correlacionado por messageId mesmo sem orcamentoId extraído (envelope inválido)', async () => {
    const { logger, linhas } = loggerDeTeste();
    const handler = criarClassificadorQueueHandler(useCaseFake(vi.fn()), logger);

    await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.level).toBe(50); // pino: nível "error"
    expect(linhas[0]?.messageId).toBe('m1');
  });

  it('trata TransicaoInvalidaError como sucesso idempotente (redelivery SQS at-least-once), nunca como batch item failure', async () => {
    const executar = vi
      .fn()
      .mockRejectedValue(
        new TransicaoInvalidaError('CLASSIFICADO', 'registrarTentativaClassificador'),
      );
    const { logger, linhas } = loggerDeTeste();
    const handler = criarClassificadorQueueHandler(useCaseFake(executar), logger);

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeEventBridge('id-ja-processado') }],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
    expect(linhas.some((linha) => linha.level === 50)).toBe(false);
  });

  it('trata TenantDivergenciaError (AUSENTE) como sucesso idempotente, logando warn (não info) com o motivo (fix #640)', async () => {
    const tenantIdSolicitante = '018f0c1a-1111-7000-8000-000000000001';
    const executar = vi
      .fn()
      .mockRejectedValue(
        new TenantDivergenciaError('id-legado', 'AUSENTE', undefined, tenantIdSolicitante),
      );
    const { logger, linhas } = loggerDeTeste();
    const handler = criarClassificadorQueueHandler(useCaseFake(executar), logger);

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeEventBridge('id-legado', tenantIdSolicitante) }],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
    const linhaDivergencia = linhas.find((linha) => linha.motivo === 'AUSENTE');
    expect(linhaDivergencia?.level).toBe(40); // pino: nível "warn"
    expect(linhaDivergencia?.orcamentoId).toBe('id-legado');
    expect(linhaDivergencia?.tenantIdSolicitante).toBe(tenantIdSolicitante);
    expect(linhaDivergencia?.level).not.toBe(30); // nunca info
  });

  it('trata TenantDivergenciaError (DIVERGENTE, cross-tenant) como sucesso idempotente, logando error com os dois tenantId (fix #640)', async () => {
    const tenantIdAgregado = '018f0c1a-1111-7000-8000-000000000001';
    const tenantIdSolicitante = '018f0c1a-2222-7000-8000-000000000002';
    const executar = vi
      .fn()
      .mockRejectedValue(
        new TenantDivergenciaError(
          'id-cross-tenant',
          'DIVERGENTE',
          tenantIdAgregado,
          tenantIdSolicitante,
        ),
      );
    const { logger, linhas } = loggerDeTeste();
    const handler = criarClassificadorQueueHandler(useCaseFake(executar), logger);

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('id-cross-tenant', tenantIdSolicitante) },
      ],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
    const linhaDivergencia = linhas.find((linha) => linha.motivo === 'DIVERGENTE');
    expect(linhaDivergencia?.level).toBe(50); // pino: nível "error"
    expect(linhaDivergencia?.orcamentoId).toBe('id-cross-tenant');
    expect(linhaDivergencia?.tenantIdAgregado).toBe(tenantIdAgregado);
    expect(linhaDivergencia?.tenantIdSolicitante).toBe(tenantIdSolicitante);
    expect(linhaDivergencia?.level).not.toBe(30); // nunca info
  });
});
