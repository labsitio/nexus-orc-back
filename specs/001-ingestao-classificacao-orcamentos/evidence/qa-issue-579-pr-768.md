# QA — issue #579 (T064, IAM `events:PutEvents` restrito) — PR #768

SPEC_ID: 001-ingestao-classificacao-orcamentos (BC `ingestao-identificacao`)
PR: labsitio/nexus-orc-back#768
Branch: feat/579-t064-iam-confirmar-revisao-humana-put-events
Commit testado: 27ceff55fd7b039b34da65771596f427c7797927
Tipo: primeira validação (sem BUG-XXX anterior)
CI (GitHub Actions, workflow `ci`, run 32485481824): SUCCESS (1m40s) — 222 arquivos / 1421 testes, 0 falha

## Escopo

- `infra/lib/confirmar-revisao-humana-lambda-role-stack.ts` — nova prop `dominioBus:
  events.IEventBus`; `addToPolicy` de `events:PutEvents` restrito ao ARN do bus +
  `Condition StringEquals` dupla (`events:source` = `nexo.ingestao-identificacao`,
  `events:detail-type` = `OrcamentoReclassificadoPorRevisaoHumana`); doc-comment da
  classe reescrito (a frase antiga de que a ausência de qualquer permissão além de
  logs era "a garantia de least privilege" ficaria falsa após a mudança — reescrita
  para afirmar que `events:PutEvents` restrito é a única permissão adicional, ainda
  assim least privilege).
- `infra/bin/app.ts` — wiring de `dominioBus: dominioEventBusStack.dominioBus` na
  instanciação de `ConfirmarRevisaoHumanaLambdaRoleStack` (diff real, confirmado
  contra `main` atualizado: 2 adições / 1 remoção — o diff `main...HEAD` local trazia
  ruído de commits já mergeados em `main` desde o corte do branch).
- `specs/001-ingestao-classificacao-orcamentos/tasks.md` — T064 marcada `[x]`.
- Teste novo (do próprio PR, não é produção):
  `infra/lib/confirmar-revisao-humana-lambda-role-stack.test.ts` (2 casos, síntese CDK).

## Comandos executados

```
git fetch origin pull/768/head:pr-768
git checkout pr-768
npx vitest run --reporter=default infra/lib/confirmar-revisao-humana-lambda-role-stack.test.ts
npx cdk synth --app "npx tsx infra/bin/app.ts"
pnpm typecheck:infra
npx eslint infra/lib/confirmar-revisao-humana-lambda-role-stack.ts \
  infra/lib/confirmar-revisao-humana-lambda-role-stack.test.ts infra/bin/app.ts
gh run view 32485481824 --repo labsitio/nexus-orc-back --log   # evidência do CI (sem credencial AWS local)
```

## Resultados

| Comando | Resultado |
|---|---|
| Teste novo isolado (2 casos) | 2/2 passou, ~9s (`RUN v4.1.10`, `Duration 9.16s`) |
| `npx cdk synth` (todas as 30 stacks do `app.ts`) | Sucesso, sem erro. Único warning é pré-existente (`crossStackReferencesDefaultStrong`), não relacionado a este PR |
| `pnpm typecheck:infra` (`tsc --noEmit -p infra/tsconfig.json`) | OK, limpo |
| `npx eslint` nos 3 arquivos alterados | OK, sem output (exit 0) |
| CI do PR #768 (Linux, GitHub Actions) | `Typecheck (tsc --strict)` OK, `Typecheck infra (CDK)` OK, `Test`: 222 arquivos / 1421 testes, 0 falha |

### Limitação de ambiente confirmada (sem impacto no gate)

Sem credencial AWS local — não é possível provar a permissão em runtime real
(`AccessDeniedException` evitado de fato). A prova disponível e suficiente para o
critério de aceite da issue é estrutural: síntese CDK + inspeção do template gerado
(abaixo). LocalStack não aplica IAM, então rodar local não prova nada sobre a
permissão — não tentei.

Rodar a suíte completa de `infra/lib` nesta máquina Windows (path com espaço) faz os
mesmos 4 arquivos de síntese CDK (incluindo 3 que este PR não toca:
`http-api-stack.test.ts`, `receber-orcamento-lambda-role-stack.test.ts`,
`validar-orcamento-lambda-role-stack.test.ts`) darem timeout de hook (30s) — não
tentei reproduzir aqui porque já é fato pré-existente conhecido e o CI Linux prova
a suíte completa sem esse problema (job `ci` do PR, verde, 1m40s).

## Verificação estrutural da policy (template CDK sintetizado)

Statement extraída de `cdk.out/ConfirmarRevisaoHumanaLambdaRoleStack.template.json`
após `cdk synth`:

```json
{
  "Action": "events:PutEvents",
  "Condition": {
    "StringEquals": {
      "events:source": "nexo.ingestao-identificacao",
      "events:detail-type": "OrcamentoReclassificadoPorRevisaoHumana"
    }
  },
  "Effect": "Allow",
  "Resource": { "Fn::ImportValue": "DominioEventBusStack:ExportsOutputFnGetAttDominioBusC43F3666ArnC1FEC1DA" },
  "Sid": "PublicarOrcamentoReclassificadoPorRevisaoHumanaNoBusDeDominio"
}
```

Confere ponto a ponto com o exigido pela issue #579/T064:

1. `Resource` é o ARN importado do `DominioEventBusStack` (nunca wildcard `"*"`).
2. `Condition StringEquals` dupla presente: `events:source` **e** `events:detail-type`.
3. `Action` restrita a `events:PutEvents` (não `events:*`).
4. Doc-comment da classe reescrito conforme exigido pela task (verificado por leitura
   do diff: a frase "a ausência dessas permissões É a garantia de least privilege"
   ficou restrita a `bedrock:InvokeModel`/`s3:*`; novo parágrafo explica que
   `events:PutEvents` restrito é a única permissão adicional, ainda assim least
   privilege).

O segundo caso do teste novo (`nunca expõe wildcard "*" como Resource em nenhuma
statement da role`) foi conferido por leitura do template completo: a única outra
policy da stack é a `AWSLambdaBasicExecutionRole` (managed policy AWS, fora do
escopo do teste) — nenhuma statement autoral desta stack usa `Resource: "*"`.

## Cobertura

Não gerada cobertura isolada por linha para este arquivo: o objeto testado é
configuração declarativa de infraestrutura (CDK), não lógica de domínio — os 2 casos
do teste novo já exercitam as duas branches relevantes da mudança (Condition dupla
presente; nenhum Resource wildcard). Sem lacuna de risco identificada.

## Bugs encontrados

Nenhum.

## Segredos

Nenhuma credencial, token ou dado pessoal em teste, fixture, template CDK sintetizado
ou log de CI consultado durante a validação.

## Parecer

APROVADO PELO QA.
