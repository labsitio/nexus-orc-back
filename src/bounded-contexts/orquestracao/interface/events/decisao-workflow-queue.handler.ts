import type { Logger } from 'pino';
import type { ConsolidarEDecidirWorkflow } from '../../application/use-cases/consolidar-e-decidir-workflow.js';
import type { OrcamentoValidadoEventACL } from '../../domain/gateways/orcamento-validado-event.acl.js';
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

const DETAIL_TYPES_ORCAMENTO_VALIDADO = [
  'OrcamentoValidado',
  'OrcamentoValidadoComRessalva',
] as const;
type DetailTypeOrcamentoValidado = (typeof DETAIL_TYPES_ORCAMENTO_VALIDADO)[number];

/**
 * Envelope publicado pela regra EventBridge de T006, roteando
 * `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (`source: nexo.validacao`)
 * para `decisao-workflow-queue`. `detail` é dado bruto do BC Validação,
 * entrada não confiável traduzida exclusivamente por
 * `OrcamentoValidadoEventACL` (T017/ADR-008), nunca inspecionada à mão aqui
 * além do necessário para confirmar que a mensagem foi roteada para a fila
 * correta.
 */
interface EventBridgeEnvelope {
  readonly 'detail-type': DetailTypeOrcamentoValidado;
  readonly detail: unknown;
}

function ehDetailTypeValido(valor: unknown): valor is DetailTypeOrcamentoValidado {
  return (DETAIL_TYPES_ORCAMENTO_VALIDADO as readonly unknown[]).includes(valor);
}

function ehEventBridgeEnvelope(valor: unknown): valor is EventBridgeEnvelope {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const envelope = valor as Record<string, unknown>;
  return ehDetailTypeValido(envelope['detail-type']) && 'detail' in envelope;
}

/**
 * Handler Lambda consumidor de `decisao-workflow-queue` (T029/#235). Cada
 * mensagem envolve o evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (spec 003) roteado pela regra EventBridge de T006 — último evento da
 * cadeia causal, gatilho real da decisão de workflow; traduz o envelope via
 * `OrcamentoValidadoEventACL` (T017/ADR-008) — nunca parseando
 * `tenantId`/conteúdo à mão — e invoca `ConsolidarEDecidirWorkflow.executar`
 * (T028), mesmo padrão de `contexto-classificacao-queue.handler.ts` (T029).
 *
 * A ACL é chamada aqui (para extrair `orcamentoId`/`tenantId` cedo, para
 * correlação de log) e novamente dentro do próprio caso de uso — tradução é
 * uma função pura e barata, preferível a inventar um contrato novo só para
 * evitar a segunda chamada.
 *
 * Reporta falhas item-a-item — uma mensagem malformada, `ContextoIncompletoError`
 * (entrega fora de ordem, ADR-001 do `plan.md` — contexto de classificação/
 * extração ainda não chegou) ou qualquer outra falha isolada nunca bloqueia
 * as demais mensagens do lote; a mensagem falha retorna à fila (até
 * `maxReceiveCount`, depois DLQ — Princípio IV, exceção nunca silenciosa).
 * `ContextoIncompletoError` é o caso esperado de reentrega até o contexto se
 * consolidar — o runbook da DLQ desta fila (T057) trata especificamente esse
 * cenário.
 *
 * Idempotência sob redelivery (at-least-once): `ConsolidarEDecidirWorkflow.executar`
 * já é idempotente por design (nunca reinvoca o Orquestrador nem republica o
 * desfecho quando o agregado já saiu de `CONTEXTO_CONSOLIDADO`) — handler
 * não precisa de tratamento especial.
 *
 * Usa o logger pino compartilhado (T019): `logger.child({orcamentoId,
 * tenantId, messageId})` amarra cada log deste handler à mensagem sendo
 * processada — correlação ponta a ponta.
 */
export function criarDecisaoWorkflowQueueHandler(
  consolidarEDecidirWorkflow: ConsolidarEDecidirWorkflow,
  acl: OrcamentoValidadoEventACL,
  logger: Logger = criarLogger({ handler: 'decisao-workflow-queue' }),
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
              '(OrcamentoValidado|OrcamentoValidadoComRessalva) e detail válidos',
          );
        }
        const traduzido = acl.traduzir(corpo.detail);
        orcamentoId = traduzido.orcamentoId.toString();
        tenantId = traduzido.tenantId.toString();

        const logDoOrcamento = logDaMensagem.child({ orcamentoId, tenantId });
        logDoOrcamento.info('Consolidando contexto e decidindo workflow');
        await consolidarEDecidirWorkflow.executar(corpo.detail);
        logDoOrcamento.info('Contexto processado (decisão publicada ou aguardando consolidação)');
      } catch (erro) {
        logDaMensagem.error(
          { orcamentoId, tenantId, err: erro },
          'Falha ao consolidar/decidir workflow',
        );
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
