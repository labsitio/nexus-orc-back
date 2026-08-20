import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ExtratorFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ExtratorLambdaRoleStack`, T026/#91). */
  readonly extratorLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`ExtratorQueueStack`, T003). */
  readonly extratorQueue: sqs.IQueue;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
  /**
   * Rede do Aurora Serverless v2 (mesmo ponto em aberto de
   * `ClassificadorFunctionStack`, #613) — opcional porque nenhuma stack
   * deste repositório provisiona VPC/Aurora ainda. Passar `undefined` para
   * `NodejsFunction` é seguro (CDK trata como "sem VPC"); a prop existe para
   * a stack de rede futura só precisar passar os valores aqui, sem alterar
   * esta stack.
   */
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
}

/**
 * `NodejsFunction` de produção do handler consumidor de `extrator-queue`
 * (issue #614) — mesmo formato de `ClassificadorFunctionStack` (spec 001,
 * #613, ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição), nunca para o
 *   arquivo da fábrica de handler (T023) diretamente.
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`).
 * - `NEXO_AGENTE_IA=bedrock` sempre fixo no `environment` (ADR-009, Decisão
 *   3) — nunca deixado como default ambíguo em produção.
 * - `NEXO_BEDROCK_EXTRATOR_MODEL_ID`/`NEXO_MARKITDOWN_EXTRACAO_LAMBDA_ARN`
 *   via `CfnParameter`: devem corresponder aos ARNs restritos na policy IAM
 *   de `ExtratorLambdaRoleStack` (`ModeloBedrockAprovadoArn`/
 *   `MarkItDownExtracaoLambdaArn`).
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão das demais
 *   Lambdas de produção deste repositório.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class ExtratorFunctionStack extends Stack {
  public readonly extratorFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ExtratorFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    const modeloExtratorId = new CfnParameter(this, 'ModeloExtratorId', {
      type: 'String',
      description:
        'ID/ARN do modelo Bedrock do Extrator — deve corresponder ao ARN restrito na policy IAM de ExtratorLambdaRoleStack.',
    });

    const markItDownExtracaoLambdaArn = new CfnParameter(this, 'MarkItDownExtracaoLambdaArn', {
      type: 'String',
      description:
        'ARN do Lambda dedicado ao MarkItDown deste BC (ADR-002, T018) — deve corresponder ao ARN restrito na policy IAM de ExtratorLambdaRoleStack.',
    });

    this.extratorFunction = new NodejsFunction(this, 'ExtratorFunction', {
      entry: 'src/bounded-contexts/extracao/interface/events/extrator-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.extratorLambdaRole,
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
        NEXO_BEDROCK_EXTRATOR_MODEL_ID: modeloExtratorId.valueAsString,
        NEXO_MARKITDOWN_EXTRACAO_LAMBDA_ARN: markItDownExtracaoLambdaArn.valueAsString,
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    this.extratorFunction.addEventSource(
      new SqsEventSource(props.extratorQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
