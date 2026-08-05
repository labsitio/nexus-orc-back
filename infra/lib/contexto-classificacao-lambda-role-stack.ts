import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ContextoClassificacaoLambdaRoleStackProps extends StackProps {
  /** Fila consumida pelo handler (`contexto-classificacao-queue`, T003/T004). */
  readonly contextoClassificacaoQueue: sqs.IQueue;
}

/**
 * Role dedicada da Lambda `RegistrarContextoClassificacao` (issue #624) —
 * least privilege, mesmo padrão de `IndexadorLambdaRoleStack` (#623):
 * - Nenhuma permissão Bedrock: `RegistrarContextoClassificacao` nunca invoca
 *   o Agente Orquestrador — só `ConsolidarEDecidirWorkflow` (fila
 *   `decisao-workflow-queue`) o faz.
 * - Nenhuma permissão `events:PutEvents`: este caso de uso nunca publica
 *   evento de domínio (plan.md — só persiste contexto).
 * - Nenhuma permissão S3: o contexto indexável já vem no payload do evento
 *   upstream.
 * - Nenhuma policy IAM para Postgres: `DrizzleDecisaoWorkflowRepository`
 *   conecta via TCP (`DATABASE_URL`, node-postgres), não via RDS Data API.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`contexto-classificacao-queue`).
 */
export class ContextoClassificacaoLambdaRoleStack extends Stack {
  public readonly contextoClassificacaoLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ContextoClassificacaoLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.contextoClassificacaoLambdaRole = new iam.Role(this, 'ContextoClassificacaoLambdaRole', {
      roleName: 'ContextoClassificacaoLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    props.contextoClassificacaoQueue.grantConsumeMessages(this.contextoClassificacaoLambdaRole);
  }
}
