# Allure Report

Não gerado. Não aplicável nesta fase: não há teste de runtime executando
(suíte do repositório falha na inicialização do reporter `allure-vitest`
— falha preexistente ao PR, ver `test-execution-report.md`). Nenhum teste
novo foi adicionado por esta task (scaffolding puro), logo não há
`allure-results` novo a produzir.

## T005 — gerado (commit `4db548f`)

`npx vitest run` / `npm test` (config completa, reporter `allure-vitest`
ativo) executam sem o erro de inicialização registrado na Fase 1 e produzem
`allure-results/` na raiz do repositório (245 arquivos no total da suíte,
incluindo os 9 resultados de `PoliticaRetencao`, identificados via
`grep -rl "PoliticaRetencao" allure-results`). Suite: `PoliticaRetencao`
(feature/story derivados do describe/it do arquivo de teste). Nenhum dado
sensível nos payloads (VO opera sobre valores sintéticos de teste, sem PII).
Relatório HTML não gerado nesta validação (não solicitado; `allure-results`
brutos são suficientes como evidência).

## T007 — gerado (commit `47c19bc`)

`npx vitest run tests/platform/conformidade` (config completa, reporter
`allure-vitest` ativo) executa sem erro e produz resultados em
`allure-results/` na raiz do repositório, identificados via
`grep -rl "ReferenciaTitular" allure-results`. Suite: `ReferenciaTitular`
(feature/story derivados do `describe`/`it` do arquivo de teste). Nenhum
dado sensivel nos payloads — VO opera sobre valores sinteticos de teste
(e-mails ficticios `@exemplo.com`), sem PII real. Relatorio HTML nao gerado
nesta validacao (nao solicitado; `allure-results` brutos sao suficientes
como evidencia, mesmo padrao de T005).

## T009 — não gerado nesta validação (commit `37ada19`)

Reproduzido `Vitest failed to find the runner` mesmo com a config completa
(reporter `allure-vitest` ativo) — ao contrário de T005/T007, desta vez o
bug se reproduziu, confirmando seu caráter intermitente já registrado desde
a Fase 1. Contornado com `pnpm vitest run --reporter=default` (mesmo
workaround de T006), que não gera `allure-results` (usa o reporter padrão do
Vitest, não o adaptador Allure). Evidência de execução registrada via saída
de `vitest run` em `test-execution-report.md` (3/3 testes passando, suíte
completa 293 passed/27 skipped/0 failed). Risco residual: adaptador
`allure-vitest` segue não confiável neste ambiente — recomendação já
registrada desde T001 (investigar/corrigir `vitest.config.ts`/versão do
`allure-vitest` como item de infraestrutura, fora do escopo de código de
produção de T009) permanece em aberto.
