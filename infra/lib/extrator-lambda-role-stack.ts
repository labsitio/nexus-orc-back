import { CfnParameter, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ExtratorLambdaRoleStackProps extends StackProps {
  /** Bucket `nexo-orcamentos-raw` (propriedade da Ingestão, T012 spec 001) — leitura restrita, nunca `s3:PutObject`/`s3:DeleteObject` (plan.md §IAM). */
  readonly orcamentosRawBucket: s3.IBucket;
  /** Fila consumida pelo handler (T023). */
  readonly extratorQueue: sqs.IQueue;
}

/**
 * Role dedicada da Lambda do Extrator (T026/#91) — least privilege, nunca
 * role ampla compartilhada entre os Lambdas deste contexto (plan.md
 * §Infrastructure/IAM), mesmo padrão de `ClassificadorLambdaRoleStack`
 * (spec 001, T035):
 * - `bedrock:InvokeModel` restrito ao ARN do modelo aprovado (parâmetro de
 *   deploy, nunca wildcard `*` em `Resource`).
 * - `s3:GetObject`/`s3:GetObjectVersion` restrito ao bucket raw, sem
 *   `s3:PutObject`/`s3:DeleteObject`.
 * - `lambda:InvokeFunction` restrito ao ARN do Lambda dedicado ao MarkItDown
 *   deste BC (ADR-002, instância própria — `MarkItDownConversaoExtracaoACL`,
 *   T018) — sem essa permissão o ACL falha em runtime com AccessDenied.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`extrator-queue`) — sem elas o Lambda não roda, mas nenhuma delas
 *   concede acesso além do necessário para essa função específica.
 */
export class ExtratorLambdaRoleStack extends Stack {
  public readonly extratorLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ExtratorLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const modeloAprovadoArn = new CfnParameter(this, 'ModeloBedrockAprovadoArn', {
      type: 'String',
      description:
        'ARN do modelo Bedrock aprovado para extração (least privilege — nunca "*" em Resource).',
    });

    const markItDownExtracaoLambdaArn = new CfnParameter(this, 'MarkItDownExtracaoLambdaArn', {
      type: 'String',
      description:
        'ARN do Lambda dedicado ao MarkItDown deste BC (ADR-002, T018) invocado por MarkItDownConversaoExtracaoACL — least privilege, nunca "*" em Resource.',
    });

    this.extratorLambdaRole = new iam.Role(this, 'ExtratorLambdaRole', {
      roleName: 'ExtratorLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.extratorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarModeloBedrockAprovado',
        actions: ['bedrock:InvokeModel'],
        resources: [modeloAprovadoArn.valueAsString],
      }),
    );

    this.extratorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LerBrutoDoBucketRaw',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [`${props.orcamentosRawBucket.bucketArn}/*`],
      }),
    );

    this.extratorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarMarkItDownExtracaoLambda',
        actions: ['lambda:InvokeFunction'],
        resources: [markItDownExtracaoLambdaArn.valueAsString],
      }),
    );

    props.extratorQueue.grantConsumeMessages(this.extratorLambdaRole);
  }
}
