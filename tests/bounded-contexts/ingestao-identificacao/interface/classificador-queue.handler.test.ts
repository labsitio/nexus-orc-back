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

const DEFAULT_TENANT_ID = '018f0c1a-0000-7000-8000-000000000000';

function envelopeEventBridge(
  orcamentoId: string,
  tenantId: string | undefined = DEFAULT_TENANT_ID,
): string {
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
        { messageId: 'm1', body: envelopeEventBridge('id-1') },
        { messageId: 'm2', body: envelopeEventBridge('id-2') },
      ],
    });

    // (spec 007, ADR-008 — cutover de contract, #632) tenantId é obrigatório
    // no envelope desde schemaVersion 2 — sempre um TenantId concreto aqui.
    expect(executar).toHaveBeenCalledTimes(2);
    const [orcamentoId1, tenantId1] = executar.mock.calls[0] as [string, { toString(): string }];
    expect(orcamentoId1).toBe('id-1');
    expect(tenantId1.toString()).toBe(DEFAULT_TENANT_ID);
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('rejeita (batch item failure) quando tenantId está ausente no envelope — obrigatório desde o cutover de contract (#632, ADR-008)', async () => {
    const executar = vi.fn();
    const handler = criarClassificadorQueueHandler(useCaseFake(executar));
    const envelopeSemTenantId = JSON.stringify({ detail: { orcamentoId: 'id-1' } });

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeSemTenantId }],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
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

  it('trata TenantDivergenciaError (AUSENTE) sem batch item failure, mas loga error (nunca warn/info) — ADR-011', async () => {
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

    // Controle de fluxo da fila não muda (fix #640/#280/T017, mantido): estado
    // permanente, retry não resolve, então continua sem batchItemFailures/DLQ.
    expect(resposta.batchItemFailures).toHaveLength(0);
    const linhaDivergencia = linhas.find((linha) => linha.motivo === 'AUSENTE');
    expect(linhaDivergencia?.level).toBe(50); // pino: nível "error" (ADR-011)
    expect(linhaDivergencia?.orcamentoId).toBe('id-legado');
    expect(linhaDivergencia?.tenantIdSolicitante).toBe(tenantIdSolicitante);
    expect(linhaDivergencia?.level).not.toBe(40); // nunca warn
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
