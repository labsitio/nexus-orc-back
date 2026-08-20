# QA — issue #616 / PR #762

## SPEC_ID e versão testada
003-validacao-consistencia-orcamentos. Branch `feat/616-iam-putevents-validar-orcamento`,
commit `c58bac4` (`fix(infra): events:PutEvents para ValidarOrcamentoLambdaRole (ADR-004)`),
base `origin/main` = `331ace5`.

## Resumo executivo
Primeira validação. `ValidarOrcamentoLambdaRoleStack` ganha prop `dominioBus` e
`PolicyStatement` `events:PutEvents` restrito ao ARN de `nexo-dominio-bus` +
`Condition StringEquals events:source = nexo.validacao`. Mesmo padrão exato do
precedente #748 (issue #613, `ClassificadorLambdaRoleStack`), já validado pelo QA.
`backend-reviewer` aprovou sem achados.

## Requisitos cobertos
- Least privilege: `Action` fixo em `events:PutEvents` (sem wildcard) — coberto.
- `Resource` restrito ao ARN do bus `nexo-dominio-bus` (não `"*"`) — coberto por
  teste de síntese e confirmado no CFN gerado (`Fn::ImportValue:
  DominioEventBusStack:ExportsOutputFnGetAttDominioBusC43F3666ArnC1FEC1DA`).
- `Condition events:source = nexo.validacao` presente na policy — coberto.
- Nenhuma outra statement da role expõe `Resource: "*"` — coberto (teste
  genérico que varre todas as policies da stack).
- Wiring `infra/bin/app.ts` passa `dominioEventBusStack.dominioBus` na
  instanciação — coberto (grep no diff + `cdk synth` sem erro).

## Lacuna conhecida (não bloqueante)
O teste `restringe events:PutEvents ao ARN do bus + Condition events:source`
não faz asserção direta de `Resource` (só `Sid`/`Action`/`Condition`); quem
garante ausência de wildcard é o teste genérico separado. Mesma lacuna existe
no precedente `classificador-lambda-role-stack.test.ts` (#748), já aceito pelo
QA anteriormente — convenção do repo, não regressão desta PR. Confirmei o
`Resource` correto manualmente via `cdk synth` (ver seção Evidências).

## Suítes executadas e comandos
```
npx vitest run --reporter=default --pool=forks --maxWorkers=2 infra/lib/validar-orcamento-lambda-role-stack.test.ts
npx vitest run --reporter=default --pool=forks --maxWorkers=2 infra/
npx tsc --noEmit -p infra/tsconfig.json
npx cdk synth ValidarOrcamentoLambdaRoleStack
npx eslint infra/lib/validar-orcamento-lambda-role-stack.ts infra/lib/validar-orcamento-lambda-role-stack.test.ts infra/bin/app.ts
```

## Resultados
- `infra/lib/validar-orcamento-lambda-role-stack.test.ts`: 4/4 passando.
- `infra/` completo (workaround `--pool=forks --maxWorkers=2`, timeout de hook
  pré-existente documentado no CLAUDE.md): 6 arquivos, 15/15 testes passando.
- `typecheck:infra`: limpo.
- `cdk synth ValidarOrcamentoLambdaRoleStack`: sintetiza sem erro.
- `eslint`: sem achados nos 3 arquivos tocados.

## Evidências
CFN gerado (`cdk synth`), trecho do `PolicyDocument`:
```yaml
- Action: events:PutEvents
  Condition:
    StringEquals:
      events:source: nexo.validacao
  Effect: Allow
  Resource:
    Fn::ImportValue: DominioEventBusStack:ExportsOutputFnGetAttDominioBusC43F3666ArnC1FEC1DA
  Sid: PublicarEventosDeValidacaoNoBusDeDominio
```

## Cobertura
Não medida via istanbul/c8 — stack de infra é validada por síntese CDK
(`Template.fromStack`), convenção já estabelecida para todo `infra/lib/*-role-stack.ts`
neste repositório. Sem indicador de statements/branches aplicável a este tipo
de arquivo.

## Bugs encontrados
Nenhum.

## Riscos residuais
- LocalStack não aplica IAM: nenhum teste local ou de CI prova que a policy é
  respeitada em runtime real por AWS de fato — limitação de ambiente conhecida
  e documentada, não específica desta PR (mesma de #576-#580, #748).
- 5 arquivos de teste `infra/lib/*-lambda-role-stack.test.ts` (e afins) dão
  timeout de hook em paralelo nesta máquina Windows — contornado com
  `--pool=forks --maxWorkers=2`. CI Linux não é afetado (ver `statusCheckRollup`
  do PR: `ci` = SUCCESS).

## Limitações do ambiente
Path com espaço (`C:\Users\Allan Brito\...`) quebra `pnpm test` (reporter
allure-vitest) — contornado com `npx vitest run --reporter=default`, conforme
CLAUDE.md.

## Parecer final
APROVADO PELO QA
