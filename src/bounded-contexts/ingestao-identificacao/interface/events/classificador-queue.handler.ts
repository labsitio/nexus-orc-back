import type { Logger } from 'pino';
import type { ClassificarOrcamento } from '../../application/use-cases/classificar-orcamento.js';
import { TenantDivergenciaError } from '../../application/use-cases/classificar-orcamento.js';
import { TransicaoInvalidaError } from '../../domain/orcamento.aggregate.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

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
  readonly detail: {
    readonly orcamentoId: string;
    /**
     * (spec 007, T017) `tenantId` é obrigatório no envelope desde T015 (`schemaVersion: 2`).
     * Opcional aqui no type guard porque a premissa de T015 é zero tenant real em produção
     * (baseline da spec) — nenhum evento v1 sem `tenantId` circulará concorrentemente com v2;
     * quando T015 for implementado, o cutover é direto (sem dual v1/v2). Até lá,
     * `tenantId` é undefined em produção e será propagado como tal (ou a validação
     * de tenant no use case rejeitará como legado).
     */
    readonly tenantId?: string;
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
 * Handler Lambda consumidor de `classificador-queue` (T033/#38). Cada
 * mensagem envolve o evento `OrcamentoRecebido` publicado pelo bus de
 * domínio; extrai `orcamentoId` e invoca `ClassificarOrcamento` (T032).
 * Reporta falhas item-a-item — uma mensagem malformada ou um erro de
 * classificação isolado nunca bloqueia as demais mensagens do lote, e a
 * mensagem falha retorna à fila (até `maxReceiveCount`, depois DLQ —
 * Princípio IV, exceção nunca silenciosa). `TransicaoInvalidaError` é
 * tratado como sucesso idempotente (log info, nunca batch item failure):
 * SQS é at-least-once, uma redelivery de uma mensagem já processada com
 * sucesso encontra o agregado fora de `RECEBIDO` — isso é redelivery
 * normal, não falha real, e nunca deve ir para a DLQ nem disparar o alarme
 * de T033 (backend-reviewer, achado MAJOR).
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

        // (spec 007, T017) `tenantId` vem do evento `OrcamentoRecebido` publicado por T016.
        // Até T015 ser implementado, `tenantId` é undefined no envelope (schemaVersion: 1).
        // Depois de T015, é obrigatório (schemaVersion: 2). A validação de tenant no use case
        // rejeita como legado (404) se `tenantId` for undefined — comportamento transitório
        // até o cutover completo de todos os eventos.
        const tenantIdStr = corpo.detail.tenantId;
        let tenantId: TenantId | undefined;
        try {
          tenantId = tenantIdStr ? TenantId.de(tenantIdStr) : undefined;
        } catch {
          throw new Error(`Mensagem ${record.messageId} contém tenantId inválido: ${tenantIdStr}`);
        }

        const logDoOrcamento = logDaMensagem.child({
          orcamentoId,
          tenantId: tenantId?.toString(),
        });
        logDoOrcamento.info('Classificando orçamento');
        await classificarOrcamento.executar(orcamentoId, tenantId);
        logDoOrcamento.info('Orçamento classificado com sucesso');
      } catch (erro) {
        if (erro instanceof TransicaoInvalidaError) {
          logDaMensagem.info(
            { orcamentoId },
            'Mensagem redelivered (at-least-once) para orçamento já processado — ignorada como sucesso idempotente',
          );
          continue;
        }
        // (fix #640) TenantDivergenciaError é permanente (tenantId ausente ou
        // cross-tenant) — retry nunca vai resolver, então continua sem
        // batchItemFailures/DLQ/alarme de reprocessamento em ambos os casos
        // (decisão da #280/T017, mantida). O que muda aqui é apenas nível e
        // mensagem de log — os dois casos NÃO são a mesma coisa:
        if (erro instanceof TenantDivergenciaError) {
          if (erro.motivo === 'AUSENTE') {
            // Registro pré-retrofit (ADR-008, fase de expand) — estado normal
            // até o cutover de #632, depois do qual este ramo deixa de ocorrer.
            logDaMensagem.warn(
              {
                orcamentoId,
                motivo: erro.motivo,
                tenantIdSolicitante: erro.tenantIdSolicitante,
              },
              'Orçamento sem tenantId no agregado (registro pré-retrofit) — ignorado como sucesso idempotente',
            );
          } else {
            // Cross-tenant: tenantId da requisição ausente ou diferente do agregado.
            // Nunca esperado em operação normal — sinal de isolamento (ver #299).
            // Métrica/alarme dedicados ficam para #641 (convenção ainda inexistente).
            logDaMensagem.error(
              {
                orcamentoId,
                motivo: erro.motivo,
                tenantIdAgregado: erro.tenantIdAgregado,
                tenantIdSolicitante: erro.tenantIdSolicitante,
              },
              'Divergência de tenantId ao classificar orçamento — possível acesso cross-tenant',
            );
          }
          continue;
        }
        logDaMensagem.error({ orcamentoId, err: erro }, 'Falha ao classificar orçamento');
        falhas.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: falhas };
  };
}
