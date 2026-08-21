import type { Logger } from 'pino';

/** Namespace CloudWatch fixo deste Bounded Context (ADR-016) — réplica mecânica por BC, mesmo precedente de `logger.ts`/`tracing.ts`. */
const NAMESPACE = 'Nexo/Validacao';

export interface OpcoesMetrica {
  readonly unidade?: 'Count' | 'Milliseconds' | 'Percent';
  readonly dimensoes?: Record<string, string>;
}

/**
 * Emite uma métrica no formato CloudWatch EMF (Embedded Metric Format,
 * ADR-016) como uma linha de log estruturado pelo logger pino já existente —
 * nenhum SDK novo, nenhuma permissão IAM nova. O agente do CloudWatch Logs
 * extrai a métrica do próprio JSON (`_aws.CloudWatchMetrics`); localmente e em
 * CI a linha é só JSON inspecionável, sem AWS.
 *
 * Ponto de uso é sempre uma linha — `emitirMetrica(logger, 'Nome', 1)` — sem o
 * autor decidir namespace, unidade ou dimensão. Namespace é fixo por Bounded
 * Context, unidade padrão `Count`, e `tenantId` fica fora das dimensões por
 * padrão (alta cardinalidade, custo CloudWatch por combinação única de
 * dimensão) — só entra quando o chamador passar explicitamente em
 * `opcoes.dimensoes`, caso a caso.
 */
export function emitirMetrica(
  logger: Logger,
  nome: string,
  valor: number,
  opcoes: OpcoesMetrica = {},
): void {
  const dimensoes = opcoes.dimensoes ?? {};

  logger.info({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [Object.keys(dimensoes)],
          Metrics: [{ Name: nome, Unit: opcoes.unidade ?? 'Count' }],
        },
      ],
    },
    [nome]: valor,
    ...dimensoes,
  });
}
