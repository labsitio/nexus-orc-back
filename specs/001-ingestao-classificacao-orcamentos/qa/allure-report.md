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

---

# Allure — T044–T047 (PR #404)

Reaproveitado `allure-vitest` + `vitest.config.ts` já configurados.
`npx vitest run --coverage` gerou `allure-results/` (raiz do repo,
git-ignorado) com resultado por teste da suíte inteira (12 arquivos, 68
casos), todos `"status":"passed"`.

Relatório HTML não gerado (requer CLI Java `allure`, fora do escopo de
dependências Node — mesma limitação registrada em rodadas anteriores;
publicação cabe ao CI, T003, ainda não configurado neste repo para Allure).

Nenhum dado sensível anexado — fixtures sintéticas (UUID de teste
`018f2f6a-...`, nomes de fornecedor fictícios, bucket `nexo-orcamentos-raw`
fictício).

---

# Allure — T011 (issue #16) — PR #410

Reaproveitado `allure-vitest` + `vitest.config.ts` já configurados.
`pnpm exec vitest run --coverage` (com `DATABASE_URL`) gerou `allure-results/`
(raiz do repo, git-ignorado) com resultado por teste da suíte inteira (14
arquivos, 79 casos), todos `"status":"passed"`.

Relatório HTML não gerado (requer CLI Java `allure`, fora do escopo de
dependências Node — mesma limitação registrada em rodadas anteriores;
publicação cabe ao CI, T003, ainda não configurado neste repo para Allure).

Nenhum dado sensível anexado — fixtures sintéticas (UUID v7 gerado em
runtime, bucket `nexo-orcamentos-raw` fictício, `fornecedor-x`/`fornecedor-x-
confirmado` fictícios).

---

# Allure — T014/T015 (issues #19, #20) — PR #412

Reaproveitado `allure-vitest` + `vitest.config.ts` já configurados.
`corepack pnpm test` gerou `allure-results/` (raiz do worktree `qa-pr412`,
git-ignorado) com resultado por teste da suíte inteira (31 arquivos
executados, 142 casos + 2 arquivos de integração Postgres pulados sem
`DATABASE_URL`), todos `"status":"passed"`.

Relatório HTML não gerado (requer CLI Java `allure`, mesma limitação
registrada em todas as rodadas anteriores; publicação cabe ao CI, ainda não
configurado neste repo para Allure).

Nenhum dado sensível anexado — fixtures sintéticas (`orc-1`/`orc-2`/`orc-3`,
bucket `nexo-orcamentos-raw` fictício, `nomeServico: 'teste-ingestao-
identificacao'`). Nenhum token/JWT real presente — `logger.ts` já redige
`req.headers.authorization` por design (T015), confirmado por revisão do
código, não exercitado nos testes atuais (nenhum handler HTTP usa
`criarLogger` ainda).
