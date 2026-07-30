import type { Logger } from 'pino';
import type { ClassificarOrcamento } from '../../application/use-cases/classificar-orcamento.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';

/**
 * Shape mínimo do evento SQS relevante aqui (apenas os campos usados) —
 * evita depender do pacote `@types/aws-lambda` só por tipos.
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

/** Envelope publicado pela regra EventBridge `OrcamentoRecebidoParaClassificadorQueue` (T033). */
interface EventBridgeEnvelope {
  readonly detail: { readonly orcamentoId: string };
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const detail = (valor as Record<string, unknown>).detail;
  return (
    typeof detail === 'object' &&
    detail !== null &&
    typeof (detail as Record<string, unknown>).orcamentoId === 'string'
  );
}

/**
 * Handler Lambda consumidor de `classificador-queue` (T033/#38). Cada
 * mensagem envolve o evento `OrcamentoRecebido` publicado pelo bus de
 * domínio; extrai `orcamentoId` e invoca `ClassificarOrcamento` (T032).
 * Reporta falhas item-a-item — uma mensagem malformada ou um erro de
 * classificação isolado nunca bloqueia as demais mensagens do lote, e a
 * mensagem falha retorna à fila (até `maxReceiveCount`, depois DLQ —
 * Princípio IV, exceção nunca silenciosa).
 *
 * Usa o logger pino compartilhado (T015/#20): `logger.child({orcamentoId,
 * messageId})` amarra cada log deste handler à mensagem/orçamento sendo
 * processado — correlação ponta a ponta (T036/#41). O trace OpenTelemetry
 * é propagado automaticamente pela instrumentação de Lambda registrada em
 * `iniciarObservabilidade()` (T015/#20), sem código adicional aqui.
 */
export function criarClassificadorQueueHandler(
  classificarOrcamento: ClassificarOrcamento,
  logger: Logger = criarLogger({ handler: 'classificador-queue' }),
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
            `Mensagem ${record.messageId} não contém envelope EventBridge com detail.orcamentoId válido`,
          );
        }
        orcamentoId = corpo.detail.orcamentoId;
        const logDoOrcamento = logDaMensagem.child({ orcamentoId });
        logDoOrcamento.info('Classificando orçamento');
        await classificarOrcamento.executar(orcamentoId);
        logDoOrcamento.info('Orçamento classificado com sucesso');
      } catch (erro) {
        logDaMensagem.error({ orcamentoId, err: erro }, 'Falha ao classificar orçamento');
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
