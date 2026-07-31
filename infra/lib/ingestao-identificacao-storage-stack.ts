import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

const BUCKET_NAME = 'nexo-orcamentos-raw';

/** Prefixo dos uploads via presigned URL ainda não confirmados (T021/#26). */
const PREFIXO_UPLOAD_PENDENTE = 'pending-uploads/';

/**
 * Duplica `RETENCAO_UPLOAD_PENDENTE_HORAS` de
 * `src/.../infrastructure/s3-armazenamento-bruto.gateway.ts` — CDK roda via
 * Node nativo sem remapeamento `.js`→`.ts` (diferente de `tsc`/`vitest`), então
 * importar daquele módulo quebraria a resolução dos imports internos dele em
 * cascata; duplicar 1 constante inteira é mais barato que trocar o runtime do
 * CDK. Manter os dois valores em sincronia manualmente ao alterar qualquer um.
 *
 * ponytail: duplicação deliberada de uma constante — se crescer para mais de
 * um valor compartilhado entre `src/` e `infra/`, resolver o runtime do CDK
 * (ex.: `tsx` como app entrypoint) em vez de duplicar mais.
 */
const RETENCAO_UPLOAD_PENDENTE_HORAS = 2;

/**
 * Expiração do "órfão" de upload (T024/#29, ADR-002: "upload sem confirmação
 * nunca dispara pipeline" — mas o objeto fica no S3 mesmo assim se o cliente
 * nunca chamar `confirmar-upload`). Maior que `RETENCAO_UPLOAD_PENDENTE_HORAS`
 * (retenção Object Lock explícita do PUT presigned, `gerarUrlUpload`) — S3
 * Lifecycle nunca apaga objeto ainda sob Object Lock ativo, então a regra só
 * funciona de fato depois que essa retenção já tiver passado.
 */
const EXPIRACAO_UPLOAD_PENDENTE_DIAS = 1;

/**
 * Storage do BC Ingestão & Identificação (spec 001, T012).
 *
 * Princípio III (spec.md): dado bruto do fornecedor é imutável.
 * plan.md exige versionamento + Object Lock (governance) OU bucket policy
 * deny-overwrite/deny-delete — optamos por Object Lock porque bucket policy
 * de deny total em `s3:PutObject` bloquearia o próprio upload legítimo do
 * `S3ArmazenamentoBrutoGateway` (T019); com Object Lock, o PUT inicial segue
 * funcionando e cada versão gravada fica protegida contra delete/overwrite
 * pelo período de retenção. Modo GOVERNANCE (não COMPLIANCE): a garantia
 * depende de nenhuma IAM policy conceder `s3:BypassGovernanceRetention` —
 * hoje nenhuma role tem essa permissão; qualquer PR que conceda precisa
 * de revisão de segurança explícita referenciando esta nota.
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
    this.terminationProtection = true;

    if (EXPIRACAO_UPLOAD_PENDENTE_DIAS * 24 <= RETENCAO_UPLOAD_PENDENTE_HORAS) {
      throw new Error(
        'EXPIRACAO_UPLOAD_PENDENTE_DIAS precisa ser maior que RETENCAO_UPLOAD_PENDENTE_HORAS — ' +
          'senão a lifecycle rule tenta apagar objeto ainda sob Object Lock (S3 ignora silenciosamente).',
      );
    }

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
      lifecycleRules: [
        {
          id: 'ExpirarUploadPendenteNaoConfirmado',
          enabled: true,
          prefix: PREFIXO_UPLOAD_PENDENTE,
          expiration: Duration.days(EXPIRACAO_UPLOAD_PENDENTE_DIAS),
          noncurrentVersionExpiration: Duration.days(EXPIRACAO_UPLOAD_PENDENTE_DIAS),
        },
      ],
    });
  }
}
