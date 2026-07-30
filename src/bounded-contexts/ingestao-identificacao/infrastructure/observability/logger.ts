import { pino, type Logger } from 'pino';

/**
 * Base transversal de logging (T015/#20) — todo handler Lambda deste
 * contexto usa `criarLogger`, nunca `console.log`/pino avulso, para manter
 * formato JSON estruturado e nível configurável uniformes.
 *
 * `orcamentoId` como binding fixo permite correlação ponta a ponta do log
 * (T036 amarra isso ao trace do OpenTelemetry).
 */
export function criarLogger(bindings: Record<string, unknown> = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // Nunca logar o próprio JWT — só o header existe no request de borda.
    redact: ['req.headers.authorization'],
    base: bindings,
  });
}
