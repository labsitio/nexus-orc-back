import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ValidarOrcamentoFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ValidarOrcamentoLambdaRoleStack`, T028/#616). */
  readonly validarOrcamentoLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`ValidadorQueueStack`, T003). */
  readonly validadorQueue: sqs.IQueue;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
  /**
   * Rede do Aurora Serverless v2 (mesmo ponto em aberto de
   * `ExtratorFunctionStack`, #614) — opcional porque nenhuma stack deste
   * repositório provisiona VPC/Aurora ainda.
   */
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
}

/**
 * `NodejsFunction` de produção do handler consumidor de `validador-queue`
 * (issue #615) — mesmo formato de `ExtratorFunctionStack` (spec 002, #614,
 * ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição), nunca para o
 *   arquivo da fábrica de handler (T025) diretamente.
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`).
 * - `NEXO_AGENTE_IA=bedrock` sempre fixo no `environment` (ADR-009, Decisão
 *   3) — nunca deixado como default ambíguo em produção.
 * - `NEXO_BEDROCK_CATEGORIZACAO_MODEL_ID` deve corresponder ao ARN restrito
 *   na policy IAM de `ValidarOrcamentoLambdaRoleStack`
 *   (`ModeloCategorizacaoAprovadoArn`, #616/#155).
 * - `NEXO_FORNECEDOR_CADASTRADO_BASE_URL`: URL base do sistema externo de
 *   cadastro de fornecedores consumido por `FornecedorCadastradoHttpGateway`
 *   (T022) — fora do controle direto deste repositório (plan.md, seção
 *   Infrastructure).
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão das demais
 *   Lambdas de produção deste repositório.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class ValidarOrcamentoFunctionStack extends Stack {
  public readonly validarOrcamentoFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ValidarOrcamentoFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    const modeloCategorizacaoId = new CfnParameter(this, 'ModeloCategorizacaoId', {
      type: 'String',
      description:
        'ID/ARN do modelo Bedrock de categorização — deve corresponder ao ARN restrito na policy IAM de ValidarOrcamentoLambdaRoleStack.',
    });

    const fornecedorCadastradoBaseUrl = new CfnParameter(this, 'FornecedorCadastradoBaseUrl', {
      type: 'String',
      description:
        'URL base do sistema externo de cadastro de fornecedores consumido por FornecedorCadastradoHttpGateway (T022).',
    });

    this.validarOrcamentoFunction = new NodejsFunction(this, 'ValidarOrcamentoFunction', {
      entry: 'src/bounded-contexts/validacao/interface/events/validador-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.validarOrcamentoLambdaRole,
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
        NEXO_BEDROCK_CATEGORIZACAO_MODEL_ID: modeloCategorizacaoId.valueAsString,
        NEXO_FORNECEDOR_CADASTRADO_BASE_URL: fornecedorCadastradoBaseUrl.valueAsString,
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    this.validarOrcamentoFunction.addEventSource(
      new SqsEventSource(props.validadorQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
