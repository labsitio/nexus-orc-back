import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ContextoExtracaoLambdaRoleStackProps extends StackProps {
  /** Fila consumida pelo handler (`contexto-extracao-queue`, T003/T005). */
  readonly contextoExtracaoQueue: sqs.IQueue;
}

/**
 * Role dedicada da Lambda `RegistrarContextoExtracao` (issue #624) — least
 * privilege, mesmo padrão de `ContextoClassificacaoLambdaRoleStack`:
 * - Nenhuma permissão Bedrock, nenhuma `events:PutEvents`: este caso de uso
 *   nunca decide nem publica evento de domínio — só persiste contexto.
 * - Nenhuma permissão S3: o contexto indexável já vem no payload do evento
 *   upstream.
 * - Nenhuma policy IAM para Postgres: `DrizzleDecisaoWorkflowRepository`
 *   conecta via TCP (`DATABASE_URL`, node-postgres), não via RDS Data API.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`contexto-extracao-queue`).
 */
export class ContextoExtracaoLambdaRoleStack extends Stack {
  public readonly contextoExtracaoLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ContextoExtracaoLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.contextoExtracaoLambdaRole = new iam.Role(this, 'ContextoExtracaoLambdaRole', {
      roleName: 'ContextoExtracaoLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    props.contextoExtracaoQueue.grantConsumeMessages(this.contextoExtracaoLambdaRole);
  }
}
