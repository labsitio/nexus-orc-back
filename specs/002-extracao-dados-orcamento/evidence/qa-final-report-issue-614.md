# QA Final Report — Issue #614 (Infrastructure: handler Lambda de produção para `ExtrairDadosOrcamento`)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #614 — sem T-number em `tasks.md` (lacuna de infra registrada no corpo da issue)
- PR: #763, branch `feat/614-extrator-lambda-producao`
- Commit testado: `968ee0c`
- Primeira validação (não há BUG anterior para esta issue).

## Resumo executivo
PR fecha o `ExtratorFunctionStack` de produção para o consumidor de
`extrator-queue` (issue #614), mesmo formato do precedente
`ClassificadorFunctionStack` (#613, ADR-009): `entry` aponta para
`extrator-queue.production.ts` (composição fina, sem regra de negócio),
`OutputFormat.ESM`, `NEXO_AGENTE_IA=bedrock` fixo, `CfnParameter`s para
`DATABASE_URL`/model id/ARN do MarkItDown, `SqsEventSource` com
`reportBatchItemFailures`. Segundo commit corrige achado **BLOCKER** do
backend-reviewer: `ExtratorLambdaRoleStack` não tinha `events:PutEvents` —
sem essa permissão o primeiro invoke real em produção extrairia mas nunca
propagaria o resultado (`AccessDeniedException` silencioso no
`EventBridgePublisher`), mesmo defeito já corrigido em
`ClassificadorLambdaRoleStack` (#613). Verifiquei a correção: `SOURCE` do
`EventBridgePublisher` deste BC é `'nexo.extracao'`
(`src/bounded-contexts/extracao/infrastructure/eventbridge.publisher.ts:8`),
idêntico ao `events:source` da `Condition` da nova policy — permissão não é
mais restritiva nem mais ampla do que o publisher realmente usa.

Backend-reviewer aprovou com **APPROVE WITH NITS** (nit: faltava teste de
infra dedicado para a policy `events:PutEvents` de `ExtratorLambdaRoleStack`
— não bloqueava). Como QA, fechei esse nit criando
`infra/lib/extrator-lambda-role-stack.test.ts` (mesmo padrão de
`classificador-lambda-role-stack.test.ts`), infraestrutura de teste — não é
correção de produção.

## Diff revisado (produção, contra `origin/main` no momento da validação)
`git diff origin/main...HEAD --stat` (4 arquivos, 186 inserções, 1 deleção):
- `infra/bin/app.ts` (wiring: `ExtratorFunctionStack` + prop `dominioBus` em `ExtratorLambdaRoleStack`)
- `infra/lib/extrator-function-stack.ts` (novo)
- `infra/lib/extrator-lambda-role-stack.ts` (statement `events:PutEvents`)
- `src/bounded-contexts/extracao/interface/events/extrator-queue.production.ts` (novo)

Confirmado por leitura completa: paridade estrutural com
`classificador-function-stack.ts`/`classificador-lambda-role-stack.ts`
(#613) — mesma forma de `CfnParameter`, `bundling`, `environment`,
`SqsEventSource`. Nenhum arquivo fora do escopo declarado foi tocado.

## Suítes executadas e comandos
- `pnpm typecheck` → sem erros.
- `pnpm typecheck:infra` → sem erros.
- `rm -rf cdk.out && pnpm lint` → sem erros (cdk.out remanescente contamina o eslint com milhares de erros de arquivos bundled — removido antes de cada lint, mesma ressalva do CLAUDE.md).
- `npx cdk synth --all` (a partir da raiz do repo) → sintetizou as 29 stacks sem erro; `--all` é ignorado como opção desconhecida pela CLI instalada, mas o synth completo roda mesmo assim (confirmado pelos `.template.json` gerados para todas as stacks, incluindo `ExtratorFunctionStack`/`ExtratorLambdaRoleStack`).
  - Inspecionei os templates sintetizados via script Node (sem AWS real, LocalStack não aplica IAM):
    - `ExtratorLambdaRoleStack.template.json`: statement `PublicarEventosDeExtracaoNoBusDeDominio` com `Action: events:PutEvents`, `Resource` = `Fn::ImportValue` do ARN do `DominioBusStack`, `Condition.StringEquals['events:source'] = 'nexo.extracao'`.
    - `ExtratorFunctionStack.template.json`: `Function.Role` importa o ARN de `ExtratorLambdaRoleStack`; `Environment.Variables` com `NEXO_AGENTE_IA=bedrock` fixo e os demais via `Ref` de `CfnParameter`; `EventSourceMapping` aponta para o ARN de `ExtratorQueueStack` com `BatchSize: 10` e `FunctionResponseTypes: [ReportBatchItemFailures]`.
- `npx vitest run --reporter=default` (suíte completa, sem `DATABASE_URL` — 19 arquivos de integração skip, esperado neste ambiente local) → **193 arquivos passaram, 1281 testes passaram, 0 falha real, 130 skipped** (19 arquivos `skipIf(!DATABASE_URL)` + o restante do meu novo arquivo de teste quando pego pelo flake abaixo).
- `rm -rf cdk.out` ao final, para não deixar artefato de synth no working tree.

## Achado de ambiente (não bloqueante, não é regressão desta PR)
6 arquivos de teste de síntese CDK pré-existentes (`classificador-lambda-role-stack.test.ts`,
`contexto-classificacao-queue-stack.test.ts`, `extrator-queue-stack.test.ts`,
`http-api-stack.test.ts`, `receber-orcamento-lambda-role-stack.test.ts`,
`validar-orcamento-lambda-role-stack.test.ts`) — **nenhum tocado por esta PR**
— estouram `Hook timed out in 30000ms` no `beforeAll` quando rodam junto de
toda a suíte nesta máquina (Windows, contenção de CPU durante `synth` +
`bundling` esbuild concorrentes). Reproduzi cada um isoladamente
(`npx vitest run infra/lib/<arquivo>.test.ts`): **todos passam em <8s** sem
nenhuma alteração de código. Isso é artefato de máquina local, não defeito de
produção nem regressão desta PR — meu novo `extrator-lambda-role-stack.test.ts`
sofreu o mesmo flake quando rodado junto da suíte cheia (passa isolado, 5/5
em 7.8s) pelo mesmo motivo. CI roda em Linux e não reproduz isso
(mesma ressalva de `pnpm test`/path-com-espaço do CLAUDE.md, categoria
adjacente: máquina local, não CI).

## Cobertura
Sem cobertura de linha coletada nesta rodada (`vitest run` sem `--coverage`):
PR é infraestrutura CDK pura + composição fina (`*.production.ts`) — mesmo
padrão do repo, nenhum `.production.ts` existente (`classificador-queue.production.ts`,
`sftp-upload.production.ts`, etc.) tem teste unitário dedicado, porque não há
lógica além de wiring de composição já coberta pelos testes de
`composition/extracao.ts` e do handler `extrator-queue.handler.ts`
(pré-existentes, inalterados por esta PR). A lógica nova real (a
`PolicyStatement` de IAM) ganhou teste de síntese dedicado nesta validação.

## Requisitos cobertos
- Issue #614 (deploy real do handler `ExtrairDadosOrcamento`): coberto —
  `ExtratorFunctionStack` sintetiza, referencia a role/fila/bus corretos.
- Achado BLOCKER do backend-reviewer (`events:PutEvents` ausente): coberto —
  policy sintetiza com `Resource`/`Condition` corretos, e agora com teste
  automatizado de regressão (`extrator-lambda-role-stack.test.ts`).

## Lacunas conhecidas, não bloqueantes
- Nenhuma stack de rede (VPC/Aurora) provisiona `vpc`/`vpcSubnets`/`securityGroups`
  ainda neste repositório — mesmo ponto em aberto já registrado em
  `ClassificadorFunctionStack` (#613) e `IndexadorFunctionStack` (#662); a
  prop existe e é opcional, `NodejsFunction` trata `undefined` como "sem VPC"
  com segurança. Não é regressão desta PR, é dívida já conhecida do repo.
- Sem credencial AWS real neste ambiente — LocalStack não aplica IAM, então
  nenhuma execução local prova que a policy é de fato respeitada em runtime.
  A prova possível aqui é a síntese do template (`cdk synth` + inspeção),
  que fiz.

## Bugs encontrados
Nenhum. O único achado (BLOCKER do backend-reviewer) já estava corrigido no
commit testado.

## Parecer final
APROVADO PELO QA
