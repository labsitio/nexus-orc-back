import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface IndexadorFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`IndexadorLambdaRoleStack`, issue #623). */
  readonly indexadorLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`IndexadorQueueStack`, T004). */
  readonly indexadorQueue: sqs.IQueue;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
}

/**
 * `NodejsFunction` de produção do handler consumidor de `indexador-queue`
 * (issue #623) — primeira Lambda de produção do repositório, formato de
 * referência para #613/#614/#615/#624 (ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição), nunca para o
 *   arquivo da fábrica de handler (T030) diretamente.
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`) — sem isso o esbuild do `NodejsFunction` empacotaria CJS por
 *   padrão e o bundle falharia ao resolver os `import` do projeto.
 * - `NEXO_AGENTE_IA=bedrock` sempre fixo no `environment` (ADR-009, Decisão
 *   3) — nunca deixado como default ambíguo em produção.
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): nenhuma stack neste
 *   repositório provisiona Secrets Manager ainda — parâmetro de deploy é o
 *   mínimo que evita hardcode de credencial, mesmo padrão de
 *   `ModeloEmbeddingAprovadoArn` (`IndexadorLambdaRoleStack`).
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class IndexadorFunctionStack extends Stack {
  public readonly indexadorFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: IndexadorFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    this.indexadorFunction = new NodejsFunction(this, 'IndexadorFunction', {
      entry: 'src/bounded-contexts/busca-indexacao/interface/events/indexador-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.indexadorLambdaRole,
      timeout: Duration.seconds(30),
      memorySize: 512,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        mainFields: ['module', 'main'],
      },
      environment: {
        NEXO_AGENTE_IA: 'bedrock',
        NEXO_EVENT_BUS: props.dominioBus.eventBusName,
        DATABASE_URL: databaseUrl.valueAsString,
      },
    });

    this.indexadorFunction.addEventSource(
      new SqsEventSource(props.indexadorQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
