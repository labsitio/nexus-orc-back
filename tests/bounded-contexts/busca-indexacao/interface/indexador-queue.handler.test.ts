import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { criarIndexadorQueueHandler } from '../../../../src/bounded-contexts/busca-indexacao/interface/events/indexador-queue.handler.js';
import { OrcamentoValidadoEventACL } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/orcamento-validado-event.acl.js';
import type {
  OrcamentoValidadoEventACLResultado,
  OrcamentoValidadoEventDetailType,
} from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/orcamento-validado-event.acl.js';
import type { IndexarOrcamento } from '../../../../src/bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const TENANT_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const ORCAMENTO_ID_1 = '01890a5d-ac96-774b-bcce-b302099a8058';
const ORCAMENTO_ID_2 = '01890a5d-ac96-774b-bcce-b302099a8059';
const ORCAMENTO_ID_FALHA = '01890a5d-ac96-774b-bcce-b302099a805a';
const ORCAMENTO_ID_OK = '01890a5d-ac96-774b-bcce-b302099a805b';
const ORCAMENTO_ID_JA_PROCESSADO = '01890a5d-ac96-774b-bcce-b302099a805c';

function useCaseFake(
  executar: (
    tenantId: TenantId,
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ) => Promise<void>,
): IndexarOrcamento {
  return { executar } as unknown as IndexarOrcamento;
}

function payloadValido(orcamentoId: string, tenantId?: string) {
  return {
    orcamentoId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    itens: [
      {
        descricao: 'Notebook',
        quantidade: 1,
        precoUnitario: { valorCentavos: 100000, moeda: 'BRL' },
        categoria: 'informatica',
        extraido: true,
      },
    ],
    condicoesComerciais: '30 dias',
  };
}

function envelopeEventBridge(
  detailType: OrcamentoValidadoEventDetailType,
  orcamentoId: string,
  tenantId: string | null = TENANT_ID,
): string {
  return JSON.stringify({
    'detail-type': detailType,
    detail: payloadValido(orcamentoId, tenantId === null ? undefined : tenantId),
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

describe('criarIndexadorQueueHandler', () => {
  it('invoca IndexarOrcamento.executar com tenantId (via ACL), detailType e o detail bruto, para cada mensagem', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarIndexadorQueueHandler(
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
      expect.any(TenantId),
      'OrcamentoValidado',
      expect.objectContaining({ orcamentoId: ORCAMENTO_ID_1 }),
    );
    expect(executar).toHaveBeenNthCalledWith(
      2,
      expect.any(TenantId),
      'OrcamentoValidadoComRessalva',
      expect.objectContaining({ orcamentoId: ORCAMENTO_ID_2 }),
    );
    const tenantIdChamado = executar.mock.calls[0]?.[0] as TenantId;
    expect(tenantIdChamado.toString()).toBe(TENANT_ID);
    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens', async () => {
    const executar = vi.fn().mockImplementation(async (_t, _dt, payloadBruto: unknown) => {
      const { orcamentoId } = payloadBruto as { orcamentoId: string };
      if (orcamentoId === ORCAMENTO_ID_FALHA) {
        throw new Error('indexação falhou');
      }
    });
    const handler = criarIndexadorQueueHandler(
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

  it('reporta falha (nunca lança) se o corpo não for um envelope EventBridge válido (detail-type ausente/desconhecido)', async () => {
    const executar = vi.fn();
    const handler = criarIndexadorQueueHandler(
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
    const handler = criarIndexadorQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({ Records: [{ messageId: 'm1', body: 'não é json' }] });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('(ADR-008/#632) rejeita via ACL (batch item failure) quando tenantId está ausente no envelope — nunca inventado/inferido', async () => {
    const executar = vi.fn();
    const handler = criarIndexadorQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        {
          messageId: 'm1',
          body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_1, null),
        },
      ],
    });

    expect(executar).not.toHaveBeenCalled();
    expect(resposta.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('correlaciona todo log por orcamentoId, tenantId e messageId', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const { logger, linhas } = loggerDeTeste();
    const handler = criarIndexadorQueueHandler(
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

  it('loga erro correlacionado por messageId mesmo sem orcamentoId/tenantId extraídos (envelope inválido)', async () => {
    const { logger, linhas } = loggerDeTeste();
    const handler = criarIndexadorQueueHandler(
      useCaseFake(vi.fn()),
      new OrcamentoValidadoEventACL(),
      logger,
    );

    await handler({ Records: [{ messageId: 'm1', body: '{"algo":"invalido"}' }] });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.level).toBe(50); // pino: nível "error"
    expect(linhas[0]?.messageId).toBe('m1');
  });

  it('entrega duplicada (at-least-once) é idempotente por design do caso de uso — handler não precisa de tratamento especial', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarIndexadorQueueHandler(
      useCaseFake(executar),
      new OrcamentoValidadoEventACL(),
    );

    const resposta = await handler({
      Records: [
        {
          messageId: 'm1',
          body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_JA_PROCESSADO),
        },
      ],
    });

    expect(resposta.batchItemFailures).toHaveLength(0);
  });

  it('usa o mock de resultado da ACL para chamar executar mesmo quando a tradução é injetada (fake)', async () => {
    const traduzido: OrcamentoValidadoEventACLResultado = {
      orcamentoId: { toString: () => 'id-fake' } as never,
      conteudoIndexavel: {} as never,
      origemValidacao: {} as never,
      tenantId: TenantId.de(TENANT_ID),
    };
    const aclFake = { traduzir: vi.fn().mockReturnValue(traduzido) };
    const executar = vi.fn().mockResolvedValue(undefined);
    const handler = criarIndexadorQueueHandler(useCaseFake(executar), aclFake);

    const resposta = await handler({
      Records: [
        { messageId: 'm1', body: envelopeEventBridge('OrcamentoValidado', ORCAMENTO_ID_1) },
      ],
    });

    expect(aclFake.traduzir).toHaveBeenCalledWith('OrcamentoValidado', expect.any(Object));
    expect(executar).toHaveBeenCalledWith(
      expect.any(TenantId),
      'OrcamentoValidado',
      expect.any(Object),
    );
    expect(resposta.batchItemFailures).toHaveLength(0);
  });
});
