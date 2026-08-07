# T7 (ADR-010) — Grupos Cognito de papel e `AdminAddUserToGroup`

## Status

Documentação/runbook concluído nesta task (T7 de ADR-010, #691). **Execução real em cada
ambiente (dev/staging/prod) não foi feita por este agente** — requer acesso operacional a um
User Pool existente que este repositório não provisiona nem gerencia (ver "Contexto"). Rastrear a
execução por ambiente em issue operacional própria, mesmo padrão de `custom:tenant_id` (#469).

## Contexto

ADR-010 (`docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`, PR #683) decidiu
verificar papel de autorização via grupos Cognito nativos (`cognito:groups`), lidos do mesmo
access token já verificado pelo `TenantContextMiddleware` — sem segunda chamada de `verify()` e
sem custom attribute (`custom:papel`) adicional.

**Consequência operacional direta da decisão**: `cognito:groups` só existe na claim se o grupo
existir no User Pool **e** o usuário tiver sido adicionado a ele. Grupo inexistente não é erro de
validação — o `role-guard` (spec 005/003, T2 do ADR) simplesmente nunca vê o papel esperado na
lista, e a requisição recebe 403 `sem-permissao` para **todo** usuário, mesmo os que deveriam ter
acesso. Não há fallback nem grace period: a decisão do ADR só funciona com este runbook executado
**antes** do deploy do guard nas rotas gated (T4/T5 do ADR — `workflow/decisao-humana`,
`faixas-preco-categoria`).

O User Pool usado pelos endpoints REST (`auth-cognito.middleware.ts`, spec 001 T025) não é
provisionado por IaC neste repositório (mesma premissa de
`cognito-custom-attribute-tenant-id.md`, T004 de spec 007) — gerenciado operacionalmente, fora
deste monorepo. Por isso runbook, e não uma stack CDK/Terraform: criar grupo e atribuir usuário são
mutações administrativas em um recurso que este repo não possui nem versiona.

## Papéis (nomes exatos — não inventar nem renomear)

Publicados em `docs/openapi.yaml:694` (`securitySchemes.cognitoAuth.description`) e usados pelo
ADR-010:

| Grupo Cognito | Consumido por | Origem do nome |
|---|---|---|
| `comprador-responsavel` | `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana` (spec 005, issue #250/T044) | spec 005 T044 |
| `compliance-admin` | `POST /v1/configuracoes/faixas-preco-categoria` (spec 003, T044) | spec 003 T044 |

## Pré-requisitos

- IAM principal executando os comandos precisa de `cognito-idp:CreateGroup`,
  `cognito-idp:GetGroup`, `cognito-idp:AdminAddUserToGroup` e
  `cognito-idp:AdminListGroupsForUser`, restrito ao ARN do User Pool alvo (ver política abaixo).
- Confirmar o `user-pool-id` do ambiente de destino antes de rodar.
- Este runbook é **por ambiente** (dev/staging/prod têm User Pools distintos) — repetir os passos
  em cada um, na ordem: criar os grupos primeiro, depois atribuir usuários.

## Passo 0 — checar se o grupo já existe (idempotência)

`CreateGroup` falha com `GroupExistsException` se o grupo já existir — checar antes evita
depender de tratamento de erro no script de onboarding:

```bash
aws cognito-idp get-group \
  --user-pool-id <USER_POOL_ID> \
  --group-name comprador-responsavel
```

Saída sem erro → grupo já existe, **não** rodar `create-group` para esse nome. Repetir para
`compliance-admin`.

## Passo 1 — criar os grupos (executar uma vez, por ambiente)

```bash
aws cognito-idp create-group \
  --user-pool-id <USER_POOL_ID> \
  --group-name comprador-responsavel \
  --description "Papel de autorização — aprova decisao-humana em workflow de orçamento (spec 005)"

aws cognito-idp create-group \
  --user-pool-id <USER_POOL_ID> \
  --group-name compliance-admin \
  --description "Papel de autorização — administra faixas de preço por categoria (spec 003)"
```

- Nome do grupo é **case-sensitive** e é o valor literal que aparece em `cognito:groups` no JWT —
  usar exatamente `comprador-responsavel` e `compliance-admin`, sem variação de maiúsculas/hífen.
- Não definir `--precedence`: a decisão do ADR não usa `cognito:preferred_role` (sem federação IAM
  por grupo), então precedência é irrelevante aqui.

## Passo 2 — atribuir usuário a um grupo (`AdminAddUserToGroup`)

Executado no onboarding de cada usuário que precisa do papel, e sempre que o papel de um usuário
existente muda:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <USER_POOL_ID> \
  --username <USERNAME_OU_SUB> \
  --group-name comprador-responsavel
```

Repetir com `--group-name compliance-admin` para o outro papel. Um usuário pode pertencer a
múltiplos grupos simultaneamente (o `role-guard` do ADR aceita "papel está em `request.papeis`",
não exclusividade).

### Efeito de propagação (não é revogação instantânea)

`cognito:groups` é lido do access token, com validade padrão de Cognito (~1h, mesmo trade-off
aceito na Decisão 4 do ADR). Adicionar ou remover um usuário do grupo só se reflete no próximo
refresh de token do usuário — não invalida tokens já emitidos. Para revogação urgente, é
necessário revogar o refresh token (`admin-user-global-sign-out`) além de remover do grupo.

## IAM policy mínima para quem executa os comandos

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateGroup",
        "cognito-idp:GetGroup",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminListGroupsForUser"
      ],
      "Resource": "arn:aws:cognito-idp:<REGION>:<ACCOUNT_ID>:userpool/<USER_POOL_ID>"
    }
  ]
}
```

## Validação

```bash
# grupo existe
aws cognito-idp get-group --user-pool-id <USER_POOL_ID> --group-name comprador-responsavel
aws cognito-idp get-group --user-pool-id <USER_POOL_ID> --group-name compliance-admin

# usuário está no grupo esperado
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <USER_POOL_ID> \
  --username <USERNAME_OU_SUB>
```

`admin-list-groups-for-user` deve listar o(s) grupo(s) atribuído(s). Ausência do grupo na lista é
o mesmo efeito observável de o usuário nunca ter sido atribuído — 403 no primeiro request após o
próximo refresh de token.

## Armadilha operacional desta decisão

Se `comprador-responsavel` ou `compliance-admin` não existir no User Pool de um ambiente (ex.:
Passo 1 nunca executado em staging), o `role-guard` do ADR-010 nunca encontra o papel esperado em
`cognito:groups` para **nenhum** usuário desse ambiente — inclusive os que deveriam ter acesso.
Efeito: 403 `sem-permissao` universal nas duas rotas gated
(`workflow/decisao-humana`, `faixas-preco-categoria`), indistinguível de um bug de autorização até
alguém checar se o grupo existe no pool. Rodar o Passo 0/1 deste runbook é pré-requisito de deploy
das tasks T4/T5 do ADR-010 em cada ambiente, na mesma lógica de `custom:tenant_id` ser
pré-requisito de T005 em spec 007.

## Execução por ambiente (fora de escopo desta task)

Executar este runbook contra os User Pools reais de dev/staging/prod é responsabilidade
operacional separada, sem acesso AWS disponível para o agente que redigiu este documento — mesmo
padrão de rastreamento usado para `custom:tenant_id` (issue #469). Abrir issue operacional
equivalente antes do deploy de T4/T5 do ADR-010 referenciando este arquivo.

## Recomendação para o arquiteto-back (fora de escopo de implementação aqui)

Diferente do User Pool em si (gerenciado fora do monorepo), a existência dos grupos
`comprador-responsavel`/`compliance-admin` é um invariante conhecido e fixo do código (os nomes
são hardcoded no `role-guard` e em `docs/openapi.yaml`) — não varia por tenant nem por decisão de
negócio em runtime. Isso o torna candidato razoável a provisionamento declarativo (CDK/Terraform,
`aws_cognito_user_group` ou custom resource) no dia em que o User Pool passar a ser gerenciado por
IaC neste repositório, eliminando o risco de "grupo nunca criado em um ambiente" descrito acima.
Não implementado aqui por estar fora do escopo desta issue (#691) e por o User Pool atual não ser
gerenciado por IaC — decisão de infraestrutura registrada como recomendação, não como mudança.
