import { Stack, type StackProps } from 'aws-cdk-lib';
import type * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface ConfirmarRevisaoHumanaLambdaRoleStackProps extends StackProps {
  /** Bus de domínio único — `ConfirmarRevisaoHumana` publica `OrcamentoReclassificadoPorRevisaoHumana`. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Role dedicada da Lambda de confirmação humana (T054/#59, T064/#579) —
 * least privilege, nunca role ampla compartilhada entre os Lambdas deste
 * contexto (plan.md §Infrastructure/IAM): "escrita restrita à tabela deste
 * contexto, sem acesso a Bedrock/S3 raw".
 *
 * ADR-001 conecta ao Aurora Serverless v2 via Drizzle/node-postgres sobre
 * TCP (`DATABASE_URL`), não via RDS Data API — o controle de escrita
 * restrita à tabela deste contexto (`orcamentos`/`orcamentos_historico`)
 * é enforçado no nível do papel de banco Postgres usado pela conexão
 * (GRANT/REVOKE), não por IAM Policy. Esta role, portanto, não concede
 * `bedrock:InvokeModel` nem `s3:*` — a ausência dessas permissões É a
 * garantia de least privilege exigida aqui, não uma omissão.
 *
 * `events:PutEvents` (T064, ADR-004) é a única permissão adicional além de
 * logs, e ainda assim é least privilege: restrita ao ARN do bus de domínio
 * e a uma `Condition` dupla — `events:source` = `nexo.ingestao-identificacao`
 * **e** `events:detail-type` = `OrcamentoReclassificadoPorRevisaoHumana`.
 * Necessária porque `ConfirmarRevisaoHumana.executar` publica esse evento
 * via `EventBridgePublisher`; sem ela o handler falha com
 * `AccessDeniedException` em runtime e bloqueia US5.
 */
export class ConfirmarRevisaoHumanaLambdaRoleStack extends Stack {
  public readonly confirmarRevisaoHumanaLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ConfirmarRevisaoHumanaLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.confirmarRevisaoHumanaLambdaRole = new iam.Role(this, 'ConfirmarRevisaoHumanaLambdaRole', {
      roleName: 'ConfirmarRevisaoHumanaLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.confirmarRevisaoHumanaLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublicarOrcamentoReclassificadoPorRevisaoHumanaNoBusDeDominio',
        actions: ['events:PutEvents'],
        resources: [props.dominioBus.eventBusArn],
        conditions: {
          StringEquals: {
            'events:source': 'nexo.ingestao-identificacao',
            'events:detail-type': 'OrcamentoReclassificadoPorRevisaoHumana',
          },
        },
      }),
    );
  }
}
