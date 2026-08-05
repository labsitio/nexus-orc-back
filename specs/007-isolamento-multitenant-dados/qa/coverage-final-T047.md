# Coverage Final — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados
Commit testado: `3049998` (após correção de gap de teste pelo QA)

## Cobertura final (npx vitest run --coverage, suíte completa exceto o arquivo
de timing pré-existente instável sob instrumentação — ver test-execution-report-T047.md)

| Métrica | Total |
|---|---|
| Statements | 91.92% (2561/2786) |
| Branches | 90.47% (1302/1439) |
| Functions | 90.14% (750/832) |
| Lines | 92.11% (2522/2738) |

Sem variação relevante face à baseline: os 3 `it()` adicionados pelo QA
(asserção de RLS de catálogo) exercitam `pg_class`/`pg_policies` via SQL cru
contra Postgres real — não instrumentado pelo v8 provider (fora de
`src/**`), portanto não move o percentual de `src/`. O ganho real é de
regressão (detectar RLS removida acidentalmente em migração futura), não de
cobertura de linha.

## Lacunas residuais documentadas (baixo risco, não bloqueiam o gate)

- `*.schema.ts` dos 3 BCs (50-62% stmts) — DDL/definição de tabela Drizzle,
  não executável de forma unitária; exercitado indiretamente pela migração
  real + `schema.test.ts` de integração contra Postgres (mesmo padrão
  pré-existente em 001/004).
- `composition/extracao.ts` (66.66% stmts, linha 41) — ramo de composição
  raiz não coberto por teste unitário dedicado; mesmo padrão já aceito em
  validações anteriores desta spec (composição raiz é fiação, não lógica de
  negócio).
- `dev/*` (0%) — scripts de desenvolvimento local (seed, LocalStack), fora do
  escopo de teste automatizado desde specs anteriores.
