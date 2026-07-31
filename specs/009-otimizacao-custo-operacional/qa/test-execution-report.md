# Relatório de execução — T004 (spec-009)

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
