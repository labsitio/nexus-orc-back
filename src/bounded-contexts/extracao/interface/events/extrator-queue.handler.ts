import type { Logger } from 'pino';
import type { ExtrairDadosOrcamento } from '../../application/use-cases/extrair-dados-orcamento.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';

/**
 * Shape mínimo do evento SQS relevante aqui (apenas os campos usados) —
 * evita depender do pacote `@types/aws-lambda` só por tipos (mesmo padrão
 * de `ingestao-identificacao/interface/events/classificador-queue.handler.ts`).
 */
export interface SqsRecord {
  readonly messageId: string;
  readonly body: string;
}

export interface SqsEvent {
  readonly Records: readonly SqsRecord[];
}

/** Reporte de falha item-a-item (batch item failures) — só o item falho volta para a fila/DLQ. */
export interface SqsBatchResponse {
  readonly batchItemFailures: readonly { itemIdentifier: string }[];
}

/** Envelope publicado pela regra EventBridge `OrcamentoClassificadoParaExtratorQueue` (T004). */
interface EventBridgeEnvelope {
  readonly detail: {
    readonly orcamentoId: string;
    readonly resultado: {
      readonly fornecedorIdentificado: string;
      readonly formatoIdentificado: string;
      readonly agenteOrigem: 'CLASSIFICADOR' | 'HUMANO';
    };
    readonly referenciaBruta: {
      readonly bucket: string;
      readonly key: string;
      readonly versionId: string;
    };
  };
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const detail = (valor as Record<string, unknown>).detail;
  if (typeof detail !== 'object' || detail === null) {
    return false;
  }
  const d = detail as Record<string, unknown>;
  if (typeof d.orcamentoId !== 'string') {
    return false;
  }
  const resultado = d.resultado;
  if (
    typeof resultado !== 'object' ||
    resultado === null ||
    typeof (resultado as Record<string, unknown>).fornecedorIdentificado !== 'string' ||
    typeof (resultado as Record<string, unknown>).formatoIdentificado !== 'string' ||
    ((resultado as Record<string, unknown>).agenteOrigem !== 'CLASSIFICADOR' &&
      (resultado as Record<string, unknown>).agenteOrigem !== 'HUMANO')
  ) {
    return false;
  }
  const referenciaBruta = d.referenciaBruta;
  return (
    typeof referenciaBruta === 'object' &&
    referenciaBruta !== null &&
    typeof (referenciaBruta as Record<string, unknown>).bucket === 'string' &&
    typeof (referenciaBruta as Record<string, unknown>).key === 'string' &&
    typeof (referenciaBruta as Record<string, unknown>).versionId === 'string'
  );
}

/**
 * Handler Lambda consumidor de `extrator-queue` (T023/#88). Cada mensagem
 * envolve o evento `OrcamentoClassificado` (spec 001, ADR-003 — payload
 * inclui `referenciaBruta`); extrai os dados necessários e invoca
 * `ExtrairDadosOrcamento` (T022). Reporta falhas item-a-item — uma mensagem
 * malformada ou um erro de extração isolado nunca bloqueia as demais
 * mensagens do lote, e a mensagem falha retorna à fila (até
 * `maxReceiveCount`, depois DLQ — Princípio IV, exceção nunca silenciosa).
 *
 * Diferente do handler análogo de spec-001 (`classificador-queue.handler.ts`),
 * não há tratamento especial de erro de transição inválida: `ExtrairDadosOrcamento`
 * já é idempotente contra entrega duplicada (at-least-once) — quando a
 * extração já saiu de `PENDENTE`, o caso de uso simplesmente retorna sem
 * reprocessar nem republicar (ADR-003 do plan.md desta spec).
 *
 * Usa o logger pino compartilhado (T016/#81): `logger.child({orcamentoId,
 * messageId})` amarra cada log deste handler à mensagem/orçamento sendo
 * processado — correlação ponta a ponta. O trace OpenTelemetry é propagado
 * automaticamente pela instrumentação de Lambda registrada em
 * `iniciarObservabilidade()` (T016/#81), sem código adicional aqui.
 */
export function criarExtratorQueueHandler(
  extrairDadosOrcamento: ExtrairDadosOrcamento,
  logger: Logger = criarLogger({ handler: 'extrator-queue' }),
): (event: SqsEvent) => Promise<SqsBatchResponse> {
  return async (event: SqsEvent): Promise<SqsBatchResponse> => {
    const falhas: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
      let orcamentoId: string | undefined;
      const logDaMensagem = logger.child({ messageId: record.messageId });
      try {
        const corpo: unknown = JSON.parse(record.body);
        if (!ehEventBridgeEnvelope(corpo)) {
          throw new Error(
            `Mensagem ${record.messageId} não contém envelope EventBridge com detail.orcamentoId/resultado/referenciaBruta válidos`,
          );
        }
        orcamentoId = corpo.detail.orcamentoId;
        const logDoOrcamento = logDaMensagem.child({ orcamentoId });
        logDoOrcamento.info('Extraindo dados do orçamento');
        await extrairDadosOrcamento.executar({
          orcamentoId: corpo.detail.orcamentoId,
          referenciaClassificacao: {
            fornecedorIdentificado: corpo.detail.resultado.fornecedorIdentificado,
            formatoIdentificado: corpo.detail.resultado.formatoIdentificado,
            agenteOrigem: corpo.detail.resultado.agenteOrigem,
          },
          referenciaBrutaS3: corpo.detail.referenciaBruta,
        });
        logDoOrcamento.info('Dados do orçamento extraídos com sucesso');
      } catch (erro) {
        logDaMensagem.error({ orcamentoId, err: erro }, 'Falha ao extrair dados do orçamento');
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
