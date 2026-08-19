import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ClassificadorFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ClassificadorLambdaRoleStack`, T035/#40). */
  readonly classificadorLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`ClassificadorQueueStack`, T033). */
  readonly classificadorQueue: sqs.IQueue;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
  /** Bucket `nexo-orcamentos-raw` (`IngestaoIdentificacaoStorageStack`, T012). */
  readonly orcamentosRawBucket: s3.IBucket;
  /**
   * Rede do Aurora Serverless v2 (mesmo ponto em aberto de `IndexadorFunctionStack`,
   * PR #662) — opcional porque nenhuma stack deste repositório provisiona
   * VPC/Aurora ainda. Passar `undefined` para `NodejsFunction` é seguro (CDK
   * trata como "sem VPC"); a prop existe para a stack de rede futura só
   * precisar passar os valores aqui, sem alterar esta stack.
   */
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
}

/**
 * `NodejsFunction` de produção do handler consumidor de `classificador-queue`
 * (issue #613) — mesmo formato de `IndexadorFunctionStack` (#623, ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição), nunca para o
 *   arquivo da fábrica de handler (T034) diretamente.
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`).
 * - `NEXO_AGENTE_IA=bedrock` sempre fixo no `environment` (ADR-009, Decisão
 *   3) — nunca deixado como default ambíguo em produção.
 * - `NEXO_BEDROCK_CLASSIFICADOR_MODEL_ID`/`NEXO_MARKITDOWN_LAMBDA_ARN` via
 *   `CfnParameter`: devem corresponder aos ARNs restritos na policy IAM de
 *   `ClassificadorLambdaRoleStack` (`ModeloBedrockAprovadoArn`/`MarkItDownLambdaArn`).
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão das demais
 *   Lambdas de produção deste repositório.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class ClassificadorFunctionStack extends Stack {
  public readonly classificadorFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ClassificadorFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    const modeloClassificadorId = new CfnParameter(this, 'ModeloClassificadorId', {
      type: 'String',
      description:
        'ID/ARN do modelo Bedrock do Classificador — deve corresponder ao ARN restrito na policy IAM de ClassificadorLambdaRoleStack.',
    });

    const markItDownLambdaArn = new CfnParameter(this, 'MarkItDownLambdaArn', {
      type: 'String',
      description:
        'ARN do Lambda dedicado ao MarkItDown (T030) — deve corresponder ao ARN restrito na policy IAM de ClassificadorLambdaRoleStack.',
    });

    this.classificadorFunction = new NodejsFunction(this, 'ClassificadorFunction', {
      entry:
        'src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.classificadorLambdaRole,
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
        NEXO_BUCKET_RAW: props.orcamentosRawBucket.bucketName,
        NEXO_BEDROCK_CLASSIFICADOR_MODEL_ID: modeloClassificadorId.valueAsString,
        NEXO_MARKITDOWN_LAMBDA_ARN: markItDownLambdaArn.valueAsString,
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    this.classificadorFunction.addEventSource(
      new SqsEventSource(props.classificadorQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
