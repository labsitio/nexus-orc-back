# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T043

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch: `feat/153-faixa-preco-upsert`
- Commit testado: `0782822` (PR #682, MERGEABLE, base `main`)
- Task: T043 [US3] Infrastructure: `DrizzleFaixaPrecoRepository` (T023)
  completo com escrita (`upsert`), além da leitura já usada em US1/US3.
- Primeira validação (sem BUG-XXX prévio, sem reteste)

## 2. Resumo executivo
`upsert(faixaPreco)` insere via `insert(faixasPrecoCategoria).values(...)
.onConflictDoUpdate({ target: faixasPrecoCategoria.categoria, set: {...} })`.
Chave de conflito conferida contra o schema: `categoria` é `text(...)
.primaryKey()` em `validacao-orcamento.schema.ts` — a mesma coluna usada como
`target`, não uma chave sintética. Método novo na interface
`ParametroFaixaPrecoGateway` documentado com a semântica "última escrita
ganha" (transaction script sem agregado, conforme `plan.md`).

Os 3 testes de integração novos provam exatamente o ponto de risco da task:
insert de categoria nova; upsert repetido da mesma categoria não duplica
linha (`rowCount === 1`, valores atualizados para os da segunda escrita); e
gravação correta de `moeda`. Todos `describe.skipIf(!DATABASE_URL)`, mesmo
padrão de T023/T015/T016/T022 — sem convenção nova.

Os 3 consumidores existentes de `ParametroFaixaPrecoGateway`
(`ValidarOrcamento`, `RegistrarDecisaoHumanaValidacao`, e os respectivos
testes de integração) só usam `listarTodas()`; os fakes ganharam um stub de
`upsert` que lança erro explícito ("não usado por X — apenas leitura") em vez
de resolver silenciosamente — detectaria uma chamada indevida a `upsert` por
esses casos de uso caso um deles viesse a chamá-lo por engano.

Nenhum defeito de produção encontrado. Nenhum enfraquecimento de asserção.
Nenhuma alteração em código de produção realizada por este QA.

## 3. Requisitos cobertos e não cobertos
Cobertos (critério de aceite spec.md "faixa de preço parametrizável via
config, sem nova spec" — agora incluindo o caminho de escrita):
- `upsert` insere categoria nova quando não existe linha prévia;
- `upsert` da mesma categoria duas vezes não duplica linha — segunda escrita
  vence (`rowCount === 1`, `precoMinimoCentavos`/`precoMaximoCentavos` da
  segunda chamada);
- `upsert` grava `moeda` corretamente a partir de `Dinheiro.paraPayload()`;
- chave de conflito (`target`) é de fato a PK da tabela, não uma chave
  sintética — confirmado por leitura direta do schema, não apenas do
  código do repositório.

Não coberto / fora do escopo desta task, não é lacuna:
- `upsert` com múltiplas categorias em paralelo/concorrência (duas
  transações escrevendo a mesma categoria simultaneamente) — não exercitado;
  risco baixo dado que `onConflictDoUpdate` é atômico no Postgres (não há
  race condition read-then-write no código do adapter); registrado como
  risco residual.
- validação de entrada de `upsert` (ex.: rejeitar categoria vazia) — não é
  responsabilidade deste adapter; `CategoriaItem.de` e `Dinheiro.de` (VOs de
  Domain) já validam antes de chegar ao repositório, cobertos em
  `categoria-item.vo.test.ts`/`dinheiro.vo.test.ts` (fora do diff desta
  task).
- endpoint HTTP que expõe a escrita (`POST /v1/configuracoes/faixas-preco-
  categoria`) — explicitamente T044, ainda não implementado, fora do escopo.

## 4. Suítes executadas e comandos
Ambiente local sem Postgres utilizável (tentativa de subir
`docker compose up -d postgres` funcionou, mas o volume nomeado
`agent-a77ce4c4226ab13ec_postgres-data` já existia de uma sessão anterior
deste agente com credenciais divergentes das do `docker-compose.yml` atual —
autenticação falhou via TCP; descartado com `docker compose down -v` sem
tentar contornar, para não gastar tempo em depuração de ambiente fora do
escopo do QA). Evidência de execução real contra Postgres usada em
substituição: CI do GitHub Actions, run `31138950500`, commit `0782822`
(mesmo commit desta PR), todos os steps `success` (`Lint`, `Typecheck (tsc
--strict)`, `Typecheck infra (CDK)`, `CDK synth`, `Migrar schema`, `Test`,
`Audit dependencies`). Log do step `Test` confirma os 3 testes novos
executados (não pulados) com sucesso:
- `tests/bounded-contexts/validacao/infrastructure/persistence/drizzle-faixa-preco.repository.test.ts (5 tests)` — passou (5/5, ~88ms)
- Resumo global do CI: `Test Files 199 passed (199)` / `Tests 1203 passed (1203)` — zero skip (DATABASE_URL presente no CI), zero falha.

Comandos executados localmente por este QA (sem DB, integração pulada por
design):
- `npx pnpm typecheck` (`tsc --noEmit`) → sem erro.
- `npx pnpm lint` (`eslint .`) → sem achados.
- `node node_modules/vitest/vitest.mjs run --reporter=default` (suíte
  completa, sem `pnpm test`/Allure — ver seção 8) →
  `Test Files 180 passed | 19 skipped (199)` / `Tests 1094 passed | 109
  skipped (1203)`, 0 falhas. Total de arquivos (199) idêntico à baseline
  informada pelo dev-back-end (180 passed | 19 skipped) — nenhum arquivo
  novo, nenhuma regressão de arquivo. Total de testes (1203) bate
  exatamente com o total do CI (1203 passed), confirmando que os 109 testes
  "skipped" localmente são os mesmos que passam de verdade no CI contra
  Postgres real — divergência local é 100% ausência de DATABASE_URL, não
  falha.
- Diferença de contagem vs. baseline do dev-back-end (1091 passed | 106
  skipped = 1197 total): +6 testes totais. Desta task vieram apenas +3
  (`upsert` insert/update/moeda, todos skip local). Os +3 restantes são de
  commits já mergeados em `main` antes desta branch (`#665`
  workflow/status, `#666` auditoria export) e não fazem parte do diff desta
  PR — confirmado por `git diff main...HEAD` não tocar nenhum arquivo desses
  PRs.

## 5. Quantidade de testes por tipo
- Integração (Postgres real, via CI): 3 novos (`upsert` insert; `upsert`
  update sem duplicar; `upsert` grava moeda) + 2 pré-existentes de T023
  (`listarTodas` vazio; `listarTodas` traduz linha) no mesmo arquivo.
- Unitário: nenhum novo nesta task (gateway é interface, sem lógica própria
  para testar isoladamente).
- Nenhum teste adicional criado pelo QA — os 3 já escritos pelo dev-back-end
  cobrem exatamente o risco prioritário da task (chave de conflito correta).

## 6. Resultado
- Aprovados (escopo T043): 3 novos + 2 pré-existentes = 5/5 (via CI,
  commit `0782822`)
- Falhos: 0
- Ignorados (local, sem DATABASE_URL): 5 (mesmo arquivo, esperado)
- Instáveis: 0
- Regressão da suíte completa: 199 arquivos / 1203 testes, 0 falhas (CI);
  180 passed | 19 skipped arquivos / 1094 passed | 109 skipped testes
  localmente sem DB — consistente com a mesma execução, sem regressão.

## 7. Cobertura inicial e final
Não foi possível medir statements/branches locais para o método `upsert`
especificamente (requer Postgres real, indisponível localmente por
problema de credencial do volume Docker — seção 4/11). Evidência indireta
de cobertura funcional: os 3 testes novos exercitam as duas ramificações
observáveis de `onConflictDoUpdate` (insert quando a categoria não existe;
update quando existe), e o campo `moeda`, que juntos correspondem a 100% dos
campos gravados pelo método (`categoria`, `precoMinimoCentavos`,
`precoMaximoCentavos`, `moeda`) e às duas saídas possíveis da chave de
conflito. Sem branch condicional próprio no código do adapter (a decisão
insert/update é inteiramente delegada ao Postgres via `onConflictDoUpdate`),
portanto sem branch coverage aplicável no nível do TypeScript, mesmo
racional já registrado no relatório de T023 para `listarTodas`.

Threshold de cobertura do projeto não foi alterado; nenhum arquivo excluído
da medição para inflar percentual.

## 8. Allure
Não gerado nesta execução: `pnpm test` (reporter Allure do projeto) está
ambientalmente quebrado nesta worktree — `Error: Vitest failed to find the
runner`, resolvendo `allure-vitest` para
`.pnpm/allure-vitest@3.10.2_@vitest+runner@4.1.10_vitest@4.1.10` fora desta
worktree (armazenamento de conteúdo endereçável do pnpm compartilhado entre
worktrees). Falha idêntica para os 199 arquivos de teste, incluindo os que
não fazem parte do diff — condição pré-existente e já documentada em
`specs/003-validacao-consistencia-orcamentos/evidence/qa-final-report-T023.md`
seção 8/11 (`project_allure_vitest_incompat`), não introduzida por T043.
Execução e evidência usam `vitest run --reporter=default`; CI usa `pnpm test`
sem reportar essa falha, então o Allure provavelmente funciona no runner do
GitHub Actions — fora do alcance de verificação deste QA local. Nenhum dado
sensível nos testes: apenas categorias sintéticas
(`categoria-upsert-insert-<timestamp>` etc.) e valores monetários fictícios
em centavos.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Concorrência: duas escritas simultâneas para a mesma `categoria` não
  testadas explicitamente; risco baixo — `onConflictDoUpdate` é atômico no
  Postgres, sem janela de read-then-write no código do adapter.
- Endpoint HTTP de escrita (T044, `POST /v1/configuracoes/faixas-preco-
  categoria`) ainda não existe — `upsert` só é exercitado por teste direto
  de repositório, não ponta a ponta via API; será validado quando T044
  existir.
- Nota de arquitetura (não é bloqueio, já revisada pelo backend-reviewer
  como APPROVE WITH NITS): tabela `faixas_preco_categoria` não é
  tenant-scoped — decisão deliberada de catálogo global, documentada em
  comentário no próprio gateway; QA concorda que está fora do escopo do
  retrofit multi-tenant da spec 007 (`plan.md` regra 4, dado de configuração
  vs. dado de orçamento).

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida desde T023, contornada com
  `node node_modules/vitest/vitest.mjs run --reporter=default`.
- Docker está disponível nesta máquina (ao contrário do informado pelo
  dev-back-end) e o container Postgres sobe normalmente, mas o volume
  nomeado reaproveitado de uma sessão anterior deste mesmo agente tinha
  credenciais divergentes do `docker-compose.yml` atual, impedindo conexão
  via TCP (autenticação falhou; conexão via socket Unix dentro do
  container funcionou, confirmando que é problema de credencial
  desatualizada no volume, não de rede/porta). Descartado com
  `docker compose down -v` para não introduzir estado residual. Evidência
  de execução contra Postgres real usada em substituição: CI (run
  `31138950500`, mesmo commit, todos os steps verdes, incluindo `Migrar
  schema` e `Test`).

## 12. Parecer final
APROVADO PELO QA
