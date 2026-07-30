# Test Execution Report — SPEC 002 (leva T001, T005-T011)

## Comando
`pnpm run test` (equivalente a `vitest run --passWithNoTests`), Node 24, mesmo
comando usado pelo workflow `.github/workflows/ci.yml`.

## Execução de referência (CI, mesmo commit)
- Repositório: labsitio/nexus-orc-back
- PR: #409, branch `feat/002-extracao`
- Run: https://github.com/labsitio/nexus-orc-back/actions/runs/30571782437
  (`ci`, conclusão `success`, 1m01s)
- Commit mesclado testado: `82bb32b152fc2bee2a3133414d4aa0ae0ec9c1db` (via merge
  commit `45a879d`)
- Resultado: **27 arquivos de teste, 130 testes, 100% aprovados, 0 falhas.**
- Dos 27 arquivos, 14 pertencem ao BC Extração (esta leva) somando **56
  testes**, todos aprovados:
  - `extracao-orcamento.aggregate.test.ts` — 9
  - `events/domain-events.test.ts` — 3
  - `value-objects/condicoes-comerciais.vo.test.ts` — 2
  - `value-objects/item-orcamento.vo.test.ts` — 2
  - `value-objects/campo-extraido.vo.test.ts` — 4
  - `value-objects/tentativa-extracao.vo.test.ts` — 3
  - `value-objects/referencia-classificacao.vo.test.ts` — 3
  - `value-objects/referencia-s3.vo.test.ts` — 4
  - `value-objects/orcamento-id.vo.test.ts` — 3
  - `value-objects/nivel-confianca.vo.test.ts` — 8
  - `value-objects/dinheiro.vo.test.ts` — 4
  - `value-objects/periodo-validade.vo.test.ts` — 2
  - `value-objects/descricao-produto.vo.test.ts` — 2
  - `value-objects/quantidade.vo.test.ts` — 7
- Os 13 arquivos restantes (BC Ingestão & Identificação, spec 001) também
  passaram integralmente — sem regressão introduzida por esta PR.

## Execução local (este worktree)
`pnpm run test` (e variações com `--pool=forks`, cache limpo) falhou de forma
ambiental antes de rodar qualquer teste, com erro do reporter `allure-vitest`
("Vitest failed to find the runner"), afetando igualmente as 14 suítes de
Extração e as 13 de Ingestão — não isolado ao código desta PR. Não reproduzido
no CI (mesmo commit, mesma versão de Node). Classificado como **problema de
ambiente local**, não como defeito de produção nem de teste.

## Typecheck e lint (executado localmente com sucesso)
- `pnpm run typecheck` (`tsc --noEmit`) — sem erros.
- `pnpm exec eslint src/bounded-contexts/extracao tests/bounded-contexts/extracao` — sem erros.

## Falhas classificadas
Nenhuma falha de teste. 1 achado de code review (não é falha de teste) —
ver `bugs/BUG-001.md` (getter `historico` sem cópia defensiva, severidade BAIXA).
