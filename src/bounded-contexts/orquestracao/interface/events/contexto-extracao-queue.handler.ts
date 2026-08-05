import type { Logger } from 'pino';
import type { RegistrarContextoExtracao } from '../../application/use-cases/registrar-contexto-extracao.js';
import type { OrcamentoExtraidoEventACL } from '../../domain/gateways/orcamento-extraido-event.acl.js';
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

const DETAIL_TYPES_ORCAMENTO_EXTRAIDO = [
  'OrcamentoExtraido',
  'OrcamentoExtraidoComPendenciaConfirmada',
] as const;
type DetailTypeOrcamentoExtraido = (typeof DETAIL_TYPES_ORCAMENTO_EXTRAIDO)[number];

/**
 * Envelope publicado pela regra EventBridge de T005, roteando
 * `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (`source: nexo.extracao`) para `contexto-extracao-queue`. `detail` é dado
 * bruto do BC Extração, entrada não confiável traduzida exclusivamente por
 * `OrcamentoExtraidoEventACL` (T017/ADR-008), nunca inspecionada à mão aqui
 * além do necessário para confirmar que a mensagem foi roteada para a fila
 * correta.
 */
interface EventBridgeEnvelope {
  readonly 'detail-type': DetailTypeOrcamentoExtraido;
  readonly detail: unknown;
}

function ehDetailTypeValido(valor: unknown): valor is DetailTypeOrcamentoExtraido {
  return (DETAIL_TYPES_ORCAMENTO_EXTRAIDO as readonly unknown[]).includes(valor);
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const envelope = valor as Record<string, unknown>;
  return ehDetailTypeValido(envelope['detail-type']) && 'detail' in envelope;
}

/**
 * Handler Lambda consumidor de `contexto-extracao-queue` (T029/#235). Cada
 * mensagem envolve o evento `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (spec 002) roteado pela regra EventBridge de T005; traduz o envelope via
 * `OrcamentoExtraidoEventACL` (T017/ADR-008) — nunca parseando
 * `tenantId`/conteúdo à mão — e invoca `RegistrarContextoExtracao.executar`
 * (T027), mesmo padrão de `contexto-classificacao-queue.handler.ts` (T029).
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
 * Idempotência sob redelivery (at-least-once): `RegistrarContextoExtracao.executar`
 * já é idempotente por design — handler não precisa de tratamento especial.
 *
 * Usa o logger pino compartilhado (T019): `logger.child({orcamentoId,
 * tenantId, messageId})` amarra cada log deste handler à mensagem sendo
 * processada — correlação ponta a ponta.
 */
export function criarContextoExtracaoQueueHandler(
  registrarContextoExtracao: RegistrarContextoExtracao,
  acl: OrcamentoExtraidoEventACL,
  logger: Logger = criarLogger({ handler: 'contexto-extracao-queue' }),
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
              '(OrcamentoExtraido|OrcamentoExtraidoComPendenciaConfirmada) e detail válidos',
          );
        }
        const traduzido = acl.traduzir(corpo.detail);
        orcamentoId = traduzido.orcamentoId.toString();
        tenantId = traduzido.tenantId.toString();

        const logDoOrcamento = logDaMensagem.child({ orcamentoId, tenantId });
        logDoOrcamento.info('Registrando contexto de extração');
        await registrarContextoExtracao.executar(corpo.detail);
        logDoOrcamento.info('Contexto de extração registrado com sucesso');
      } catch (erro) {
        logDaMensagem.error(
          { orcamentoId, tenantId, err: erro },
          'Falha ao registrar contexto de extração',
        );
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
