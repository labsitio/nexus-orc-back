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
