import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ContextoClassificacaoFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ContextoClassificacaoLambdaRoleStack`, issue #624). */
  readonly contextoClassificacaoLambdaRole: iam.IRole;
  /** Fila que dispara esta função (`ContextoClassificacaoQueueStack`, T003/T004). */
  readonly contextoClassificacaoQueue: sqs.IQueue;
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
 * `contexto-classificacao-queue` (issue #624) — mesmo formato de
 * `IndexadorFunctionStack` (#623, ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição), nunca para o
 *   arquivo da fábrica de handler (T029) diretamente.
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`).
 * - Sem `NEXO_AGENTE_IA`/`NEXO_EVENT_BUS`: `RegistrarContextoClassificacao`
 *   nunca invoca Bedrock nem publica evento — só `DATABASE_URL` é
 *   necessária (least privilege espelhado na role dedicada).
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão de
 *   `IndexadorFunctionStack` — nenhuma stack deste repositório provisiona
 *   Secrets Manager ainda.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class ContextoClassificacaoFunctionStack extends Stack {
  public readonly contextoClassificacaoFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ContextoClassificacaoFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    this.contextoClassificacaoFunction = new NodejsFunction(this, 'ContextoClassificacaoFunction', {
      entry:
        'src/bounded-contexts/orquestracao/interface/events/contexto-classificacao-queue.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.contextoClassificacaoLambdaRole,
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

    this.contextoClassificacaoFunction.addEventSource(
      new SqsEventSource(props.contextoClassificacaoQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
  }
}
