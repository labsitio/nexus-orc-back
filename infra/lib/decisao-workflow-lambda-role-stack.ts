import { CfnParameter, Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface DecisaoWorkflowLambdaRoleStackProps extends StackProps {
  /** Fila consumida pelo handler (`decisao-workflow-queue`, T003/T006). */
  readonly decisaoWorkflowQueue: sqs.IQueue;
  /** Bus de domínio único — publica o evento de desfecho (`ConsolidarEDecidirWorkflow`, T028). */
  readonly dominioBus: events.IEventBus;
}

/**
 * Role dedicada da Lambda `ConsolidarEDecidirWorkflow` (issue #624) — least
 * privilege. Única das 3 Lambdas deste BC que decide (invoca o Agente
 * Orquestrador via Bedrock) e publica evento de desfecho — por isso é a
 * única a receber `bedrock:InvokeModel`/`events:PutEvents`:
 * - `bedrock:InvokeModel` restrito ao ARN do modelo do Orquestrador aprovado
 *   (parâmetro de deploy, nunca wildcard `*` em `Resource`) —
 *   `BedrockOrquestradorGateway` é o único consumidor de Bedrock deste BC.
 * - `events:PutEvents` restrito ao ARN do bus único (ADR-004) — necessário
 *   porque `ConsolidarEDecidirWorkflow.executar` publica o evento de
 *   desfecho (aprovação/encaminhamento/reenvio/escalonamento) via
 *   `EventBridgePublisher` a cada mensagem processada.
 * - Nenhuma permissão S3: o contexto consolidado já vem persistido no
 *   agregado, nunca lido do bucket de bruto.
 * - Nenhuma policy IAM para Postgres: `DrizzleDecisaoWorkflowRepository`
 *   conecta via TCP (`DATABASE_URL`, node-postgres), não via RDS Data API.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`decisao-workflow-queue`).
 */
export class DecisaoWorkflowLambdaRoleStack extends Stack {
  public readonly decisaoWorkflowLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: DecisaoWorkflowLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const modeloOrquestradorAprovadoArn = new CfnParameter(this, 'ModeloOrquestradorAprovadoArn', {
      type: 'String',
      description:
        'ARN do modelo Bedrock do Agente Orquestrador aprovado — least privilege, nunca "*" em Resource.',
    });

    this.decisaoWorkflowLambdaRole = new iam.Role(this, 'DecisaoWorkflowLambdaRole', {
      roleName: 'DecisaoWorkflowLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.decisaoWorkflowLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarModeloOrquestradorAprovado',
        actions: ['bedrock:InvokeModel'],
        resources: [modeloOrquestradorAprovadoArn.valueAsString],
      }),
    );

    this.decisaoWorkflowLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublicarNoBusDeDominio',
        actions: ['events:PutEvents'],
        resources: [props.dominioBus.eventBusArn],
      }),
    );

    props.decisaoWorkflowQueue.grantConsumeMessages(this.decisaoWorkflowLambdaRole);
  }
}
