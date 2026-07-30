import { CfnParameter, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ClassificadorLambdaRoleStackProps extends StackProps {
  /** Bucket `nexo-orcamentos-raw` (T012) — leitura restrita, nunca `s3:DeleteObject` (plan.md §IAM). */
  readonly orcamentosRawBucket: s3.IBucket;
  /** Fila consumida pelo handler (T033/T034). */
  readonly classificadorQueue: sqs.IQueue;
}

/**
 * Role dedicada da Lambda do Classificador (T035/#40) — least privilege,
 * nunca role ampla compartilhada entre os Lambdas deste contexto
 * (plan.md §Infrastructure/IAM):
 * - `bedrock:InvokeModel` restrito ao ARN do modelo aprovado (parâmetro de
 *   deploy, nunca wildcard `*` em `Resource`).
 * - `s3:GetObject` restrito ao bucket raw, sem `s3:DeleteObject`.
 * - `lambda:InvokeFunction` restrito ao ARN do Lambda dedicado do MarkItDown
 *   (T030) — sem essa permissão `MarkItDownConversaoACL` falha em runtime
 *   com AccessDenied (backend-reviewer, achado MAJOR). Parâmetro de deploy
 *   igual ao do modelo Bedrock: a stack que provisiona esse Lambda ainda não
 *   existe nesta spec, então o ARN é passado externamente.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`classificador-queue`) — sem elas o Lambda não roda, mas nenhuma
 *   delas concede acesso além do necessário para essa função específica.
 */
export class ClassificadorLambdaRoleStack extends Stack {
  public readonly classificadorLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ClassificadorLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const modeloAprovadoArn = new CfnParameter(this, 'ModeloBedrockAprovadoArn', {
      type: 'String',
      description:
        'ARN do modelo Bedrock aprovado para classificação (least privilege — nunca "*" em Resource).',
    });

    const markItDownLambdaArn = new CfnParameter(this, 'MarkItDownLambdaArn', {
      type: 'String',
      description:
        'ARN do Lambda dedicado ao MarkItDown (T030) invocado por MarkItDownConversaoACL — least privilege, nunca "*" em Resource.',
    });

    this.classificadorLambdaRole = new iam.Role(this, 'ClassificadorLambdaRole', {
      roleName: 'ClassificadorLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.classificadorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarModeloBedrockAprovado',
        actions: ['bedrock:InvokeModel'],
        resources: [modeloAprovadoArn.valueAsString],
      }),
    );

    this.classificadorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LerBrutoDoBucketRaw',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [`${props.orcamentosRawBucket.bucketArn}/*`],
      }),
    );

    this.classificadorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarMarkItDownLambda',
        actions: ['lambda:InvokeFunction'],
        resources: [markItDownLambdaArn.valueAsString],
      }),
    );

    props.classificadorQueue.grantConsumeMessages(this.classificadorLambdaRole);
  }
}
