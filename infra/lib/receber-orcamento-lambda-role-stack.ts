import { Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * Duplica `BUCKET_NAME` de `ingestao-identificacao-storage-stack.ts` — nunca
 * `props.orcamentosRawBucket.arnForObjects('*')` (issue #613, achado de
 * synth): passar a referência real do bucket criaria uma dependência
 * `ReceberOrcamentoLambdaRoleStack -> IngestaoIdentificacaoStorageStack` que,
 * somada a `IngestaoIdentificacaoStorageStack -> SftpUploadFunctionStack`
 * (notificação S3, mesma issue) e `SftpUploadFunctionStack ->
 * ReceberOrcamentoLambdaRoleStack` (role de execução), fecha um ciclo que o
 * CDK recusa a sintetizar (`DependencyCycle`). ARN de bucket S3 não carrega
 * conta/região — literal aqui é seguro e nunca diverge silenciosamente do
 * bucket real (mesmo nome fixo hardcoded na criação do bucket).
 */
const BUCKET_NAME = 'nexo-orcamentos-raw';

/**
 * IAM role dedicada (T026/#31) para o(s) Lambda(s) que executam
 * `ReceberOrcamento` — hoje `confirmar-upload` (T022/#27) e o trigger SFTP
 * (T023/#28). Least privilege: `s3:GetObject`/`s3:PutObject` restrito ao
 * bucket `nexo-orcamentos-raw`, mais `s3:PutObjectRetention` (exigido pela
 * URL presigned assinada com Object Lock explícito em `gerarUrlUpload`,
 * T021/#26, e pela cópia em `confirmarUpload`, T022/#27 — achado do
 * backend-reviewer). Nunca `s3:DeleteObject` nesta nem em nenhuma outra role
 * deste contexto (plan.md).
 */
export class ReceberOrcamentoLambdaRoleStack extends Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.role = new iam.Role(this, 'ReceberOrcamentoLambdaRole', {
      roleName: 'ReceberOrcamentoLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AcessoAoBucketDeOrcamentosBrutos',
        actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectRetention'],
        resources: [`arn:aws:s3:::${BUCKET_NAME}/*`],
      }),
    );
  }
}
