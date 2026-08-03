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

## `verificar-contrato-assume-role-por-conta.sh` (spec 008, T012)

Teste de contrato que valida, via `aws-cli`, que a role de deploy de CI/CD
(OIDC) do ambiente corrente **não consegue assumir** a role de deploy de
nenhum outro ambiente — `sts:AssumeRole` restrito por conta, reforçando que
cada ambiente tem sua própria role de deploy (T015), nunca uma role única
multi-conta.

Ver `specs/008-hardening-seguranca-lgpd/spec.md` ("Segregação de
ambientes") e `tasks.md` (T012, User Story 1 — Segregação de Ambientes).

### Pré-requisitos (fora do escopo desta task, cabem a Ricardo/DevOps)

- T013: 3 contas AWS (dev, hml, prod) provisionadas sob a mesma AWS
  Organization.
- T015: role de deploy OIDC do GitHub Actions específica de cada conta
  (dev/hml/prod), com trust policy que não confia em outras contas.

Sem T015, o script falha (AssumeRole não bloqueado, ou role inexistente) —
isso é o esperado até essa task ser entregue, não um defeito deste teste.

### Por que não roda no CI padrão (push/PR)

Mesmo motivo do teste de SCP acima: exige credenciais reais de uma role de
deploy de ambiente (T015) e nunca deve rodar contra produção — o script se
recusa a executar se a conta corrente for `AWS_PROD_ACCOUNT_ID`.

Ver `.github/workflows/verificar-contrato-assume-role-por-conta.yml` para
o job de pipeline dedicado, disparado manualmente (`workflow_dispatch`)
por Ricardo/DevOps depois que T015 estiver pronta.

### Execução manual

```bash
AWS_PROD_ACCOUNT_ID=111111111111 \
OUTRAS_DEPLOY_ROLE_ARNS="arn:aws:iam::222222222222:role/nexo-deploy-hml arn:aws:iam::111111111111:role/nexo-deploy-prod" \
./infra/scripts/verificar-contrato-assume-role-por-conta.sh
```

Credenciais AWS ativas (via `aws sts get-caller-identity`) MUST ser da role
de deploy de dev ou hml — nunca da role de produção.

### Saída esperada

`OK [AssumeRole -> <arn>]: bloqueado (AccessDenied)` para cada role de
outro ambiente testada, e exit code `0`. Qualquer AssumeRole que tenha
sucesso é reportado como `CRÍTICO` e o script sai com código `1` — indica
que a role de deploy corrente pode agir sobre outro ambiente/conta,
violando a segregação exigida (guardrail não-negociável da spec 008).
