# T006 — Pré-requisito de infraestrutura: tagging do objeto S3 pelo AWS Transfer Family

## Contexto

`S3SftpTenantResolverGateway` (`src/bounded-contexts/ingestao-identificacao/infrastructure/s3-sftp-tenant-resolver.gateway.ts`)
lê as tags `aws:transfer:server-id` e `aws:transfer:user-name` do objeto S3 recém-gravado via
SFTP para resolver `tenantId` (join contra `sftp_tenant_mapping`).

**Estas tags NÃO são atribuídas automaticamente por padrão.** AWS Transfer Family só tagueia o
objeto se o servidor SFTP tiver um **Managed Workflow** configurado com um step `TAG` executado
após o upload (`onUpload`). Sem esse workflow, `GetObjectTagging` retorna `TagSet: []`,
`S3SftpTenantResolverGateway.resolver()` retorna `undefined` silenciosamente (log-only, não
lança erro — ver `sftp-upload.handler.ts`), e nenhum tenant é resolvido para nenhum arquivo SFTP.

Assim como o custom attribute Cognito (T004, `specs/007-isolamento-multitenant-dados/infra/cognito-custom-attribute-tenant-id.md`),
o servidor AWS Transfer Family em si não é provisionado por IaC neste repositório — por isso este
é um runbook/checklist de pré-requisito operacional, não uma stack CDK.

## Pré-requisito (executar/confirmar antes de T016 depender deste valor em produção)

Configurar o servidor Transfer Family (via console ou IaC do time de plataforma, fora deste repo)
com um Managed Workflow contendo, no mínimo, um step de tag após upload:

```json
{
  "Steps": [
    {
      "Type": "TAG",
      "TagStepDetails": {
        "Name": "TagTenantMetadata",
        "Tags": [
          { "Key": "aws:transfer:server-id", "Value": "${transfer:ServerId}" },
          { "Key": "aws:transfer:user-name", "Value": "${transfer:UserName}" }
        ]
      }
    }
  ]
}
```

Associar o workflow ao servidor via `OnUpload` (`aws transfer update-server --server-id <ID>
--workflow-details '{"OnUpload":[{"WorkflowId":"<WORKFLOW_ID>","ExecutionRole":"<ROLE_ARN>"}]}'`).

Referência: documentação AWS Transfer Family — Workflows / steps `TAG` (`https://docs.aws.amazon.com/transfer/latest/userguide/workflow-tag-step.html`).
**Não foi possível confirmar neste ambiente se algum servidor Transfer Family já existente já tem
esse workflow associado** — validar antes de T016 (Phase 3) passar a exigir `tenantId` obrigatório
para o canal SFTP.

## Validação

```bash
aws s3api get-object-tagging --bucket <BUCKET_RAW> --key sftp-incoming/<arquivo-de-teste>
```

Deve retornar `TagSet` contendo `aws:transfer:server-id` e `aws:transfer:user-name`. Ausência
confirma que o workflow não está configurado — `S3SftpTenantResolverGateway` continuará
retornando `undefined` para todo arquivo até isso ser corrigido.

## Risco residual (nesta fase, não bloqueante)

Enquanto o workflow não estiver confirmado/configurado, T006 resolve tenant como `undefined` para
100% dos arquivos SFTP (log-only, comportamento idêntico a hoje sem T006 — nenhuma regressão).
Isso só se torna um bloqueio real quando T016 tornar `tenantId` obrigatório em `ReceberOrcamento`
para todos os canais — rastrear a confirmação deste pré-requisito antes de iniciar T016.
