# Allure — T004/T006–T009

Reporter: `allure-vitest` 3.10.2, configurado em `vitest.config.ts` (raiz do
repo), gerando `allure-results/` (git-ignorado, análogo a `coverage/`).

Execução: `pnpm exec vitest run --coverage` → 40 arquivos `*-result.json` em
`allure-results/`, um por teste, todos `"status":"passed"`.

Geração do relatório HTML (`allure generate allure-results -o allure-report`)
não foi executada nesta task — requer o CLI `allure` (Java), fora do escopo
de dependências Node do projeto. Registrado como limitação: a publicação do
relatório HTML no CI é tarefa de T003 (pipeline ainda não existe). Os
`allure-results` brutos já comprovam a execução e podem ser processados pelo
CLI Allure a qualquer momento sem re-executar os testes.

Nenhum dado sensível anexado — testes usam apenas fixtures sintéticas
(`"Fornecedor X"`, UUIDs/bucket fictícios).

---

# Allure — T016/T019 (PR #402)

Reaproveitado `allure-vitest` + `vitest.config.ts` já configurados em rodada
anterior. `pnpm exec vitest run --coverage` gerou `allure-results/` (raiz do
repo, git-ignorado) com resultado por teste da suíte inteira (63 arquivos
`*-result.json`), todos `"status":"passed"`.

Relatório HTML novamente não gerado (requer CLI Java `allure`, fora do
escopo de dependências Node — mesma limitação registrada nas rodadas
anteriores; ação de publicação cabe ao CI, T003).

Nenhum dado sensível anexado — fixtures sintéticas (UUIDs, bucket fictício,
`"orcamento.pdf"`).
