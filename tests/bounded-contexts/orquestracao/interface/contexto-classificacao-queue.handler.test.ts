import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarContextoClassificacaoQueueHandler } from '../../../../src/bounded-contexts/orquestracao/interface/events/contexto-classificacao-queue.handler.js';
import { OrcamentoClassificadoEventACL } from '../../../../src/bounded-contexts/orquestracao/infrastructure/orcamento-classificado-event.acl.js';
import type { RegistrarContextoClassificacao } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/registrar-contexto-classificacao.js';

const TENANT_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const ORCAMENTO_ID_1 = '01890a5d-ac96-774b-bcce-b302099a8058';
const ORCAMENTO_ID_2 = '01890a5d-ac96-774b-bcce-b302099a8059';
const ORCAMENTO_ID_FALHA = '01890a5d-ac96-774b-bcce-b302099a805a';
const ORCAMENTO_ID_OK = '01890a5d-ac96-774b-bcce-b302099a805b';

function useCaseFake(
  executar: (payloadBruto: unknown) => Promise<void>,
): RegistrarContextoClassificacao {
  return { executar } as unknown as RegistrarContextoClassificacao;
}

function payloadValido(
  orcamentoId: string,
  tenantId?: string | null,
  detailType:
    'OrcamentoClassificado' | 'OrcamentoReclassificadoPorRevisaoHumana' = 'OrcamentoClassificado',
) {
  return {
    orcamentoId,
    detailType,
    resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
    ...(tenantId === null ? {} : { tenantId: tenantId ?? TENANT_ID }),
  };
}

function envelopeEventBridge(
  orcamentoId: string,
  tenantId: string | null = TENANT_ID,
  detailType:
    'OrcamentoClassificado' | 'OrcamentoReclassificadoPorRevisaoHumana' = 'OrcamentoClassificado',
): string {
  return JSON.stringify({
    'detail-type': detailType,
    detail: payloadValido(orcamentoId, tenantId, detailType),
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

describe('criarContextoClassificacaoQueueHandler', () => {
  it('invoca RegistrarContextoClassificacao.executar com o detail bruto para cada mensagem', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge(ORCAMENTO_ID_1) },
        { messageId: 'm2', body: envelopeEventBridge(ORCAMENTO_ID_2) },
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

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens', async () => {
    const executar = vi.fn().mockImplementation(async (payloadBruto: unknown) => {
      const { orcamentoId } = payloadBruto as { orcamentoId: string };
      if (orcamentoId === ORCAMENTO_ID_FALHA) {
        throw new Error('registro falhou');
      }
    });
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge(ORCAMENTO_ID_FALHA) },
        { messageId: 'm2', body: envelopeEventBridge(ORCAMENTO_ID_OK) },
      ],
    });

    expect(executar).toHaveBeenCalledTimes(2);
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('reporta falha (nunca lança) se o corpo não for um envelope EventBridge válido', async () => {
    const executar = vi.fn();
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
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
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
    );

    const resposta = await handler({ Records: [{ messageId: 'm1', body: 'não é json' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('(ADR-008/#632) rejeita via ACL (batch item failure) quando tenantId está ausente no envelope', async () => {
    const executar = vi.fn();
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
    );

    const resposta = await handler({
      Records: [{ messageId: 'm1', body: envelopeEventBridge(ORCAMENTO_ID_1, null) }],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('(#744) invoca RegistrarContextoClassificacao.executar para OrcamentoReclassificadoPorRevisaoHumana (mesmo shape, agenteOrigem HUMANO)', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        {
          messageId: 'm1',
          body: envelopeEventBridge(
            ORCAMENTO_ID_1,
            TENANT_ID,
            'OrcamentoReclassificadoPorRevisaoHumana',
          ),
        },
      ],
    });

    expect(executar).toHaveBeenCalledWith(
      expect.objectContaining({
        orcamentoId: ORCAMENTO_ID_1,
        detailType: 'OrcamentoReclassificadoPorRevisaoHumana',
      }),
    );
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('correlaciona todo log por orcamentoId, tenantId e messageId', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarContextoClassificacaoQueueHandler(
      useCaseFake(executar),
      new OrcamentoClassificadoEventACL(),
      logger,
    );

    await handler({ Records: [{ messageId: 'm1', body: envelopeEventBridge(ORCAMENTO_ID_1) }] });

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.orcamentoId).toBe(ORCAMENTO_ID_1);
      expect(linha.tenantId).toBe(TENANT_ID);
      expect(linha.messageId).toBe('m1');
    }
  });
});
