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
