import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

const BUCKET_NAME = 'nexo-orcamentos-raw';

/**
 * Storage do BC Ingestão & Identificação (spec 001, T012).
 *
 * Princípio III (spec.md): dado bruto do fornecedor é imutável.
 * plan.md exige versionamento + Object Lock (governance) OU bucket policy
 * deny-overwrite/deny-delete — optamos por Object Lock porque bucket policy
 * de deny total em `s3:PutObject` bloquearia o próprio upload legítimo do
 * `S3ArmazenamentoBrutoGateway` (T019); com Object Lock, o PUT inicial segue
 * funcionando e cada versão gravada fica protegida contra delete/overwrite
 * pelo período de retenção, sem exceção nem para a conta root.
 *
 * ponytail: retenção fixada em 5 anos (GOVERNANCE) como default restritivo —
 * plan.md registra o SLA de retenção como "pendente de decisão de
 * produto/compliance"; ajustar a constante abaixo quando essa decisão sair
 * (nunca reduzir sem revisão de segurança, aumentar é seguro a qualquer momento).
 */
const RETENTION_PERIOD_DIAS_PENDENTE_DE_COMPLIANCE = 5 * 365;

export class IngestaoIdentificacaoStorageStack extends Stack {
  public readonly orcamentosRawBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const key = new kms.Key(this, 'OrcamentosRawKey', {
      alias: 'alias/nexo-orcamentos-raw',
      description:
        'Chave dedicada de criptografia do bucket de orçamentos brutos (Princípio III — dado imutável).',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.orcamentosRawBucket = new s3.Bucket(this, 'OrcamentosRawBucket', {
      bucketName: BUCKET_NAME,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(
        Duration.days(RETENTION_PERIOD_DIAS_PENDENTE_DE_COMPLIANCE),
      ),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
