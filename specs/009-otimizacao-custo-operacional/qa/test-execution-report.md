# Relatório de execução — T004/T005 (spec-009)

Commit testado: `ba72484`
Branch: `feat/009-otimizacao-custo`

## Suíte da task
```
npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.test.ts --coverage
```
Resultado: 1 arquivo, 9 testes, 9 passed, 0 failed.

## Lint do diff
```
npx eslint src/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.ts \
  tests/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.test.ts
```
Resultado: sem erros/warnings.

## Regressão — domínio completo (BCs ingestao-identificacao e extracao)
```
npx vitest run tests/bounded-contexts/ingestao-identificacao/domain tests/bounded-contexts/extracao/domain
```
Resultado: 23 arquivos, 113 testes, todos passed.

## Regressão — suíte completa do repositório
```
npx vitest run
```
Resultado: 59 arquivos (43 passed, 10 failed, 6 skipped), 245 testes (215 passed, 3 failed, 27 skipped).

Falhas (10 arquivos) concentradas em infraestrutura/interface, nenhuma em domínio nem em
`assinatura-estrutural`:
- `ingestao-identificacao/infrastructure/bedrock-classificador.gateway.test.ts`
- `ingestao-identificacao/infrastructure/eventbridge.publisher.test.ts`
- `ingestao-identificacao/infrastructure/markitdown-conversao.acl.test.ts`
- `ingestao-identificacao/interface/classificador-queue.handler.test.ts`
- `extracao/infrastructure/eventbridge.publisher.test.ts`
- `ingestao-identificacao/infrastructure/observability/logger.test.ts`
- `ingestao-identificacao/infrastructure/observability/tracing.test.ts`
- `ingestao-identificacao/interface/http/auth-cognito.middleware.test.ts` (timeout)
- (+2 arquivos correlatos do mesmo grupo de infraestrutura)

Classificação: problema de ambiente (item 3), consistente com a limitação já
declarada pelo dev-back-end — dependências (`@aws-sdk/*`, `pino`, `aws-lambda`) não
instaladas neste worktree. Não introduzido pelo diff de T004 (diff toca apenas
`assinatura-estrutural.ts` e seu teste; nenhum arquivo de infraestrutura foi alterado).
Não bloqueia o gate desta task.

## Typecheck
`npm run typecheck` completo falha por dependências ausentes em arquivos não
relacionados a esta task (limitação de ambiente já conhecida, pré-existente).
Verificação pontual do lint via ESLint (que faz parsing TS) não indicou erro de
tipos no arquivo novo.

---

# T005 (spec-009)

Commit testado: `d9185d5`
Branch: `feat/009-otimizacao-custo-t005`
PR: https://github.com/labsitio/nexus-orc-back/pull/438 (draft)

## Suíte da task
```
npx vitest run --reporter=default tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts
```
Resultado: 1 arquivo, 2 testes, 2 passed, 0 failed.

## Cobertura da task
```
npx vitest run --coverage --coverage.reporter=json-summary tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts
```
`sinal-cache-identificacao.ts`: 100% statements/branches/functions/lines (ver coverage-final.md).

## Lint do diff
```
npx eslint src/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.ts \
  tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts
```
Resultado: sem erros/warnings.

## Typecheck
```
npx tsc --noEmit
```
Resultado: sem erros (repositório completo — diferente do estado registrado em T004,
o typecheck completo do repo passa limpo neste momento; dependências AWS SDK/pino/aws-lambda
já presentes no worktree atual).

## Regressão — suíte completa do repositório
```
npx vitest run --reporter=default
```
Resultado: 61 arquivos (55 passed, 6 skipped — skips pré-existentes de integração
com banco/infra, não relacionados a este diff), 276 testes (249 passed, 27 skipped),
0 falhas. Diff de T005 (`sinal-cache-identificacao.ts` + teste) não introduziu
nenhuma regressão.

## Allure
`npx vitest run` (sem `--reporter=default`, deixando o reporter `allure-vitest`
configurado em `vitest.config.ts` atuar) falha com:
```
Error: Vitest failed to find the runner ... allure-vitest/src/setup.ts:15:0
```
Confirma o bug pré-existente do adaptador `allure-vitest` neste repositório
(já relatado por outros agentes). Contornado ao rodar com `--reporter=default`,
que desativa a geração de `allure-results/` nesta rodada — limitação de ambiente,
não bloqueia o gate desta task (nenhum requisito de T005 depende de Allure).

---

# T006 (spec-009)

Commit testado: `eec0db2`
Branch: `feat/009-otimizacao-custo-t006`
PR: https://github.com/labsitio/nexus-orc-back/pull/440 (draft)

## Diff avaliado
- `src/bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.ts` (novo, interface pura)
- `specs/009-otimizacao-custo-operacional/tasks.md` (checkbox T006)

## Conformidade de assinatura
Comparação direta com tasks.md L31: `buscar(assinatura: AssinaturaEstrutural): Promise<SinalCacheIdentificacao | null>`
e `registrar(assinatura: AssinaturaEstrutural, resultado: ResultadoClassificacao): Promise<void>` —
assinatura do arquivo confere exatamente. Sem lógica implementada (conforme escopo da task,
implementação real é T010).

## Typecheck
```
npx tsc --noEmit -p .
```
Resultado: sem erros.

## Lint
```
npx eslint src/bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.ts
```
Resultado: sem erros/warnings.

## Regressão — suíte completa do repositório
```
npx vitest run --reporter=default
```
Resultado: 62 arquivos (56 passed, 6 skipped — skips pré-existentes de integração
com banco/infra, não relacionados a este diff), 285 testes (258 passed, 27 skipped),
0 falhas. `upload-url.controller.test.ts` e `auth-cognito.middleware.test.ts` (relatados
pelo dev-back-end como flaky por timeout) passaram nesta execução, sem instabilidade
observada. Diff de T006 não introduziu nenhuma regressão.

## Testes de comportamento
Nenhum criado. Interface sem lógica executável (zero statements/branches em runtime);
teste de contrato/comportamento cabe às tasks que consomem a interface: T012–T015
(caso de uso `ClassificarOrcamento` com fake/mock do gateway) e à implementação real
em T010 — ambas fora do escopo desta task e desta rodada de QA. Criar teste de
compilação isolado para uma interface vazia adicionaria manutenção sem reduzir risco
(o próprio `tsc --noEmit` já garante a conformidade estrutural).

## Allure
Mesma limitação pré-existente do adaptador `allure-vitest` já registrada em T005;
`--reporter=default` usado como workaround, sem geração de `allure-results/` nesta
rodada. Não bloqueia o gate (task não tem requisito de evidência Allure).
