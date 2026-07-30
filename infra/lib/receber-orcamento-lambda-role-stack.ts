import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface ReceberOrcamentoLambdaRoleStackProps extends StackProps {
  readonly orcamentosRawBucket: s3.IBucket;
}

/**
 * IAM role dedicada (T026/#31) para o(s) Lambda(s) que executam
 * `ReceberOrcamento` — hoje `confirmar-upload` (T022/#27) e o trigger SFTP
 * (T023/#28). Least privilege: `s3:GetObject`/`s3:PutObject` restrito ao
 * bucket `nexo-orcamentos-raw`, mais `s3:PutObjectRetention` (exigido pela
 * URL presigned assinada com Object Lock explícito em `gerarUrlUpload`,
 * T021/#26, e pela cópia em `confirmarUpload`, T022/#27 — achado do
 * backend-reviewer). Nunca `s3:DeleteObject` nesta nem em nenhuma outra role
 * deste contexto (plan.md).
 */
export class ReceberOrcamentoLambdaRoleStack extends Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ReceberOrcamentoLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.role = new iam.Role(this, 'ReceberOrcamentoLambdaRole', {
      roleName: 'ReceberOrcamentoLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AcessoAoBucketDeOrcamentosBrutos',
        actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectRetention'],
        resources: [props.orcamentosRawBucket.arnForObjects('*')],
      }),
    );
  }
}
