import type { Logger } from 'pino';
import type { RegistrarContextoClassificacao } from '../../application/use-cases/registrar-contexto-classificacao.js';
import type { OrcamentoClassificadoEventACL } from '../../domain/gateways/orcamento-classificado-event.acl.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';

/**
 * Shape mínimo do evento SQS relevante aqui (apenas os campos usados) —
 * evita depender do pacote `@types/aws-lambda` só por tipos (mesmo padrão
 * de `busca-indexacao/interface/events/indexador-queue.handler.ts`).
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
 * Envelope publicado pela regra EventBridge de T004, roteando
 * `OrcamentoClassificado` (`source: nexo.ingestao-identificacao`) para
 * `contexto-classificacao-queue`. `detail` é dado bruto do BC Ingestão &
 * Identificação, entrada não confiável traduzida exclusivamente por
 * `OrcamentoClassificadoEventACL` (T017/ADR-008), nunca inspecionada à mão
 * aqui além do necessário para confirmar que a mensagem foi roteada para a
 * fila correta.
 */
interface EventBridgeEnvelope {
  readonly 'detail-type': 'OrcamentoClassificado';
  readonly detail: unknown;
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const envelope = valor as Record<string, unknown>;
  return envelope['detail-type'] === 'OrcamentoClassificado' && 'detail' in envelope;
}

/**
 * Handler Lambda consumidor de `contexto-classificacao-queue` (T029/#235).
 * Cada mensagem envolve o evento `OrcamentoClassificado` (spec 001) roteado
 * pela regra EventBridge de T004; traduz o envelope via
 * `OrcamentoClassificadoEventACL` (T017/ADR-008) — nunca parseando
 * `tenantId`/conteúdo à mão — e invoca `RegistrarContextoClassificacao.executar`
 * (T026), mesmo padrão de `indexador-queue.handler.ts` (#190).
 *
 * A ACL é chamada aqui (para extrair `orcamentoId`/`tenantId` cedo, para
 * correlação de log) e novamente dentro do próprio caso de uso — tradução é
 * uma função pura e barata, preferível a inventar um contrato novo só para
 * evitar a segunda chamada.
 *
 * Reporta falhas item-a-item — uma mensagem malformada ou uma falha isolada
 * (ex.: `ContextoImutavelError` em reentrega divergente) nunca bloqueia as
 * demais mensagens do lote, e a mensagem falha retorna à fila (até
 * `maxReceiveCount`, depois DLQ — Princípio IV, exceção nunca silenciosa).
 *
 * Idempotência sob redelivery (at-least-once): `RegistrarContextoClassificacao.executar`
 * já é idempotente por design (agregado rejeita apenas payload divergente,
 * não reentrega igual) — handler não precisa de tratamento especial.
 *
 * Usa o logger pino compartilhado (T019): `logger.child({orcamentoId,
 * tenantId, messageId})` amarra cada log deste handler à mensagem sendo
 * processada — correlação ponta a ponta.
 */
export function criarContextoClassificacaoQueueHandler(
  registrarContextoClassificacao: RegistrarContextoClassificacao,
  acl: OrcamentoClassificadoEventACL,
  logger: Logger = criarLogger({ handler: 'contexto-classificacao-queue' }),
): (event: SqsEvent) => Promise<SqsBatchResponse> {
  return async (event: SqsEvent): Promise<SqsBatchResponse> => {
    const falhas: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
      let orcamentoId: string | undefined;
      let tenantId: string | undefined;
      const logDaMensagem = logger.child({ messageId: record.messageId });
      try {
        const corpo: unknown = JSON.parse(record.body);
        if (!ehEventBridgeEnvelope(corpo)) {
          throw new Error(
            `Mensagem ${record.messageId} não contém envelope EventBridge com detail-type ` +
              '"OrcamentoClassificado" e detail válidos',
          );
        }
        const traduzido = acl.traduzir(corpo.detail);
        orcamentoId = traduzido.orcamentoId.toString();
        tenantId = traduzido.tenantId.toString();

        const logDoOrcamento = logDaMensagem.child({ orcamentoId, tenantId });
        logDoOrcamento.info('Registrando contexto de classificação');
        await registrarContextoClassificacao.executar(corpo.detail);
        logDoOrcamento.info('Contexto de classificação registrado com sucesso');
      } catch (erro) {
        logDaMensagem.error(
          { orcamentoId, tenantId, err: erro },
          'Falha ao registrar contexto de classificação',
        );
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
