import { CfnParameter, Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface IndexadorLambdaRoleStackProps extends StackProps {
  /** Fila consumida pelo handler (`indexador-queue`, T004/#164). */
  readonly indexadorQueue: sqs.IQueue;
  /** Bus de domínio único — publica `OrcamentoIndexado`/`FalhaIndexacaoDetectada` (T029). */
  readonly dominioBus: events.IEventBus;
}

/**
 * Role dedicada da Lambda `IndexarOrcamento` (issue #623) — least privilege,
 * mesmo padrão de `ValidarOrcamentoLambdaRoleStack` (spec 003, T028):
 * - `bedrock:InvokeModel` restrito ao ARN do modelo de embedding aprovado
 *   (parâmetro de deploy, nunca wildcard `*` em `Resource`) —
 *   `BedrockEmbeddingGateway` (T028) é o único consumidor de Bedrock deste
 *   contexto.
 * - `events:PutEvents` restrito ao ARN do bus único (ADR-004) — necessário
 *   porque `IndexarOrcamento.executar` publica `OrcamentoIndexado`
 *   (sucesso) ou `FalhaIndexacaoDetectada` (falha técnica) via
 *   `EventBridgePublisher` a cada mensagem processada.
 * - Nenhuma permissão S3: este BC nunca lê o bucket de bruto (plan.md) — o
 *   texto indexável já vem no payload do evento upstream.
 * - Nenhuma policy IAM para Postgres: `DrizzlePgvectorIndiceOrcamentoRepository`
 *   conecta via TCP (`DATABASE_URL`, node-postgres), não via RDS Data API —
 *   mesma nota já registrada em `ValidarOrcamentoLambdaRoleStack`.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`indexador-queue`).
 */
export class IndexadorLambdaRoleStack extends Stack {
  public readonly indexadorLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: IndexadorLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const modeloEmbeddingAprovadoArn = new CfnParameter(this, 'ModeloEmbeddingAprovadoArn', {
      type: 'String',
      description:
        'ARN do modelo Bedrock de embedding aprovado (Titan Text Embeddings V2) — least privilege, nunca "*" em Resource.',
    });

    this.indexadorLambdaRole = new iam.Role(this, 'IndexadorLambdaRole', {
      roleName: 'IndexadorLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.indexadorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvocarModeloEmbeddingAprovado',
        actions: ['bedrock:InvokeModel'],
        resources: [modeloEmbeddingAprovadoArn.valueAsString],
      }),
    );

    this.indexadorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublicarNoBusDeDominio',
        actions: ['events:PutEvents'],
        resources: [props.dominioBus.eventBusArn],
      }),
    );

    props.indexadorQueue.grantConsumeMessages(this.indexadorLambdaRole);
  }
}
