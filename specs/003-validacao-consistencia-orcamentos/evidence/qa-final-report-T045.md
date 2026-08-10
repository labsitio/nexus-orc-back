# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T045

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #711 (labsitio/nexus-orc-back)
- Branch: `feat/003-155-iam-bedrock-categorizacao`
- Commit testado: `a67fd62` (HEAD da branch no momento desta validação)
- Task: T045 [US3] IAM — role dedicada `ValidarOrcamentoLambdaRole` (T028, já
  existia) estendida com `bedrock:InvokeModel` restrito ao ARN do modelo de
  categorização aprovado — least privilege, nunca wildcard em `Resource`.
- Issue: #155
- Primeira validação (sem BUG-XXX prévio, sem reteste)
- Backend-reviewer: já aprovado (APPROVE WITH NITS, sem BLOCKER/MAJOR)

## 2. Resumo executivo
Diff de produção é mínimo e segue exatamente o padrão já estabelecido por
`IndexadorLambdaRoleStack` (mesmo BC de infra, mesma forma): um novo
`CfnParameter` `ModeloCategorizacaoAprovadoArn` (tipo `String`) injetado no
deploy, e um `PolicyStatement` novo (`sid:
InvocarModeloCategorizacaoAprovado`, `actions: ['bedrock:InvokeModel']`) cujo
único `Resource` é `modeloCategorizacaoAprovadoArn.valueAsString` — nunca
`'*'`. `infra/bin/app.ts` só atualiza a `description` da stack (texto,
nenhuma mudança funcional). Nenhuma outra permissão foi tocada (S3 raw
continua ausente, conforme já documentado nos comentários da stack; consumo
da própria fila `validador-queue` inalterado).

**Esta validação é inteiramente síntese CDK (`Template.fromStack`), não
prova de comportamento real em produção/AWS.** LocalStack não aplica IAM —
nenhum ambiente disponível a este QA (local ou CI atual) executa uma chamada
real a `bedrock:InvokeModel` sob esta policy para confirmar que a AWS de
fato nega o acesso fora do ARN configurado. O que foi verificado é
exclusivamente a *configuração declarada* na CloudFormation sintetizada:
o `Resource` do statement é o `Ref` do parâmetro, nunca wildcard.

Nenhum defeito de produção encontrado. Nenhuma alteração em código de
produção realizada por este QA.

## 3. Requisitos cobertos e não cobertos
Cobertos (síntese CDK):
- `ModeloCategorizacaoAprovadoArn` existe como `CfnParameter` do tipo
  `String` na stack sintetizada.
- O `PolicyStatement` `InvocarModeloCategorizacaoAprovado` tem
  `Effect: Allow`, `Action: bedrock:InvokeModel`, e `Resource` igual a
  `{ Ref: 'ModeloCategorizacaoAprovadoArn' }` — nunca uma string literal de
  ARN nem `'*'`.
- Nenhuma statement IAM de nenhuma `AWS::IAM::Policy` desta stack (incluindo
  a policy inline gerada por `grantConsumeMessages`) tem `Resource: '*'`.
- Prova negativa manual (não commitada): revertido temporariamente
  `resources: [modeloCategorizacaoAprovadoArn.valueAsString]` para
  `resources: ['*']` no código de produção só para observar a falha —
  os 2 testes de policy falharam pelo motivo exato esperado (wildcard
  detectado), confirmando que os testes de fato exercitam a regra e não
  passam por acidente. Revertido imediatamente após a observação
  (`git checkout -- infra/lib/validar-orcamento-lambda-role-stack.ts`,
  confirmado sem diff residual).

Não coberto / fora do alcance possível deste QA, não é lacuna do dev-back-end:
- Comportamento real do Bedrock recusando `InvokeModel` para um ARN de
  modelo diferente do parametrizado — exigiria ambiente AWS real com IAM
  ativo; LocalStack não aplica IAM (limitação de ambiente conhecida,
  também documentada no comentário de `src/dev/local.ts` no `CLAUDE.md` do
  repo).
- Valor real que será passado para `ModeloCategorizacaoAprovadoArn` no
  deploy (é um parâmetro de runtime, decidido no momento do `cdk deploy`,
  não no código) — fora do escopo de um teste de síntese.
- `BedrockCategorizadorItemGateway` (T041) em si — código de aplicação/
  gateway, não desta task (IAM), não parte do diff desta PR.

## 4. Suítes executadas e comandos
Ambiente: Windows, path com espaço (`C:\Users\Allan Brito\...`) — `pnpm test`
(reporter Allure) quebra por incompatibilidade `allure-vitest`/`vitest`,
condição ambiental conhecida e já documentada no `CLAUDE.md` do repo e em
relatórios anteriores desta spec (ex.: `qa-final-report-T043.md` seção 8).
Contornado com `node node_modules/vitest/vitest.mjs run --reporter=default`.

Comandos executados:
- `corepack pnpm typecheck:infra` (`tsc --noEmit -p infra/tsconfig.json`) →
  sem erro.
- `corepack pnpm lint` (`eslint .`) → sem achados, inclusive no arquivo de
  teste novo.
- `node node_modules/vitest/vitest.mjs run infra/lib/validar-orcamento-lambda-role-stack.test.ts --reporter=default`
  → 3/3 passou.
- `node node_modules/vitest/vitest.mjs run --reporter=default` (suíte
  completa do repositório, incluindo o arquivo novo de infra) →
  `Test Files 190 passed | 19 skipped (209)` / `Tests 1213 passed | 109
  skipped (1322)`. Zero falha, zero teste instável. Os 19 arquivos/109
  testes skip são os já conhecidos `skipIf(!DATABASE_URL)` sem Postgres
  local — não relacionados a esta task (task é IAM/CDK puro, sem
  dependência de banco).

Sem Postgres/Docker envolvido nesta validação — task é 100% infraestrutura
declarativa (CDK), não toca banco, filas de runtime nem gateways de
aplicação.

## 5. Quantidade de testes por tipo
- Síntese CDK (novo, criado por este QA):
  `infra/lib/validar-orcamento-lambda-role-stack.test.ts`, 3 testes:
  1. `CfnParameter ModeloCategorizacaoAprovadoArn` existe, tipo `String`.
  2. `bedrock:InvokeModel` restrito ao `Ref` do parâmetro (statement
     completa: `Sid`, `Effect`, `Action`, `Resource`).
  3. Nenhuma statement IAM da stack expõe `Resource: '*'` (varredura de
     todas as `AWS::IAM::Policy` sintetizadas, não só a nova).
- Nenhum teste unitário/integração de aplicação criado — task é
  exclusivamente infraestrutura, sem lógica de domínio/aplicação nova.
- Nenhum teste pré-existente de infra havia (`infra/` não tinha nenhum
  arquivo `*.test.ts` até esta validação — confirmado por busca no
  repositório antes de escrever o teste).

## 6. Resultado
- Aprovados (escopo T045): 3/3 (síntese CDK, arquivo novo).
- Falhos: 0.
- Ignorados: 0 (task não depende de Postgres).
- Instáveis: 0.
- Regressão da suíte completa: 190 arquivos passed | 19 skipped (209
  arquivos totais) / 1213 testes passed | 109 skipped (1322 totais). Zero
  falha, zero regressão.

## 7. Cobertura inicial e final
Cobertura de código de aplicação (`src/**`, `vitest.config.ts` só inclui
`src/**`) não se aplica a esta task: `infra/` fica fora do escopo de
cobertura configurado no projeto e o diff desta PR não toca `src/`. Não há
baseline nem final de cobertura statements/branches/functions/lines a
reportar para T045 — nenhum arquivo de produção sob medição de cobertura foi
alterado.

Cobertura funcional do próprio `PolicyStatement` novo (o único artefato
desta task): 100% dos campos observáveis do statement (`sid`, `actions`,
`resources`) são exercitados por asserção direta no teste 2; o teste 3
garante ausência de regressão de wildcard em qualquer statement IAM
presente/futura da stack, não apenas a desta task.

Threshold de cobertura do projeto não foi alterado; nenhum arquivo excluído
da medição para inflar percentual.

## 8. Allure
Não gerado nesta execução: `pnpm test` (reporter Allure) está
ambientalmente quebrado nesta worktree pelo mesmo motivo já registrado em
relatórios anteriores desta spec (path com espaço,
`Error: Vitest failed to find the runner`) — condição pré-existente, não
introduzida por esta task. Execução e evidência usam
`vitest run --reporter=default`. Nenhum dado sensível: o teste usa apenas
ARN/`Resource` sintéticos gerados pelo próprio CDK (IDs lógicos como
`ValidarOrcamentoLambdaRole6816F141`), nenhuma credencial, nenhum dado de
tenant ou pessoal.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- **Nenhuma prova de comportamento real de IAM/Bedrock existe neste
  repositório** — nem local (LocalStack não aplica IAM), nem no CI atual
  (que roda `cdk synth`, não `cdk deploy` contra uma conta AWS real). O
  risco de a policy sintetizada divergir do comportamento efetivo do
  serviço Bedrock em produção (ex.: formato de ARN de modelo incompatível
  com o exigido pela API, região divergente, etc.) só pode ser mitigado por
  um deploy real em ambiente controlado antes de produção — decisão e
  execução de DevOps, fora do alcance deste QA.
- Valor do parâmetro `ModeloCategorizacaoAprovadoArn` no deploy real não é
  validado por este teste (é responsabilidade do processo de deploy/
  DevOps, não do código) — um valor incorreto no `cdk deploy` (ex.: ARN de
  outro modelo, ou ARN mal formado) não seria capturado por síntese, só
  por uma chamada real ao Bedrock.

## 11. Limitações do ambiente
- LocalStack não aplica IAM (confirmado pelo próprio `CLAUDE.md` do
  repositório) — toda validação desta issue é necessariamente síntese/
  configuração CDK, nunca execução real. Registrado explicitamente aqui e
  no cabeçalho do arquivo de teste novo.
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest
  em path com espaço — ambiental, conhecida desde T023/T043, contornada com
  `node node_modules/vitest/vitest.mjs run --reporter=default`.
- Docker/Postgres não foram necessários nesta validação (task não toca
  banco).

## 12. Parecer final
APROVADO PELO QA
