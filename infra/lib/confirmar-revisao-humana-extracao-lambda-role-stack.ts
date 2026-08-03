import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * Role dedicada da Lambda de confirmação humana da Extração (T040/#105) —
 * least privilege, nunca role ampla compartilhada entre os Lambdas deste
 * contexto (plan.md §Infrastructure/IAM).
 *
 * `ConfirmarRevisaoHumanaExtracao` (T038) só lê/escreve o agregado
 * `ExtracaoOrcamento` via `ExtracaoOrcamentoRepository` (ADR-001: Aurora
 * Serverless v2 via Drizzle/node-postgres sobre TCP, `DATABASE_URL` — não
 * RDS Data API) e publica `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * via `EventPublisher`. Igual ao `ExtratorLambdaRoleStack` (T026) e ao
 * `ConfirmarRevisaoHumanaLambdaRoleStack` da spec 001 (T054), a publicação em
 * `nexo-dominio-bus` não exige policy adicional nesta role (mesmo padrão já
 * estabelecido nas roles irmãs deste produto). Não há `bedrock:InvokeModel`
 * nem `s3:*` — a ausência dessas permissões É a garantia de least privilege
 * exigida aqui, não uma omissão: este caso de uso nunca lê o bucket
 * `nexo-orcamentos-raw` nem invoca modelo Bedrock.
 */
export class ConfirmarRevisaoHumanaExtracaoLambdaRoleStack extends Stack {
  public readonly confirmarRevisaoHumanaExtracaoLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.confirmarRevisaoHumanaExtracaoLambdaRole = new iam.Role(
      this,
      'ConfirmarRevisaoHumanaExtracaoLambdaRole',
      {
        roleName: 'ConfirmarRevisaoHumanaExtracaoLambdaRole',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      },
    );
  }
}
