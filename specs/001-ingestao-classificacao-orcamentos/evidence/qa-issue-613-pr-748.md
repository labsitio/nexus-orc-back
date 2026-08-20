# QA — issue #613 (Lambdas de produção classificador-queue/sftp-upload) — PR #748

SPEC_ID: 001-ingestao-classificacao-orcamentos (BC `ingestao-identificacao`)
PR: labsitio/nexus-orc-back#748
Branch: feat/613-handlers-lambda-producao-ingestao-identificacao
Commit testado: 28ac240
Tipo: primeira validação (sem BUG anterior)
Backend-reviewer: APPROVE WITH NITS (sem BLOCKER/MAJOR)

## Escopo

- T068: `classificador-queue.production.ts`/`sftp-upload.production.ts` (composição de
  produção fina, ADR-009 Decisão 1) + `ClassificadorFunctionStack`/`SftpUploadFunctionStack`
  (CDK, `NodejsFunction` + `SqsEventSource`/notificação S3), ligadas às roles já existentes
  (T035/T026).
- T061/T062: `events:PutEvents` restrito ao ARN do bus + `Condition events:source` em
  `ReceberOrcamentoLambdaRole` e `ClassificadorLambdaRole`.
- `aws-clients.production.ts`: adiciona `LambdaClient` (invocação do MarkItDown ACL).
- `ingestao-identificacao.ts`: extrai `criarRepositorioOrcamentoFactory` (reuso), adiciona
  `criarReceberOrcamento` (factory enxuta — só `ReceberOrcamento`, sem `classificador`/
  `conversor` que o handler SFTP nunca usa).
- `receber-orcamento-lambda-role-stack.ts`: troca referência ao `Bucket` construct por ARN
  literal (`nexo-orcamentos-raw`) — evita `DependencyCycle` de 3 pontas no `cdk synth`
  (`ReceberOrcamentoLambdaRoleStack -> Storage -> SftpUploadFunctionStack -> Role`).
- **Fora de escopo, documentado em `tasks.md` (bloco T068)**: os 3 casos de uso HTTP do
  mesmo BC (`confirmar-upload`, `confirmar-revisão`, `consultar-status`) — sem API Gateway
  em nenhuma stack aprovada; decisão de arquitetura, não de dev.

## Comandos executados

```
pnpm typecheck
pnpm typecheck:infra
pnpm lint
npx cdk synth --app "npx tsx infra/bin/app.ts" <todas as 27 stacks>
npx vitest run --reporter=default infra/lib
npx vitest run --reporter=default tests/bounded-contexts/ingestao-identificacao tests/composition
npx vitest run --reporter=default --pool=forks --maxWorkers=2   # suíte completa
```

`pnpm test` não foi usado (path com espaço — `allure-vitest` falha, comportamento conhecido
e documentado em CLAUDE.md; contornado com `npx vitest run --reporter=default`).

## Resultados

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK, limpo |
| `pnpm typecheck:infra` | OK, limpo |
| `pnpm lint` | OK, limpo (inclui regra de fronteira de BC) |
| `cdk synth` (27 stacks) | sintetiza sem erro — confirma que o `DependencyCycle` relatado no comentário de `receber-orcamento-lambda-role-stack.ts` de fato não ocorre com o ARN literal |
| `vitest infra/lib` (isolado) | 3 arquivos / 5 testes, 0 falha |
| `vitest` BC ingestao-identificacao + composition | 44 arquivos / 242 testes passando, 20 skip esperado (sem `DATABASE_URL` local) |
| `vitest` suíte completa (`--pool=forks --maxWorkers=2`) | 198 arquivos passando / 1282 testes, 19 arquivos skip esperado. 1 falha isolada — ver "Falha de ambiente" abaixo |

### Falha de ambiente (não é defeito de produção)

`tests/composition/aws-clients.production.test.ts` deu "Hook timed out in 10000ms" na
primeira execução da suíte completa, com o padrão default de workers (contenção de CPU —
5 testes de síntese CDK do repo, incluindo os 2 novos deste PR, rodando em paralelo no
`beforeAll`, cada um caro/segundos). Reexecutado isolado: passa em 1.47s, sem timeout.
Não é regressão desta PR — `aws-clients.production.ts` já existia antes desta issue e o
teste não toca nenhum arquivo alterado por ela além de reimportar o módulo com
`LambdaClient` adicionado (confirmado sem erro na execução isolada).

## Critérios de aceite

1. **T068 — handlers de produção existem e usam o formato `*.production.ts` fino
   (ADR-009 Decisão 1)** — confirmado. `classificador-queue.production.ts` e
   `sftp-upload.production.ts` só compõem (nenhuma regra de negócio), `export const handler`
   é a assinatura Lambda direta, mesmo padrão de `indexador-queue.production.ts` (#623).
2. **`ClassificadorFunctionStack`/`SftpUploadFunctionStack` ligadas às roles corretas** —
   confirmado via `infra/bin/app.ts`: `classificadorLambdaRoleStack.classificadorLambdaRole` e
   `receberOrcamentoLambdaRoleStack.role` passados como `role:` de cada `NodejsFunction`.
   `cdk synth` sintetiza as 27 stacks sem erro, prova de wiring válido.
3. **`criarReceberOrcamento` não exige `classificador`/`conversor`** — confirmado por leitura:
   `CriarReceberOrcamentoDeps` só tem `db`/`eventBridge`/`eventBusName`; `ReceberOrcamento`
   nunca invoca Bedrock/MarkItDown (mesma decisão espelhada na ausência de
   `bedrock:InvokeModel` na policy de `ReceberOrcamentoLambdaRole`).
4. **T061 — `events:PutEvents` em `ReceberOrcamentoLambdaRole`** — confirmado por síntese CDK
   (teste novo, ver abaixo): `Resource` = ARN do bus, `Condition StringEquals
   events:source=nexo.ingestao-identificacao`, nunca `"*"`. Texto da task bate exatamente com
   a policy implementada.
5. **T062 — `events:PutEvents` em `ClassificadorLambdaRole`** — confirmado por síntese CDK
   (teste novo), mesmo padrão do item 4.
6. **`ReceberOrcamentoLambdaRoleStack` sem `DependencyCycle` (achado do backend-reviewer)** —
   confirmado: `cdk synth --app "npx tsx infra/bin/app.ts"` sintetiza as 27 stacks (incluindo
   `IngestaoIdentificacaoStorageStack`, `ReceberOrcamentoLambdaRoleStack`,
   `SftpUploadFunctionStack`) sem erro de ciclo.
7. **Fora de escopo (3 casos de uso HTTP) intocado** — confirmado por `git diff main...HEAD`
   restrito a: `aws-clients.production.ts`, `ingestao-identificacao.ts` (composition),
   os 2 `*.production.ts` novos, as 2 function-stacks novas, as 2 role-stacks (T061/T062),
   `app.ts` (wiring), `pnpm-workspace.yaml`/`pnpm-lock.yaml` (bump nanoid, não relacionado).
   Nenhum controller/schema HTTP alterado.

## Gap de cobertura encontrado e fechado nesta validação

`infra/lib` tinha só 3 arquivos de teste de síntese CDK (`validar-orcamento-lambda-role-
stack.test.ts`, `extrator-queue-stack.test.ts`, `contexto-classificacao-queue-stack.test.ts`)
antes desta issue — nenhum cobria as 2 role-stacks que ganharam `events:PutEvents` nesta
mesma issue (T061/T062), nem as 2 novas function-stacks (`classificador-function-stack.ts`,
`sftp-upload-function-stack.ts`).

Como QA, **não é atribuição minha corrigir código de produção**, mas o padrão de teste de
síntese CDK (`Template.fromStack` + `hasResourceProperties`) já existe no repo
(`validar-orcamento-lambda-role-stack.test.ts`) exatamente para provar policy IAM sem depender
de LocalStack (que não aplica IAM). Criei os 2 testes que faltavam para as role-stacks
tocadas por T061/T062, seguindo o mesmo padrão:

- `infra/lib/receber-orcamento-lambda-role-stack.test.ts` (2 testes): `events:PutEvents`
  restrito ao ARN do bus + `Condition events:source`; nenhum `Resource: "*"` em nenhuma
  statement da role.
- `infra/lib/classificador-lambda-role-stack.test.ts` (4 testes): os 2 `CfnParameter`
  (`ModeloBedrockAprovadoArn`/`MarkItDownLambdaArn`) declarados como `String`;
  `bedrock:InvokeModel` restrito ao `Ref` do parâmetro; `events:PutEvents` restrito ao ARN do
  bus + `Condition`; nenhum `Resource: "*"`.

Ambos passam (`npx vitest run --reporter=default infra/lib/receber-orcamento-lambda-role-
stack.test.ts infra/lib/classificador-lambda-role-stack.test.ts` → 2 arquivos / 6 testes).

**Lacuna residual, não bloqueante**: `classificador-function-stack.ts` e
`sftp-upload-function-stack.ts` (as 2 `NodejsFunction`s em si) continuam sem teste de
síntese dedicado — nenhuma outra `*-function-stack.ts` do repositório tem
(`indexador-function-stack.ts`, `decisao-workflow-function-stack.ts`,
`contexto-classificacao-function-stack.ts`, `contexto-extracao-function-stack.ts` também não
têm). Consistente com o padrão já estabelecido no repo antes desta PR — não é regressão
introduzida por ela, mas fica registrado como risco ainda não testado (síntese confirma que
não há erro de configuração, mas nenhum teste automatizado prova propriedades específicas da
função, como `entry`, `runtime`, `environment` fixo ou o `SqsEventSource`/notificação S3
corretos — hoje só a leitura manual do código prova isso).

## Bugs encontrados

Nenhum.

## Parecer

APROVADO PELO QA.
