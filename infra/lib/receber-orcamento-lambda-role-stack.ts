import { Stack, type StackProps } from 'aws-cdk-lib';
import type * as events from 'aws-cdk-lib/aws-events';
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
 *
 * Confirmado empiricamente (issue #613, achado do `backend-reviewer`):
 * passar `bucketArn`/`bucketName` como prop *string* também reabre o mesmo
 * ciclo — são Tokens ligados ao recurso real, não literais, então o CDK
 * ainda cria o cross-stack reference independente do tipo TS da prop.
 */
const BUCKET_NAME = 'nexo-orcamentos-raw';

export interface ReceberOrcamentoLambdaRoleStackProps extends StackProps {
  /** Bus de domínio único — `ReceberOrcamento` publica `OrcamentoRecebido` (T016/#18). */
  readonly dominioBus: events.IEventBus;
}

/**
 * IAM role dedicada (T026/#31) para o(s) Lambda(s) que executam
 * `ReceberOrcamento` — hoje `confirmar-upload` (T022/#27) e o trigger SFTP
 * (T023/#28). Least privilege: `s3:GetObject`/`s3:PutObject` restrito ao
 * bucket `nexo-orcamentos-raw`, mais `s3:PutObjectRetention` (exigido pela
 * URL presigned assinada com Object Lock explícito em `gerarUrlUpload`,
 * T021/#26, e pela cópia em `confirmarUpload`, T022/#27 — achado do
 * backend-reviewer). Nunca `s3:DeleteObject` nesta nem em nenhuma outra role
 * deste contexto (plan.md).
 *
 * `events:PutEvents` (T061, ADR-004) restrito ao ARN do bus + `Condition`
 * `events:source`: `ReceberOrcamento.executar` publica `OrcamentoRecebido`
 * via `EventBridgePublisher` a cada execução — sem essa permissão, o
 * primeiro invoke real em produção (`SftpUploadFunctionStack`, issue #613)
 * falha ao publicar com `AccessDeniedException` (achado BLOCKER do
 * `backend-reviewer`).
 */
export class ReceberOrcamentoLambdaRoleStack extends Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ReceberOrcamentoLambdaRoleStackProps) {
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

    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublicarOrcamentoRecebidoNoBusDeDominio',
        actions: ['events:PutEvents'],
        resources: [props.dominioBus.eventBusArn],
        conditions: {
          StringEquals: { 'events:source': 'nexo.ingestao-identificacao' },
        },
      }),
    );
  }
}
