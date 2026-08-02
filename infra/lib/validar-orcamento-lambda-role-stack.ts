import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface ValidarOrcamentoLambdaRoleStackProps extends StackProps {
  /** Fila consumida pelo handler (`validador-queue`, T003/T004). */
  readonly validadorQueue: sqs.IQueue;
}

/**
 * Role dedicada da Lambda `ValidarOrcamento` (T028/#138) — least privilege,
 * nunca role ampla compartilhada entre os Lambdas deste contexto (plan.md
 * §Infrastructure/IAM, linha 136):
 * - Leitura da tabela de configuração `faixas_preco_categoria` é feita via
 *   Drizzle/node-postgres sobre TCP (`DATABASE_URL`), não via RDS Data API
 *   (ADR-001, mesmo padrão de `ConfirmarRevisaoHumanaLambdaRoleStack`) — o
 *   controle de acesso restrito a essa tabela é enforçado no nível do papel
 *   de banco Postgres usado pela conexão (GRANT/REVOKE), não por IAM Policy.
 * - Nenhuma permissão sobre o bucket `nexo-orcamentos-raw`: esta spec nunca
 *   precisa de dado bruto (plan.md linha 154, "Nenhuma leitura de dado
 *   bruto"). A ausência dessa permissão É a garantia exigida, não omissão.
 * - Nenhum `bedrock:InvokeModel` aqui — é adicionado somente por T045 (US3,
 *   categorização de item), restrito ao ARN do modelo aprovado.
 * - Permissões mínimas de execução Lambda (logs) e de consumo da própria
 *   fila (`validador-queue`).
 */
export class ValidarOrcamentoLambdaRoleStack extends Stack {
  public readonly validarOrcamentoLambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: ValidarOrcamentoLambdaRoleStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.validarOrcamentoLambdaRole = new iam.Role(this, 'ValidarOrcamentoLambdaRole', {
      roleName: 'ValidarOrcamentoLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    props.validadorQueue.grantConsumeMessages(this.validarOrcamentoLambdaRole);
  }
}
