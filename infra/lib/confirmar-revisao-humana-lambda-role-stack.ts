import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * Role dedicada da Lambda de confirmação humana (T054/#59) — least
 * privilege, nunca role ampla compartilhada entre os Lambdas deste
 * contexto (plan.md §Infrastructure/IAM): "escrita restrita à tabela deste
 * contexto, sem acesso a Bedrock/S3 raw".
 *
 * ADR-001 conecta ao Aurora Serverless v2 via Drizzle/node-postgres sobre
 * TCP (`DATABASE_URL`), não via RDS Data API — o controle de escrita
 * restrita à tabela deste contexto (`orcamentos`/`orcamentos_historico`)
 * é enforçado no nível do papel de banco Postgres usado pela conexão
 * (GRANT/REVOKE), não por IAM Policy. Esta role, portanto, concede apenas
 * a execução mínima de Lambda (logs) e nenhuma permissão de
 * `bedrock:InvokeModel` ou `s3:*` — a ausência dessas permissões É a
 * garantia de least privilege exigida aqui, não uma omissão.
 */
export class ConfirmarRevisaoHumanaLambdaRoleStack extends Stack {
  public readonly confirmarRevisaoHumanaLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.confirmarRevisaoHumanaLambdaRole = new iam.Role(this, 'ConfirmarRevisaoHumanaLambdaRole', {
      roleName: 'ConfirmarRevisaoHumanaLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
  }
}
