import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ContextoExtracaoFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ContextoExtracaoLambdaRoleStack`, issue #624). */
  readonly contextoExtracaoLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`ContextoExtracaoQueueStack`, T003/T005). */
  readonly contextoExtracaoQueue: sqs.IQueue;
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
 * `contexto-extracao-queue` (issue #624) — mesmo formato de
 * `ContextoClassificacaoFunctionStack`/`IndexadorFunctionStack` (#623,
 * ADR-009). `RegistrarContextoExtracao` nunca invoca Bedrock nem publica
 * evento — só `DATABASE_URL` é necessária (least privilege espelhado na
 * role dedicada).
 */
export class ContextoExtracaoFunctionStack extends Stack {
  public readonly contextoExtracaoFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ContextoExtracaoFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    this.contextoExtracaoFunction = new NodejsFunction(this, 'ContextoExtracaoFunction', {
      entry:
        'src/bounded-contexts/orquestracao/interface/events/contexto-extracao-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.contextoExtracaoLambdaRole,
      timeout: Duration.seconds(30),
      memorySize: 512,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        mainFields: ['module', 'main'],
      },
      environment: {
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    this.contextoExtracaoFunction.addEventSource(
      new SqsEventSource(props.contextoExtracaoQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
