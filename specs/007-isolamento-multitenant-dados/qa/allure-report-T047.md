# Allure Report — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados
Commit testado: `3049998`

`allure-vitest` reporter já configurado em `vitest.config.ts`:
```ts
reporters: ["default", ["allure-vitest/reporter", { resultsDir: "allure-results" }]]
```

`allure-results/` gerado localmente (worktree de validação) pela execução de
`npx vitest run --coverage --passWithNoTests` — 6461 arquivos (results +
attachments), cobrindo os 1073 testes executados, incluindo:
- os 8 testes de `tests/bounded-contexts/{extracao,validacao}/contract/tenant-isolation.test.ts`;
- os 3 testes de RLS de catálogo adicionados pelo QA nesta validação;
- toda a suíte de segurança `tests/security/isolamento-multitenant/`.

Geração do relatório HTML (`npx allure generate allure-results -o
allure-report`) não executada nesta validação — `allure` CLI não é
dependência instalada no projeto (`package.json` não lista `allure-commandline`),
mesma limitação já registrada em validações anteriores desta spec
(qa-final-report-T046.md e anteriores). Não bloqueia o gate: os
`allure-results` brutos são evidência suficiente e reproduzível a partir dos
comandos documentados em `test-execution-report-T047.md`. Nenhum dado
sensível (token, CPF/CNPJ real, credencial) presente nos resultados — os
`tenantId`/`orcamentoId` usados em teste são UUIDs sintéticos gerados por
`TenantId.novo()`/`randomUUID()`.

## Próxima ação recomendada (DevOps/CI, fora do escopo deste QA)

Se o pipeline de CI publicar `allure-report` como artefato, considerar
adicionar `allure-commandline` como devDependency para gerar o HTML
automaticamente — decisão de infraestrutura, não deste QA.
