# T004 — Custom attribute `custom:tenant_id` no Cognito User Pool

## Status

Documentação/runbook concluído nesta task (T004, #267). **Execução real em cada ambiente
(dev/staging/prod) não foi feita por este agente** — requer acesso operacional a um User Pool
existente que este repositório não provisiona nem gerencia (ver "Contexto"). Rastrear a execução
por ambiente em issue operacional própria — #469 — fora do board de tasks técnicas de spec 007
(T005 em diante consome `custom:tenant_id` assumindo que a execução deste runbook já ocorreu antes
do deploy do `TenantContextMiddleware`).

## Contexto

O User Pool Cognito usado pelos endpoints REST (`auth-cognito.middleware.ts`, spec 001 T025) não é
provisionado por IaC neste repositório — não existe (e nunca existiu, em nenhuma das specs 001-006)
uma stack CDK/Terraform que crie o User Pool em si. Ele é gerenciado operacionalmente, fora deste
monorepo (consistente com "Fora de escopo" do `spec.md` desta feature: onboarding de tenant é
processo operacional manual).

Por isso este runbook, e não uma stack CDK, é o artefato de T004: adicionar um custom attribute a um
User Pool já existente é uma mutação de schema **irreversível** (Cognito não permite remover um
custom attribute depois de criado) e deve ser executada uma única vez, deliberadamente, por quem
tem acesso operacional ao pool — não por deploy automático de uma stack de aplicação.

## Pré-requisitos

- IAM principal executando o comando precisa da permissão `cognito-idp:AddCustomAttributes`,
  restrita ao ARN do User Pool alvo (ver política abaixo).
- Confirmar o `user-pool-id` correto (ambiente de destino) antes de rodar — não há como desfazer.
- **Risco operacional**: tanto a criação do atributo (`Mutable=false`) quanto a primeira atribuição
  de valor por usuário no onboarding são irreversíveis — não existe API de correção. Um erro na
  primeira atribuição de `custom:tenant_id` de um usuário só se corrige recriando o usuário no
  Cognito. Validar o valor antes de confirmar o onboarding de cada tenant.

## Passo 0 — checar se o atributo já existe (idempotência)

```bash
aws cognito-idp describe-user-pool --user-pool-id <USER_POOL_ID> \
  --query "UserPool.SchemaAttributes[?Name=='custom:tenant_id']"
```

Saída não vazia → atributo já provisionado, **não** rodar o comando da seção seguinte (evita erro
`InvalidParameterException` de tentar recriar um atributo existente).

## Comando (executar uma vez, por ambiente)

```bash
aws cognito-idp add-custom-attributes \
  --user-pool-id <USER_POOL_ID> \
  --custom-attributes \
    Name=tenant_id,AttributeDataType=String,Mutable=false,Required=false,StringAttributeConstraints="{MinLength=36,MaxLength=36}"
```

- `Mutable=false` → satisfaz o requisito "imutável pós-onboarding" (ADR de spec 007): uma vez setado
  para um usuário, não pode ser alterado, nem por ele nem por um admin, via API de update de atributo.
- `MinLength=36,MaxLength=36` → formato UUID (mesmo formato de `TenantId`, `src/shared-kernel/tenant/tenant-id.vo.ts`).
- `Required=false` → obrigatório em Cognito só se setado no signup; o valor é sempre atribuído no
  onboarding operacional do tenant (fora de escopo, conforme `spec.md`), nunca no self-signup.

## IAM policy mínima para quem executa o comando

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["cognito-idp:AddCustomAttributes", "cognito-idp:DescribeUserPool"],
      "Resource": "arn:aws:cognito-idp:<REGION>:<ACCOUNT_ID>:userpool/<USER_POOL_ID>"
    }
  ]
}
```

## Atribuição do valor por usuário (fora de escopo desta task)

Setar `custom:tenant_id` no usuário (via `AdminUpdateUserAttributes`, uma única vez, no onboarding)
é responsabilidade do processo operacional de onboarding do tenant — ver "Fora de escopo" em
`specs/007-isolamento-multitenant-dados/spec.md`. Esta task cobre apenas a definição do atributo no
schema do pool, pré-requisito estrutural para que T005 (`TenantContextMiddleware`) tenha uma claim
para ler.

## Validação

```bash
aws cognito-idp describe-user-pool --user-pool-id <USER_POOL_ID> \
  --query "UserPool.SchemaAttributes[?Name=='custom:tenant_id']"
```

Deve retornar o atributo com `Mutable: false` e `AttributeDataType: String`.
