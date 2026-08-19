import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as events from 'aws-cdk-lib/aws-events';
import type * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import type { Construct } from 'constructs';

/** Prefixo dos arquivos depositados via AWS Transfer Family (SFTP) — mesmo de `sftp-upload.handler.ts`. */
const PREFIXO_SFTP = 'sftp-incoming/';

export interface SftpUploadFunctionStackProps extends StackProps {
  /** Role least-privilege dedicada (`ReceberOrcamentoLambdaRoleStack`, T026). */
  readonly receberOrcamentoLambdaRole: iam.IRole;
  /** Bucket `nexo-orcamentos-raw` (`IngestaoIdentificacaoStorageStack`, T012) — trigger S3 no prefixo SFTP. */
  readonly orcamentosRawBucket: s3.Bucket;
  /** Bus de domínio único — nome usado por `EventBridgePublisher` em runtime. */
  readonly dominioBus: events.IEventBus;
  /**
   * Rede do Aurora Serverless v2 (mesmo ponto em aberto de `IndexadorFunctionStack`,
   * PR #662) — opcional porque nenhuma stack deste repositório provisiona
   * VPC/Aurora ainda. Passar `undefined` para `NodejsFunction` é seguro (CDK
   * trata como "sem VPC"); a prop existe para a stack de rede futura só
   * precisar passar os valores aqui, sem alterar esta stack.
   */
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
}

/**
 * `NodejsFunction` de produção do handler trigger S3 (`sftp-upload.handler.ts`,
 * T023/#28) — mesmo formato de `IndexadorFunctionStack` (#623, ADR-009):
 * - `entry` aponta para o `*.production.ts` fino (composição).
 * - `OutputFormat.ESM`: este repositório é `"type": "module"` (ESM nativo,
 *   `NodeNext`).
 * - Sem `NEXO_AGENTE_IA`: `ReceberOrcamento` nunca invoca Bedrock/MarkItDown
 *   (least privilege espelhado em `ReceberOrcamentoLambdaRoleStack`, que não
 *   concede `bedrock:InvokeModel`).
 * - `bucket.addEventNotification` liga o trigger S3 diretamente ao prefixo
 *   `sftp-incoming/` — o objeto já chega no bucket via AWS Transfer Family
 *   (ADR-002), sem fluxo de upload-url. `orcamentosRawBucket` entra aqui só
 *   para essa notificação (nunca no `environment` da função, achado de synth
 *   — `ReceberOrcamento` nem sequer lê o bucket): referenciá-lo também como
 *   variável de ambiente criaria `Function -> Storage`, que somado a
 *   `Storage -> Function` (a própria notificação) e `Function -> Role ->
 *   Storage` (IAM policy da role) fecharia um `DependencyCycle` que o CDK
 *   recusa a sintetizar.
 * - `DATABASE_URL` via `CfnParameter` (`NoEcho`): mesmo padrão das demais
 *   Lambdas de produção deste repositório.
 *   ponytail: promover para Secrets Manager quando outra Lambda também
 *   precisar de Postgres e a duplicação de parâmetro começar a incomodar.
 */
export class SftpUploadFunctionStack extends Stack {
  public readonly sftpUploadFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: SftpUploadFunctionStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    const databaseUrl = new CfnParameter(this, 'DatabaseUrl', {
      type: 'String',
      noEcho: true,
      description:
        'Connection string do Aurora Serverless v2 (via RDS Proxy) — nunca versionada, sempre parâmetro de deploy.',
    });

    this.sftpUploadFunction = new NodejsFunction(this, 'SftpUploadFunction', {
      entry:
        'src/bounded-contexts/ingestao-identificacao/interface/events/sftp-upload.production.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: props.receberOrcamentoLambdaRole,
      timeout: Duration.seconds(30),
      memorySize: 512,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        mainFields: ['module', 'main'],
      },
      environment: {
        NEXO_EVENT_BUS: props.dominioBus.eventBusName,
        DATABASE_URL: databaseUrl.valueAsString,
      },
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      securityGroups: props.securityGroups,
    });

    props.orcamentosRawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.sftpUploadFunction),
      { prefix: PREFIXO_SFTP },
    );
  }
}
