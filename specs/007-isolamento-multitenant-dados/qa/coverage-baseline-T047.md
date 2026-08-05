# Coverage Baseline — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados
Commit testado (antes das alterações do QA): `9a14721`

Nenhum threshold de cobertura pré-existente configurado no projeto
(`vitest.config.ts` não define `coverage.thresholds`) — cobertura é medida
como indicador auxiliar, não gate automático de CI.

## Baseline (npx vitest run --coverage, HEAD `9a14721`, suíte completa)

| Métrica | Total |
|---|---|
| Statements | 91.92% (2561/2786) |
| Branches | 90.47% (1302/1439) |
| Functions | 90.14% (750/832) |
| Lines | 92.11% (2522/2738) |

Nota: medição excluiu `tests/bounded-contexts/ingestao-identificacao/infrastructure/sanitizar-conteudo-documento.test.ts`
da execução com `--coverage` (ver test-execution-report-T047.md — falha de
timing sob overhead de instrumentação v8, teste não tocado por esta PR,
passa isoladamente e sem `--coverage`).

Pontos relevantes já cobertos antes desta PR (herdados de T046/#632):
- `extracao-orcamento.aggregate.ts`: 100% stmts/branches/lines, 92.85% functions.
- `orcamento-validacao.aggregate.ts`: coberto via `.../value-objects` (98%+).
- Repositórios Drizzle dos 3 BCs: 100% stmts/lines antes do retrofit desta PR.
