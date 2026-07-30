# Relatório de execução — T001 (issue #6)

Commit testado: `11b1959` (PR #391, base `main`@`a8bb825`).
Ambiente: worktree isolado (`git worktree add`), Node 24.14.1 (nvm), pnpm
11.18.0 via corepack.

## Comandos e resultados

```
$ pnpm --version
11.18.0                              # == packageManager pinado no package.json

$ pnpm install
... Done in 685ms using pnpm v11.18.0
EXIT=0

$ pnpm exec tsc --noEmit            # baseline, src/index.ts real
EXIT=0

$ pnpm exec tsc --noEmit            # com src/smoke-invalid.ts injetado (temp)
src/smoke-invalid.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/smoke-invalid.ts(4,1): error TS2554: Expected 1 arguments, but got 0.
EXIT=2

$ pnpm exec tsc --noEmit            # com src/smoke-indexed.ts injetado (temp)
src/smoke-indexed.ts(2,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
EXIT=2
```

Arquivos temporários (`smoke-invalid.ts`, `smoke-indexed.ts`) removidos e
worktree destruído ao final; `git status` no repositório principal permanece
limpo — nenhum artefato de smoke check foi commitado.

## Conclusão
`strict`, `noUncheckedIndexedAccess` e o pin de `packageManager` funcionam
como esperado. Nenhum defeito de produção encontrado.

---

# Relatório de execução — T004/T006–T009 (issues #9, #11, #12, #13, #14)

Commit testado: `3b05061` (PR #394 draft, branch `feat/001-fundacao-domain`,
base `main`@`9466358`).
Ambiente: worktree do dev-back-end, Node 24.14.1 (via nvm local, sandbox de QA só
tinha Node 16 por padrão), pnpm 11.18.0 via `corepack prepare pnpm@11.18.0
--activate` (sandbox de QA não tinha corepack pnpm ativo por padrão).

## Comandos e resultados

```
$ pnpm install
✓ Lockfile passes supply-chain policies
+ vitest, @types/node, typescript resolvidos
pnpm-lock.yaml regenerado (+744 linhas — entradas de vitest ainda não
commitadas pelo dev-back-end, conforme sinalizado no handoff)
EXIT=0

$ pnpm exec tsc --noEmit
EXIT=0 (sem output — sem erro de tipo)

$ pnpm exec vitest run tests/bounded-contexts/ingestao-identificacao/domain
 Test Files  8 passed (8)
      Tests  40 passed (40)
EXIT=0

$ pnpm add -D @vitest/coverage-v8@4.1.10 allure-vitest@3.10.2   # infra de QA
EXIT=0

$ pnpm exec vitest run --coverage
 Test Files  8 passed (8)
      Tests  40 passed (40)
Statements 92.91% | Branches 100% (38/38) | Functions 84% | Lines 92.8%
EXIT=0
allure-results/ gerado com 40 arquivos *-result.json
```

## Conclusão
40/40 testes reais (vitest 4.1.10, não a 0.34 usada pelo dev-back-end) passando.
`tsc --noEmit` limpo. Branch coverage 100% nas invariantes de validação de
domínio. Nenhum defeito de produção encontrado. Ver `qa/coverage-final.md`
para análise das linhas de statement/function não cobertas (acessores
triviais, não invariantes).

---

# Relatório de execução — T016/T019 (issues #21, #24) — PR #402

Commit testado: `2fee2e2` (PR #402, branch `feat/001-c-us1`, base
`main`@`b1a2bf4`). Ambiente: worktree do dev-back-end (compartilhado com
agente paralelo na trilha 001-E), Node 24.18.1 (nvm), pnpm 11.18.0.

## Comandos e resultados

```
$ source ~/.nvm/nvm.sh && nvm use 24
Now using node v24.18.1

$ pnpm install --frozen-lockfile
Already up to date
EXIT=0

$ pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ pnpm run lint              # eslint .
EXIT=0 (sem output)

$ pnpm run test               # vitest run --passWithNoTests
Test Files  12 passed (12)
Tests       63 passed (63)
EXIT=0

$ pnpm exec vitest run --coverage
Test Files  12 passed (12)
Tests       63 passed (63)
Statements 92.52% | Branches 91.37% | Functions 90.32% | Lines 92.44%
EXIT=0
allure-results/ regenerado, 63 arquivos *-result.json, todos passed
```

## Conclusão
63/63 testes passando (11 no agregado `Orcamento.receber`/`Orcamento`, 4 no
`S3ArmazenamentoBrutoGateway`, 48 pré-existentes de outras trilhas — nenhuma
regressão). `tsc --noEmit` e `eslint .` limpos. `s3-armazenamento-bruto.gateway.ts`
com 100% de cobertura (statements/branches/functions). Nenhum defeito de
produção encontrado.

## Observação (não bloqueante)
O commit `24c6403` (T019) adicionou, além de `@aws-sdk/client-s3`
(dependência esperada desta task), `fastify` e `zod` a `package.json`/
`pnpm-lock.yaml` — dependências não usadas por nenhum arquivo do diff deste
PR (pertencem à trilha 001-E, em desenvolvimento paralelo no mesmo
worktree). Não quebra build/lint/teste; sinalizado ao dev-back-end como
possível arraste acidental de lockfile do worktree compartilhado, para
avaliar remoção em commit separado.
