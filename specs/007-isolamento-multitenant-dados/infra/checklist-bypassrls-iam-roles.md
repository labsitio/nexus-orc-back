# T009 — Checklist de infraestrutura: nenhuma role IAM/DB de Lambda com `BYPASSRLS`

## Status

Checklist concluído nesta task (T009, #272) para as roles hoje existentes em CDK
(`infra/lib/*.ts`). **Verificação contra Aurora real (dev/staging/prod) não foi executada por
este agente** — requer acesso operacional ao cluster que este repositório não provisiona (ver
"Contexto", mesmo padrão do runbook de T004 em `cognito-custom-attribute-tenant-id.md`). Rastrear
a execução por ambiente em issue operacional própria — ver "Ação operacional" abaixo.

Pré-requisito de aceite bloqueante para T018 e T028 (`tasks.md` §"Riscos de sequenciamento") e
gate de dependência de T031 (novas roles de Acompanhamento).

## Contexto

`BYPASSRLS` é atributo de **role do Postgres** (`CREATE ROLE ... BYPASSRLS`), não de IAM policy.
As policies IAM das Lambdas deste repo (ver `infra/lib/*-lambda-role-stack.ts`) nunca concedem
`rds-db:connect` nem qualquer ação de IAM Database Authentication — a conexão ao Aurora Serverless
v2 é feita via `DATABASE_URL` (node-postgres/Drizzle sobre TCP, ADR-001 de spec 001), autenticada
por usuário/senha do Postgres. Logo, o vetor de risco real de `BYPASSRLS` está inteiramente do lado
da **role de conexão do Postgres**, não da role IAM do Lambda — verificado abaixo em duas camadas
independentes.

O cluster Aurora Serverless v2 em si (assim como o User Pool Cognito) não é provisionado por
CDK/Terraform neste repositório em nenhuma das specs 001–007 — é gerenciado operacionalmente. Por
isso este documento é um checklist/runbook, não uma alteração de stack.

## Camada 1 — IAM (policy do Lambda)

Nenhuma das roles abaixo pode ter `rds-db:connect`, `AmazonRDSFullAccess`,
`AdministratorAccess` ou qualquer outra managed policy que amplie acesso a banco além do
`AWSLambdaBasicExecutionRole` (logs). Confirmado por leitura direta de `infra/lib/*.ts`:

| Role | Arquivo | Managed policies | Policy statements custom | Achado |
|---|---|---|---|---|
| `ClassificadorLambdaRole` | `infra/lib/classificador-lambda-role-stack.ts` | `AWSLambdaBasicExecutionRole` | `bedrock:InvokeModel`, `s3:GetObject`/`GetObjectVersion`, `lambda:InvokeFunction`, consumo da fila | OK — nenhuma ação de RDS/IAM DB auth |
| `ReceberOrcamentoLambdaRole` | `infra/lib/receber-orcamento-lambda-role-stack.ts` | `AWSLambdaBasicExecutionRole` | `s3:GetObject`/`PutObject`/`PutObjectRetention` | OK — nenhuma ação de RDS/IAM DB auth |
| `ConfirmarRevisaoHumanaLambdaRole` | `infra/lib/confirmar-revisao-humana-lambda-role-stack.ts` | `AWSLambdaBasicExecutionRole` | nenhuma (comentário explícito: ausência de Bedrock/S3 É o least privilege) | OK — nenhuma ação de RDS/IAM DB auth |
| `ConsultaStatusLambdaRole` (001, T048) | ainda não criada — spec 001 US4 não implementada | — | — | **Pendente**: aplicar esta mesma checklist quando a stack for criada (T048, #339 ou correspondente) |
| `AcompanhamentoAuditoriaConsumerLambdaRole` (007, T031) | ainda não criada — depende desta task (T009) | — | — | **Pendente**: aplicar esta checklist na criação (T031) |
| `ExportarAuditoriaLambdaRole` (007, T031) | ainda não criada — depende desta task (T009) | — | — | **Pendente**: aplicar esta checklist na criação (T031) |

Nota sobre o título desta issue (#272): cita também `RevisorLambdaRole`. Esse nome não existe em
`plan.md`/`tasks.md` de spec 001 nem de spec 007 — aparece apenas em specs 002/003/005 (Revisor
Humano de Extração/Validação/Orquestração), fora do escopo desta spec. Tratado como divergência do
título da issue vs. o `tasks.md` de origem (fonte de verdade); nenhuma ação tomada sobre roles de
outras specs.

## Camada 2 — Postgres (role de conexão)

A garantia estrutural é que a role Postgres usada pela `DATABASE_URL` de produção de **qualquer**
Lambda que acesse tabela tenant-scoped (`orcamentos`, `orcamentos_historico`, e futuramente
`auditoria_trilha_eventos`) seja criada com `NOSUPERUSER NOBYPASSRLS`:

```sql
-- criação da role de aplicação (uma vez por ambiente, fora deste repo)
CREATE ROLE nexo_app WITH LOGIN PASSWORD '<secret>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE nexo TO nexo_app;
GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nexo_app;
-- nunca GRANT ... TO nexo_app WITH BYPASSRLS — atributo de ROLE, não de GRANT de tabela
```

Validação (rodar em qualquer ambiente antes do deploy de cada Lambda que use `DrizzleTenantScopedRepositoryBase`):

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = current_user;
-- MUST retornar rolsuper = false, rolbypassrls = false
```

Já coberto automaticamente em CI/local por
`tests/security/isolamento-multitenant/rls-enforcement.test.ts` (T007, #270), que cria uma role
dedicada `NOSUPERUSER NOBYPASSRLS` e confirma adversarialmente que o isolamento cross-tenant se
sustenta mesmo com uma role real (não apenas configuração de catálogo) — ver
`specs/007-isolamento-multitenant-dados/qa/test-plan-T007.md`. A role local de dev/CI (`nexo`,
docker-compose) é `SUPERUSER BYPASSRLS=true` e **nunca** deve ser usada como modelo para a role de
produção — é exclusiva de ambiente de desenvolvimento.

## Ação operacional

Execução desta verificação (Camada 2) contra Aurora real de dev/staging/prod deve ser rastreada em
issue operacional própria, mesmo padrão de #469 (Cognito) — criar/associar issue com label `ops`
antes do primeiro deploy de produção que introduza `DrizzleTenantScopedRepositoryBase` (T008,
já mergeado) em uso ativo (T018/T028).

## Conclusão

- Camada 1 (IAM): **confirmado** — nenhuma das 3 roles existentes concede `rds-db:connect` ou
  qualquer ação equivalente a IAM DB auth; nenhuma tem `BYPASSRLS` porque `BYPASSRLS` não é um
  conceito de IAM.
- Camada 2 (Postgres): **especificado e testado adversarialmente em CI/local**; execução contra
  ambiente real depende de ação operacional fora do escopo de código deste repositório (rastreada
  separadamente).
- Roles ainda não criadas (`ConsultaStatusLambdaRole`, `AcompanhamentoAuditoriaConsumerLambdaRole`,
  `ExportarAuditoriaLambdaRole`) MUST seguir este mesmo checklist (ambas as camadas) no momento de
  sua criação — referenciar este documento no PR que as introduzir.
