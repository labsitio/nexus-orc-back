import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Bootstrap do OpenTelemetry Node SDK (T016/#81) — base transversal de
 * tracing para todo handler Lambda deste contexto. Cada handler chama
 * `iniciarObservabilidade()` uma vez, no topo do módulo (antes do handler
 * em si), para instrumentar o ciclo de vida da invocação Lambda.
 *
 * Mesmo padrão de `ingestao-identificacao/infrastructure/observability/tracing.ts`
 * (spec-001) — réplica mecânica, instância própria deste BC (Princípio III).
 *
 * Endpoint do coletor via `OTEL_EXPORTER_OTLP_ENDPOINT` (padrão da spec
 * OpenTelemetry) — sem endpoint configurado, o exporter aponta para
 * localhost e falha silenciosamente em produção só se o coletor não
 * existir; span nunca bloqueia o handler (exportação é assíncrona).
 */
export function iniciarObservabilidade(nomeServico = 'extracao'): NodeSDK {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: nomeServico }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new AwsLambdaInstrumentation()],
  });
  sdk.start();
  return sdk;
}
