import type { S3Event, S3Handler } from 'aws-lambda';
import type { Logger } from 'pino';
import type { ReceberOrcamento } from '../../application/use-cases/receber-orcamento.js';
import type { SftpTenantResolverGateway } from '../../domain/gateways/sftp-tenant-resolver.gateway.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';
import { ReferenciaS3 } from '../../domain/value-objects/referencia-s3.vo.js';

/** Prefixo do canal SFTP — o mesmo usado pela regra de notificação S3/Transfer Family (plan.md). */
const PREFIXO_SFTP = 'sftp-incoming/';

/**
 * Handler Lambda (T023/#28): trigger de notificação S3 no prefixo
 * `sftp-incoming/` — o arquivo já está no bucket via AWS Transfer Family, sem
 * fluxo de upload-url (ADR-002). Chama `ReceberOrcamento(canal=SFTP, ...)`
 * diretamente com a referência do próprio evento (bucket/key/versionId),
 * sem re-ler nem re-gravar o objeto.
 *
 * Notificação S3 é entrega "at-least-once" (redelivery da AWS) e este `for`
 * reprocessa o lote inteiro se um registro no meio falhar — por isso usa
 * `bucket/key#versionId` como `Idempotency-Key` (achado MAJOR do
 * backend-reviewer): reaproveita o mesmo gate de admissão de `ReceberOrcamento`
 * para nunca publicar `OrcamentoRecebido` duplicado num reprocessamento.
 *
 * `resolverTenant` (T006, spec 007): resolve `tenantId` do mapeamento
 * usuário/servidor AWS Transfer Family, nunca do conteúdo do arquivo.
 * `ReceberOrcamento` exige `tenantId` (T016, spec 007, formaliza a exigência
 * para todos os canais uniformemente): mapeamento ausente é registrado via
 * logger estruturado (T017/#020, campos bucket/key/versionId estruturados para
 * consulta em CloudWatch Logs Insights) e o registro é pulado (sem lançar, sem
 * bloquear o resto do lote) — fica para reprocessamento quando o onboarding do
 * par usuário/servidor em `sftp_tenant_mapping` existir.
 */
export function criarHandlerSftpUpload(
  receberOrcamento: ReceberOrcamento,
  resolverTenant: SftpTenantResolverGateway,
  logger: Logger = criarLogger({ handler: 'sftp-upload' }),
): S3Handler {
  return async (event: S3Event) => {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      if (!key.startsWith(PREFIXO_SFTP)) {
        continue;
      }

      const versionId = record.s3.object.versionId;
      if (!versionId) {
        throw new Error(
          `Evento S3 sem versionId para s3://${bucket}/${key} — bucket precisa de versionamento habilitado`,
        );
      }

      const referenciaBruta = ReferenciaS3.de({ bucket, key, versionId });
      const tenantId = await resolverTenant.resolver(referenciaBruta);
      if (!tenantId) {
        logger
          .child({ bucket, key, versionId })
          .warn(
            'TenantId não resolvido — mapeamento usuário/servidor ausente em sftp_tenant_mapping (onboarding pendente?), registro pulado',
          );
        continue;
      }

      await receberOrcamento.executar({
        canal: 'SFTP',
        referenciaBruta,
        idempotencyKey: `${bucket}/${key}#${versionId}`,
        tenantId,
      });
    }
  };
}
