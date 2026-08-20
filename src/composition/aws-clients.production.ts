/**
 * Clientes AWS de produção (issue #623) — espelha `src/dev/config.ts`
 * (`clientesLocais()`), mas sem `AWS_ENDPOINT_URL`: em produção o SDK v3
 * resolve endpoint/credenciais/região nativamente (variáveis de ambiente
 * padrão AWS_REGION/role IAM da própria Lambda), nunca aponta para
 * LocalStack. Único ponto que qualquer `*.production.ts` (ADR-009) deve
 * importar para obter clientes reais — convenção que #613/#614/#615/#624
 * (as Lambdas de produção irmãs) reaproveitam sem duplicar.
 *
 * `db` vem de `shared-kernel/database/client.ts`: falha no cold start se
 * `DATABASE_URL` ausente (consequência já registrada no ADR-009).
 */
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { db } from '../shared-kernel/database/client.js';

export interface ClientesProducao {
  readonly db: typeof db;
  readonly s3: S3Client;
  readonly eventBridge: EventBridgeClient;
  readonly sqs: SQSClient;
  readonly bedrock: BedrockRuntimeClient;
  /** Invoca o Lambda dedicado ao MarkItDown (`MarkItDownConversaoACL`, issue #613). */
  readonly lambda: LambdaClient;
}

export function clientesProducao(): ClientesProducao {
  return {
    db,
    s3: new S3Client({}),
    eventBridge: new EventBridgeClient({}),
    sqs: new SQSClient({}),
    bedrock: new BedrockRuntimeClient({}),
    lambda: new LambdaClient({}),
  };
}

/**
 * Decisão 3 do ADR-009: produção sempre fixa `NEXO_AGENTE_IA=bedrock`
 * explicitamente no `environment` da `NodejsFunction` — nunca um default
 * ambíguo. Desde #617, `OllamaClassificadorGateway` existe como alternativa
 * local ao `BedrockClassificadorGateway` (mesma porta de domínio,
 * `AgenteClassificadorGateway`) — mas é exclusivamente um PoC de dev sem
 * credencial AWS (`docs/plano-infra-ambientes.md` §5): não muda esta função.
 * Produção continua falhando rápido no cold start se a variável vier ausente
 * ou com qualquer valor que não seja `bedrock`, em vez de silenciosamente
 * aceitar um gateway local em ambiente real.
 */
export function exigirAgenteIaBedrockEmProducao(): void {
  const valor = process.env.NEXO_AGENTE_IA;
  if (valor !== 'bedrock') {
    throw new Error(
      `NEXO_AGENTE_IA deve ser "bedrock" em produção (ADR-009) — recebido "${valor ?? '(ausente)'}".`,
    );
  }
}
