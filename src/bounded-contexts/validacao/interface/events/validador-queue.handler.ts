import type { Logger } from 'pino';
import type { ValidarOrcamento } from '../../application/use-cases/validar-orcamento.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';

/**
 * Shape mínimo do evento SQS relevante aqui (apenas os campos usados) —
 * evita depender do pacote `@types/aws-lambda` só por tipos (mesmo padrão
 * de `extracao/interface/events/extrator-queue.handler.ts`).
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

/**
 * Envelope publicado pela regra EventBridge do BC Validação (T004), roteando
 * `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (`source: nexo.extracao`) para `validador-queue`. Só `detail.orcamentoId`
 * é conhecido por este handler para fins de correlação de log — o restante
 * do shape de `detail` é dado bruto do BC Extração, entrada não confiável
 * traduzida exclusivamente por `OrcamentoExtraidoEventACL` (Infrastructure,
 * T015) dentro de `ValidarOrcamento.executar`, nunca inspecionado aqui.
 */
interface EventBridgeEnvelope {
  readonly detail: {
    readonly orcamentoId: string;
  };
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
 * Handler Lambda consumidor de `validador-queue` (T025/#135). Cada mensagem
 * envolve o evento `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (spec 002) roteado pela regra EventBridge de T004; repassa `detail` bruto
 * para `ValidarOrcamento.executar` (T024/#134), que traduz o payload via
 * `OrcamentoExtraidoEventACL` antes de qualquer regra de negócio — este
 * handler nunca decide consistência nem interpreta o shape do evento
 * upstream além do necessário para correlação de log.
 *
 * Reporta falhas item-a-item — uma mensagem malformada ou um erro de
 * validação isolado nunca bloqueia as demais mensagens do lote, e a
 * mensagem falha retorna à fila (até `maxReceiveCount`, depois DLQ —
 * Princípio IV, exceção nunca silenciosa). Sem tratamento especial de
 * transição inválida: `ValidarOrcamento.executar` já é idempotente contra
 * entrega duplicada (at-least-once) — quando o orçamento já saiu de
 * `PENDENTE`, o caso de uso simplesmente retorna sem reavaliar nem
 * republicar (ver `validar-orcamento.ts`).
 *
 * Usa o logger pino compartilhado (T017): `logger.child({orcamentoId,
 * messageId})` amarra cada log deste handler à mensagem/orçamento sendo
 * processado — correlação ponta a ponta. O trace OpenTelemetry é propagado
 * automaticamente pela instrumentação de Lambda registrada em
 * `iniciarObservabilidade()` (T017), sem código adicional aqui.
 */
export function criarValidadorQueueHandler(
  validarOrcamento: ValidarOrcamento,
  logger: Logger = criarLogger({ handler: 'validador-queue' }),
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
        logDoOrcamento.info('Validando consistência do orçamento');
        await validarOrcamento.executar(corpo.detail);
        logDoOrcamento.info('Orçamento avaliado com sucesso pelo validador');
      } catch (erro) {
        logDaMensagem.error({ orcamentoId, err: erro }, 'Falha ao validar orçamento');
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
