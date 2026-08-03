import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * Role dedicada da Lambda `RegistrarDecisaoHumanaValidacao` (T037/#147) —
 * least privilege, nunca role ampla compartilhada entre os Lambdas deste
 * contexto (plan.md §Infrastructure/IAM, linha 138).
 *
 * O controller `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana`
 * (T036) só lê/escreve o agregado `OrcamentoValidacao` via
 * `OrcamentoValidacaoRepository` (ADR-001: Aurora Serverless v2 via
 * Drizzle/node-postgres sobre TCP, `DATABASE_URL` — não RDS Data API) e
 * publica `OrcamentoValidado`/`OrcamentoValidadoComRessalva` via
 * `EventPublisher`. Igual ao `ConfirmarRevisaoHumanaLambdaRoleStack` da spec
 * 001 (T054) e ao `ConfirmarRevisaoHumanaExtracaoLambdaRoleStack` da spec 002
 * (T040), a publicação em `nexo-dominio-bus` não exige policy adicional
 * nesta role (mesmo padrão já estabelecido nas roles irmãs deste produto).
 * Não há `bedrock:InvokeModel` nem `s3:*` — a ausência dessas permissões É a
 * garantia de least privilege exigida aqui, não uma omissão: este caso de
 * uso nunca lê o bucket `nexo-orcamentos-raw` nem invoca modelo Bedrock
 * (plan.md linha 156, "Nenhuma leitura de dado bruto").
 */
export class RegistrarDecisaoHumanaValidacaoLambdaRoleStack extends Stack {
  public readonly registrarDecisaoHumanaValidacaoLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.registrarDecisaoHumanaValidacaoLambdaRole = new iam.Role(
      this,
      'RegistrarDecisaoHumanaValidacaoLambdaRole',
      {
        roleName: 'RegistrarDecisaoHumanaValidacaoLambdaRole',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      },
    );
  }
}
