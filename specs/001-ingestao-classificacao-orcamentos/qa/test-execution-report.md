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
