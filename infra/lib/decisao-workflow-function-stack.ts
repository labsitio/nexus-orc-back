import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface DecisaoWorkflowFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`DecisaoWorkflowLambdaRoleStack`, issue #624). */
  readonly decisaoWorkflowLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`DecisaoWorkflowQueueStack`, T003/T006). */
  readonly decisaoWorkflowQueue: sqs.IQueue;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
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
 * `NodejsFunction` de produção do handler consumidor de
 * `decisao-workflow-queue` (issue #624) — mesmo formato de
 * `IndexadorFunctionStack` (#623, ADR-009). Única das 3 Lambdas deste BC que
 * invoca Bedrock e publica evento de desfecho:
 * - `NEXO_AGENTE_IA=bedrock` sempre fixo no `environment` (ADR-009, Decisão
 *   3) — nunca deixado como default ambíguo em produção.
 * - `NEXO_BEDROCK_ORQUESTRADOR_MODEL_ID` via `CfnParameter`: nenhum modelo
 *   foi decidido em `plan.md`/ADR para o Agente Orquestrador (diferente do
 *   embedding de #623, já documentado) — exigido explicitamente em vez de
 *   um default inventado (fail-fast, mesma disciplina de
 *   `exigirAgenteIaBedrockEmProducao`).
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão das demais
 *   Lambdas de produção deste repositório.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class DecisaoWorkflowFunctionStack extends Stack {
  public readonly decisaoWorkflowFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: DecisaoWorkflowFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    const modeloOrquestradorId = new CfnParameter(this, 'ModeloOrquestradorId', {
      type: 'String',
      description:
        'ID/ARN do modelo Bedrock do Agente Orquestrador — deve corresponder ao ARN restrito na policy IAM de DecisaoWorkflowLambdaRoleStack.',
    });

    this.decisaoWorkflowFunction = new NodejsFunction(this, 'DecisaoWorkflowFunction', {
      entry:
        'src/bounded-contexts/orquestracao/interface/events/decisao-workflow-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.decisaoWorkflowLambdaRole,
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
        NEXO_BEDROCK_ORQUESTRADOR_MODEL_ID: modeloOrquestradorId.valueAsString,
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    this.decisaoWorkflowFunction.addEventSource(
      new SqsEventSource(props.decisaoWorkflowQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
