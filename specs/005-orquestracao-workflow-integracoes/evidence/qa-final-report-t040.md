# QA Final Report — T040 (PR #676, issue #246) — Application: caminho de baixa confiança em `ConsolidarEDecidirWorkflow` (BC orquestracao)

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- Issue: #246
- PR: #676 (labsitio/nexus-orc-back)
- Branch: feat/246-baixa-confianca-escalonamento
- Commit testado: 3b5947c (base main)
- Primeira validação (não é reteste de BUG).

## Resumo executivo
Diff de produção: nenhum. Único arquivo alterado é `tasks.md` (marca T040 como concluída com justificativa
e referência a testes). Investigação do PR confirma que o comportamento pedido em T040 — transitar o
agregado para `PENDENTE_REVISAO_HUMANA` e publicar `DecisaoWorkflowEscalonadaParaComprador` diretamente
quando o Orquestrador não atinge confiança suficiente — já foi entregue junto de T028 (#234). A transição
de estado é regra do agregado (`DecisaoWorkflow.registrarTentativaOrquestrador`), a application só lê
`status` pós-transição sem `if` de máquina de estado, e o evento já carrega `tenantId` obrigatório e
`schemaVersion: 2` hardcoded. QA reexecutou de forma independente os testes já existentes citados no PR e
a suíte completa para confirmar o comportamento real (não apenas leitura de código).

## Requisitos cobertos
Mapeado contra os critérios de aceite testáveis do `spec.md` (US2, "Decisão sem confiança suficiente —
escalonamento assíncrono para o comprador", linhas 81-91 e 122-140):

1. "Nenhum orçamento é aprovado automaticamente sem que o Orquestrador tenha reportado confiança
   suficiente; abaixo da confiança suficiente, o único destino automático possível é a fila de
   escalonamento" — coberto por
   `tests/bounded-contexts/orquestracao/application/consolidar-e-decidir-workflow.test.ts` caso
   "T040 — confiança insuficiente: publica DecisaoWorkflowEscalonadaParaComprador, nunca o desfecho"
   (Orquestrador reporta `acao: 'APROVAR'` com confiança 40; agregado transita para
   `PENDENTE_REVISAO_HUMANA`, publica só `DecisaoWorkflowEscalonadaParaComprador`, nunca o evento de
   desfecho de aprovação). Reexecutado — PASS.
2. Mesmo critério, na camada de domínio — coberto por
   `tests/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.test.ts` caso
   "confiança insuficiente transita direto para PENDENTE_REVISAO_HUMANA, nunca decide". Reexecutado — PASS.
3. Evento `DecisaoWorkflowEscalonadaParaComprador` carrega `tenantId`/`schemaVersion: 2` — confirmado por
   leitura do `payload` publicado no teste acima (`publisher.publicados[0]` é instância de
   `DecisaoWorkflowEscalonadaParaComprador`) e por inspeção do construtor do evento
   (`src/bounded-contexts/orquestracao/domain/events/decisao-workflow-escalonada-para-comprador.event.ts`):
   `tenantId: string` é parâmetro posicional obrigatório (não opcional), `schemaVersion = 2 as const`
   hardcoded no evento, sem caminho de código que o omita.
4. "Um orçamento na fila de escalonamento só avança mediante confirmação explícita do comprador — nunca por
   tempo de espera, volume da fila, ou exaustão de tentativas automáticas" — coberto indiretamente pelo caso
   "reentrega SQS pós-escalonamento (PENDENTE_REVISAO_HUMANA): nunca reinvoca o Orquestrador" no mesmo
   arquivo de application: reentrega de mensagem SQS sobre agregado já em `PENDENTE_REVISAO_HUMANA` é no-op
   (gateway do Orquestrador configurado para lançar se chamado; `publisher.publicados` permanece vazio).
   Não existe, em nenhum arquivo de produção do BC, código que transite `PENDENTE_REVISAO_HUMANA` → `DECIDIDO`
   por qualquer gatilho que não seja `registrarDecisaoHumana` (T042, ainda não implementado — próxima task
   do backlog, fora do escopo de T040). Reexecutado — PASS.
5. "Tentativa única, sem reprocessamento automático por IA" (comentário de governança, linha 173-175 do
   spec) — mesmo teste de reentrega SQS confirma que o Orquestrador nunca é reinvocado após a primeira
   tentativa, seja o desfecho `DECIDIDO` ou `PENDENTE_REVISAO_HUMANA`.

Nenhuma lacuna de cobertura identificada para os critérios de aceite de T040/US2. O critério "comprador, ao
confirmar explicitamente, tem a decisão registrada com o mesmo peso de uma decisão automática" pertence a
T042 (`RegistrarDecisaoHumanaWorkflow`), ainda não implementado — não é lacuna desta task, é o próximo passo
já mapeado em `tasks.md`.

## Verificação independente (reexecutada pelo QA)
1. `git fetch origin pull/676/head:pr-676`; commit confirmado `3b5947c`.
2. `git diff main pr-676 --stat` — um único arquivo, `specs/005-orquestracao-workflow-integracoes/tasks.md`
   (1 linha alterada: checkbox T040 `[ ]` → `[x]` mais texto de justificativa). Nenhum arquivo de produção
   ou de teste no diff — confirma a alegação do commit de que T040 já estava implementado desde T028.
3. Leitura de `src/bounded-contexts/orquestracao/domain/events/decisao-workflow-escalonada-para-comprador.event.ts`
   — `tenantId` obrigatório, `schemaVersion = 2 as const`.
4. Suíte alvo (reexecução dos dois testes citados no PR):
   `node_modules/.bin/vitest.CMD run --reporter=default tests/bounded-contexts/orquestracao` — os casos
   "T040 — confiança insuficiente..." e "confiança insuficiente transita direto para
   PENDENTE_REVISAO_HUMANA..." passaram, dentro do total do arquivo/suíte abaixo.
5. Suíte completa do BC orquestracao: 27 arquivos passed | 2 skipped (29), 212 testes passed | 17 skipped
   (229). Skips são exclusivamente os testes de persistência Drizzle (`decisao-workflow.schema.test.ts`,
   `drizzle-decisao-workflow.repository.test.ts`) por ausência de Postgres local — limitação de ambiente já
   registrada em relatórios QA anteriores desta spec, sem relação com T040.
6. Suíte completa do repositório: `node_modules/.bin/vitest.CMD run --reporter=default` — 178 arquivos
   passed | 19 skipped (197), 1081 testes passed | 106 skipped (1187), zero falhas. Números idênticos à
   baseline da main declarada pelo dev-back-end antes deste PR — confirma ausência de regressão introduzida
   (esperado, já que não há diff de código).

## Suítes executadas e comandos
1. `node_modules/.bin/vitest.CMD run --reporter=default tests/bounded-contexts/orquestracao` — 212
   passed | 17 skipped (229) em 27 arquivos passed | 2 skipped (29).
2. `node_modules/.bin/vitest.CMD run --reporter=default` (repositório completo) — 1081 passed | 106
   skipped (1187) em 178 arquivos passed | 19 skipped (197).

Nota de ambiente: o reporter `allure-vitest` configurado em `vitest.config.ts` falha nesta máquina Windows
("Vitest failed to find the runner") — problema de ambiente pré-existente, não relacionado a este PR; `vitest.config.ts`
não foi tocado (há PR #675 em aberto sobre esse arquivo). Override `--reporter=default` usado apenas para
obter o resultado real da suíte, sem alterar configuração persistida.

## Cobertura inicial e final
Sem diff de código de produção — nenhuma alteração de cobertura estrutural a medir. Cobertura do caminho de
baixa confiança já é exercitada pelos dois testes pré-existentes citados (application + domain aggregate),
confirmados PASS nesta execução.

## Allure
Não aplicável — stack de testes do repositório (vitest) não possui adaptador Allure funcional neste
ambiente (ver nota de ambiente acima). Mesma constatação de relatórios QA anteriores desta spec (T010, T012,
T014, T015, T018, T019, T026, T031). Validação registrada via output determinístico do vitest, reproduzível
pelos comandos acima.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
1. T042 (`RegistrarDecisaoHumanaWorkflow`) ainda não implementado — o critério de aceite "comprador confirma
   explicitamente e a decisão é registrada com o mesmo peso de uma decisão automática" depende dessa task
   futura. Não é lacuna de T040.
2. Testes de persistência Drizzle seguem `skip` no ambiente local por ausência de Postgres — limitação de
   ambiente já registrada em relatórios QA anteriores desta spec.

## Limitações do ambiente
1. Docker não está rodando — 19 arquivos de teste (Postgres/LocalStack) fazem skip, comportamento normal.
2. Reporter `allure-vitest` quebra nesta máquina Windows — contornado com `--reporter=default` apenas para
   obter o resultado real da suíte; `vitest.config.ts` não foi alterado.

## Parecer final
**APROVADO PELO QA**

PR não altera código de produção — apenas documenta em `tasks.md` que T040 já foi entregue junto de T028.
Reexecução independente (não apenas leitura) dos dois testes citados confirma o comportamento: confiança
insuficiente transita o agregado para `PENDENTE_REVISAO_HUMANA` e publica exclusivamente
`DecisaoWorkflowEscalonadaParaComprador` (com `tenantId` obrigatório e `schemaVersion: 2`), nunca o evento de
desfecho de aprovação; reentrega SQS sobre o mesmo estado é no-op, sem reinvocar o Orquestrador — cobrindo
"nunca autoaprova por exaustão/tempo/volume". Suíte completa do BC orquestracao (212 testes) e do
repositório (1081 testes) sem nenhuma falha, números idênticos à baseline declarada. Nenhuma lacuna de
cobertura para os critérios de aceite de T040/US2. Nenhum defeito de produção a reportar.
