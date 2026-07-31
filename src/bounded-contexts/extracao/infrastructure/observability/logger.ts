import { pino, type Logger } from 'pino';

/**
 * Base transversal de logging (T016/#81) — todo handler Lambda deste
 * contexto usa `criarLogger`, nunca `console.log`/pino avulso, para manter
 * formato JSON estruturado e nível configurável uniformes.
 *
 * Mesmo padrão de `ingestao-identificacao/infrastructure/observability/logger.ts`
 * (spec-001) — réplica mecânica, instância própria deste BC (Princípio III).
 *
 * `orcamentoId` como binding fixo permite correlação ponta a ponta do log
 * (mesma trilha do tracing OpenTelemetry deste BC).
 */
export function criarLogger(bindings: Record<string, unknown> = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // Nunca logar o próprio JWT — só o header existe no request de borda.
    redact: ['req.headers.authorization'],
    base: bindings,
  });
}
