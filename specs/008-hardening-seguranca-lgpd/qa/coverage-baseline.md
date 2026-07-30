# Coverage Baseline

Não mensurável para esta task: nenhum arquivo de produção com função/branch
executável entra no diff (`platform.schema.ts` é declaração Drizzle
declarativa, sem lógica condicional). Ferramenta de cobertura configurada
(`vitest` + provider `v8`, `include: ["src/**"]`) já existe no repositório
desde 001 — thresholds não alterados por este PR.

Baseline de execução da suíte (antes de T001, commit `cb343f5`): 12 arquivos
de teste, 0 testes coletados, 12 suítes falhando na inicialização com
`Vitest failed to find the runner` (erro do reporter `allure-vitest` — ver
`test-execution-report.md`). Pré-existente, não introduzido por 008.
