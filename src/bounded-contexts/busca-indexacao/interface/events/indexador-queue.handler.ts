import type { Logger } from 'pino';
import type { IndexarOrcamento } from '../../application/use-cases/indexar-orcamento.js';
import type {
  OrcamentoValidadoEventACL,
  OrcamentoValidadoEventDetailType,
} from '../../domain/gateways/orcamento-validado-event.acl.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';

/**
 * Shape mínimo do evento SQS relevante aqui (apenas os campos usados) —
 * evita depender do pacote `@types/aws-lambda` só por tipos (mesmo padrão
 * de `validacao/interface/events/validador-queue.handler.ts`).
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
 * Envelope publicado pela regra EventBridge de T005, roteando
 * `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (`source: nexo.validacao`)
 * para `indexador-queue`. Só `detail-type` é conhecido por este handler —
 * `detail` é dado bruto do BC Validação, entrada não confiável traduzida
 * exclusivamente por `OrcamentoValidadoEventACL` (T018/ADR-008), nunca
 * inspecionado à mão aqui.
 */
interface EventBridgeEnvelope {
  readonly 'detail-type': OrcamentoValidadoEventDetailType;
  readonly detail: unknown;
}

function ehDetailTypeValido(valor: unknown): valor is OrcamentoValidadoEventDetailType {
  return valor === 'OrcamentoValidado' || valor === 'OrcamentoValidadoComRessalva';
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const envelope = valor as Record<string, unknown>;
  return ehDetailTypeValido(envelope['detail-type']) && 'detail' in envelope;
}

/**
 * Handler Lambda consumidor de `indexador-queue` (T030/#190). Cada mensagem
 * envolve o evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (spec 003) roteado pela regra EventBridge de T005; traduz o envelope via
 * `OrcamentoValidadoEventACL` (T014/T018/ADR-008) — nunca parseando
 * `tenantId`/conteúdo à mão — e invoca `IndexarOrcamento.executar` (T029).
 *
 * **GATE #190/ADR-008 resolvido**: `OrcamentoValidadoEventACL` já extrai e
 * valida `tenantId` (obrigatório desde o cutover de contract de 003,
 * `schemaVersion: 2`, #632/PR #655) — mensagem sem `tenantId` (ou com
 * `tenantId` malformado) é rejeitada pela própria ACL
 * (`OrcamentoValidadoEventACLInvalidaError`), tratada aqui como qualquer
 * outro erro de tradução: batch item failure, nunca inventado/inferido.
 *
 * A ACL é chamada aqui (para extrair `tenantId`/`orcamentoId` cedo, correlação
 * de log, e para que um payload malformado nunca chegue a
 * `IndexarOrcamento.executar`) e novamente dentro do próprio caso de uso
 * (T029, já implementado/aprovado) — tradução é uma função pura e barata,
 * preferível a inventar um contrato novo só para evitar a segunda chamada.
 *
 * Reporta falhas item-a-item — uma mensagem malformada ou uma falha isolada
 * nunca bloqueia as demais mensagens do lote, e a mensagem falha retorna à
 * fila (até `maxReceiveCount`, depois DLQ — Princípio IV, exceção nunca
 * silenciosa). Falha técnica do `AgenteEmbeddingGateway` já é tratada dentro
 * de `IndexarOrcamento.executar` (publica `FalhaIndexacaoDetectada`, nunca
 * propaga) — só chega a este `catch` erro de infraestrutura (Postgres,
 * EventBridge) ou de tradução (ACL), ambos elegíveis a retry via redelivery.
 *
 * Idempotência sob redelivery (at-least-once): `IndexarOrcamento.executar`
 * já é idempotente por design (upsert por `orcamentoId`, histórico
 * append-only) — handler não precisa de tratamento especial.
 *
 * Usa o logger pino compartilhado (T019): `logger.child({orcamentoId,
 * tenantId, messageId})` amarra cada log deste handler à mensagem sendo
 * processada — correlação ponta a ponta.
 */
export function criarIndexadorQueueHandler(
  indexarOrcamento: IndexarOrcamento,
  acl: OrcamentoValidadoEventACL,
  logger: Logger = criarLogger({ handler: 'indexador-queue' }),
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
            `Mensagem ${record.messageId} não contém envelope EventBridge com detail-type ` +
              '(OrcamentoValidado|OrcamentoValidadoComRessalva) e detail válidos',
          );
        }
        const detailType = corpo['detail-type'];
        const traduzido = acl.traduzir(detailType, corpo.detail);
        orcamentoId = traduzido.orcamentoId.toString();

        const logDoOrcamento = logDaMensagem.child({
          orcamentoId,
          tenantId: traduzido.tenantId.toString(),
        });
        logDoOrcamento.info('Indexando orçamento validado');
        await indexarOrcamento.executar(traduzido.tenantId, detailType, corpo.detail);
        logDoOrcamento.info('Orçamento processado pelo indexador (indexado ou falha registrada)');
      } catch (erro) {
        logDaMensagem.error({ orcamentoId, err: erro }, 'Falha ao indexar orçamento');
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
