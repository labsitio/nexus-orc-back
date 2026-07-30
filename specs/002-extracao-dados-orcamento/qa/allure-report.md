# Allure Report — SPEC 002 (leva T001, T005-T011)

`vitest.config.ts` já registra `allure-vitest/reporter` (herdado da spec 001),
gerando `allure-results/` a cada `pnpm run test` — nenhuma configuração nova
necessária para esta leva (Domain puro, sem payload sensível a sanitizar:
todos os dados de teste são fixtures sintéticas, sem PII/CNPJ/tokens reais).

Neste worktree, a geração de `allure-results/` para as suítes desta leva não
pôde ser confirmada localmente devido ao problema ambiental do reporter
descrito em `test-execution-report.md` (reproduzido também nas suítes
pré-existentes, não específico desta PR). A execução de CI do PR #409
(run 30571782437) rodou com o mesmo `vitest.config.ts` e reporter configurado;
o artefato `allure-results/` gerado ali não é publicado como artifact do
workflow atual — recomenda-se ao DevOps adicionar upload de
`allure-results/`/relatório HTML como artifact do CI em versão futura do
workflow, para permitir a um QA humano abrir o relatório sem precisar
reexecutar a suíte.
