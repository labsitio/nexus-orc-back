# Scripts de infraestrutura

## `verificar-scp-segregacao-ambientes.sh` (spec 008, T011)

Teste de infraestrutura que valida, via `aws-cli`, que a Service Control
Policy (SCP) da conta dev/hml bloqueia:

- `rds:CopyDBSnapshot` com origem na conta de produção;
- `rds:RestoreDBInstanceFromDBSnapshot` com origem em snapshot de produção;
- `s3:CopyObject` com origem na conta de produção.

Ver `specs/008-hardening-seguranca-lgpd/plan.md` ("AWS Organizations") e
`tasks.md` (T011, User Story 1 — Segregação de Ambientes).

### Pré-requisitos (fora do escopo desta task, cabem a Ricardo/DevOps)

- T013: 3 contas AWS (dev, hml, prod) provisionadas sob a mesma AWS
  Organization.
- T014: SCP aplicada bloqueando as 3 ações acima com origem em prod.
- T015: role de deploy OIDC do GitHub Actions específica da conta dev/hml
  (nunca uma role única multi-conta) — necessária para autenticar o passo
  de pipeline que roda este script.
- Um snapshot RDS de teste e um objeto S3 de teste, **não sensíveis**, na
  conta de produção, usados apenas como alvo da tentativa de cópia/restore
  que se espera bloqueada.

Sem T013/T014, o script falha (ação não bloqueada) — isso é o esperado até
essas tasks serem entregues, não um defeito deste teste.

### Por que não roda no CI padrão (push/PR)

O pipeline `ci.yml` deste repositório não tem credenciais AWS nem acesso às
contas reais dev/hml/prod. Rodar este teste exige uma role de ambiente real
(T015) e não deve nunca rodar automaticamente contra produção — daí o script
se recusar a executar se a conta corrente for `AWS_PROD_ACCOUNT_ID`.

Ver `.github/workflows/verificar-scp-segregacao-ambientes.yml` para o job
de pipeline dedicado, disparado manualmente (`workflow_dispatch`) por
Ricardo/DevOps depois que T013–T015 estiverem prontas.

### Execução manual

```bash
AWS_PROD_ACCOUNT_ID=111111111111 \
PROD_RDS_SNAPSHOT_ARN=arn:aws:rds:us-east-1:111111111111:snapshot:teste-scp \
PROD_S3_TEST_OBJECT_URI=s3://nexo-prod-teste-scp/objeto-teste.txt \
TARGET_S3_BUCKET=nexo-hml-teste-scp \
./infra/scripts/verificar-scp-segregacao-ambientes.sh
```

Credenciais AWS ativas (via `aws sts get-caller-identity`) MUST ser da conta
dev ou hml — nunca da conta de produção.

### Saída esperada

`OK [<ação>]: bloqueado pela SCP (explicit deny).` para as 3 ações, e
exit code `0`. Qualquer ação que tenha sucesso é reportada como `CRÍTICO`
e o script sai com código `1` — indica ausência ou falha da SCP e possível
vazamento de dado de prod para dev/hml (guardrail não-negociável da spec
008, meta de 0 incidentes).
