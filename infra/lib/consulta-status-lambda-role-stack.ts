import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * Role dedicada da Lambda de consulta de status (T048/#53) — least
 * privilege, nunca role ampla compartilhada entre os Lambdas deste
 * contexto (plan.md §Infrastructure/IAM). `ConsultarStatusOrcamento`
 * (T046) é caso de uso de query, somente leitura no repositório: nunca
 * escreve, nunca chama Bedrock, nunca acessa S3, e nunca publica Domain
 * Event — portanto esta role não recebe `events:PutEvents` (ver ADR-004,
 * regra para roles read-only).
 *
 * ADR-001 conecta ao Aurora Serverless v2 via Drizzle/node-postgres sobre
 * TCP (`DATABASE_URL`), não via RDS Data API — a restrição a leitura é
 * enforçada no nível do papel de banco Postgres usado pela conexão
 * (GRANT/REVOKE), não por IAM Policy. Esta role, portanto, concede apenas
 * a execução mínima de Lambda (logs) e nenhuma permissão adicional — a
 * ausência dessas permissões É a garantia de least privilege exigida
 * aqui, não uma omissão.
 */
export class ConsultaStatusLambdaRoleStack extends Stack {
  public readonly consultaStatusLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.consultaStatusLambdaRole = new iam.Role(this, 'ConsultaStatusLambdaRole', {
      roleName: 'ConsultaStatusLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
  }
}
