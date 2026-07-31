# QA — T014 DrizzleOrcamentoValidacaoRepository

## SPEC_ID / versão testada
003-validacao-consistencia-orcamentos — branch `feat/003-validacao`, commit `e54cf72`, PR #486 (draft).

## Escopo
Task pontual de Infra (não uma US completa). Gate cobre apenas T014 e os aditivos
de `paraPayload()` em `DadosExtraidosParaValidacao`/`ItemParaValidacao` que ela introduziu.

## Critério de aceite
"traduzindo linha↔agregado, nunca vazando tipo JSONB bruto para fora da Infra."
Verificado por leitura de código: `LinhaValidacaoOrcamento`/`LinhaHistorico` são tipos
privados ao módulo do repositório; o payload JSONB de `dadosExtraidos`/`inconsistencias`
só atravessa a fronteira via `paraPayload()` (VOs) e as funções `*DaLinha` (repo) — nunca
exposto fora de `drizzle-orcamento-validacao.repository.ts`.

## Testes
- `tests/bounded-contexts/validacao/infrastructure/persistence/drizzle-orcamento-validacao.repository.test.ts`
  (5 casos, integration, `describe.skipIf(!DATABASE_URL)`): not-found, roundtrip
  PENDENTE→VALIDADO com histórico, escalonamento PENDENTE_REVISAO_HUMANA→ACEITE_COM_RESSALVA
  com 2 entradas de histórico, não-duplicação em re-save idempotente, concorrência
  (`Promise.all` de 2 `salvar()` simultâneos → exatamente 1 entrada de histórico via lock
  `FOR UPDATE`).
- `dados-extraidos-para-validacao.vo.test.ts` / `item-para-validacao.vo.test.ts`: casos
  novos de `paraPayload()`.

## Execução

### CI (PR #486, run 30651876583) — Postgres real
- Service container `pgvector/pgvector:pg16` provisionado, `pnpm db:migrate` aplicado
  com sucesso antes da etapa `Test`.
- `drizzle-orcamento-validacao.repository.test.ts (5 tests) 145ms` — todos passaram,
  sem skip.
- Job `ci`: **pass** (1m5s). https://github.com/labsitio/nexus-orc-back/actions/runs/30651876583/job/91226837430

### Local (sem Postgres disponível no ambiente — docker indisponível)
- `pnpm typecheck` — limpo, sem erros.
- `pnpm lint` — limpo, sem erros.
- `pnpm test` (suíte completa) — **427 passed | 45 skipped** (95 arquivos: 86 passed, 9 skipped).
  Todos os skips são suítes `describe.skipIf(!DATABASE_URL)` de integração/schema
  (inclusive as 5 desta task) — comportamento esperado sem `DATABASE_URL` local.
  Sem regressão em nenhuma suíte unitária/contrato.

## Cobertura
Não medida via relatório de cobertura dedicado nesta validação pontual — task de Infra
com 5/5 cenários de integração cobrindo os fluxos de leitura/escrita do repositório
(incluindo concorrência) confirmados via CI real. Sem lacuna material identificada
para o critério de aceite desta task.

## Allure
Não configurado neste ponto do projeto (nenhum adaptador Allure presente no repositório
até esta validação). Registrado como lacuna de infraestrutura de testes, não bloqueante
para o gate desta task pontual — fora do escopo de uma correção de Infra isolada;
recomenda-se tratativa em task própria de plataforma de testes, se priorizado pelo
Tech Lead/PM.

## Bugs encontrados
Nenhum.

## Riscos residuais
- Allure não configurado no projeto (ver acima).
- Ambiente local deste QA não possui Docker/Postgres — validação de integração
  desta task dependeu inteiramente da evidência de CI (aceitável: CI é o serviço
  que provisiona Postgres real e já pegou bug real de FK em T013).

## Parecer final
APROVADO PELO QA
