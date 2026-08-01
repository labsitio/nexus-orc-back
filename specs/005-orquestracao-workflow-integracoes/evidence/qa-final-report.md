# QA Final Report — T006 (issue #212) — EventBridge OrcamentoValidado/ComRessalva → decisao-workflow-queue

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- PR: #464 (labsitio/nexus-orc-back)
- Branch: feat/005-t006-eventbridge-validacao
- Commit testado: b2c67c979352670eaceb2ad1a3345715fddbc45c
- Primeira validação (spec 005 não possuía artefatos de QA anteriores; T004/T005 foram aprovadas apenas por backend-reviewer).

## Resumo executivo
PR provisiona regra EventBridge no bus `nexo-dominio-bus` roteando `detail-type: OrcamentoValidado`/`OrcamentoValidadoComRessalva`, `source: nexo.validacao` → `decisao-workflow-queue` (fila já provisionada em T003/#209, mergeada). Diff é IaC puro: 3 arquivos (`infra/lib/decisao-workflow-queue-stack.ts`, `infra/bin/app.ts`, `specs/005-.../tasks.md`), padrão idêntico a T004/#210 (PR #461) e T005/#211 (PR #463).

## Requisitos cobertos
- T006/#212: regra EventBridge com os 2 detailTypes (`OrcamentoValidado`, `OrcamentoValidadoComRessalva`) e source (`nexo.validacao`) exatos, roteando para `decisao-workflow-queue` — CONFIRMADO via `cdk synth`.
- Contrato literal usado no código confrontado contra `specs/005-orquestracao-workflow-integracoes/plan.md:154` e `specs/003-validacao-consistencia-orcamentos/plan.md:112,114,116` — nomes de eventos e source coincidem exatamente, sem divergência.
- Fila/DLQ/alarme não recriados fora de escopo (diff mostra apenas adição de `props.dominioBus`, `events.Rule` e atualização de comentário; a fila e a DLQ já existiam desde T003 — confirmado via `git diff` contra o commit anterior de T005, fde696c).

## Lacuna de cobertura (não bloqueante)
Os Domain Events `OrcamentoValidado`/`OrcamentoValidadoComRessalva` ainda não existem em código-fonte no BC Validação (spec 003) — não há `src/bounded-contexts/validacao/domain/events/`. Não há, portanto, como escrever um teste de integração real ponta-a-ponta (publish real → rule → SQS) hoje; qualquer simulação exigiria inventar um evento fora do contrato publicado pela spec 003, o que não constitui evidência válida.

Avaliação de QA sobre o racional do backend-reviewer (concordância): a regra é declarativa e fica inerte (sem efeito colateral, sem custo, sem risco operacional) até o evento existir. Isso não é defeito de produto desta PR — é risco de coordenação entre specs 003/005 já registrado explicitamente no Constitution Check e nas alternativas de `plan.md` da spec 005 (linhas 56 e 228), não introduzido por este commit, e reproduz o mesmo padrão já aceito nas 2 PRs anteriores (T004, T005) para os outros dois eventos upstream (`OrcamentoClassificado`, `OrcamentoExtraido`/`ComPendenciaConfirmada`) — nenhum dos quais também tem publisher real ainda. Concordo em não bloquear por isso; registro como risco residual a ser fechado quando a spec 003 implementar os eventos (ação de regressão futura: revalidar o `detailType`/`source` real contra este stack quando o publisher existir).

## Suítes executadas e comandos
1. `export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH" && npm run typecheck:infra` — PASS, sem erros.
2. `npx cdk synth DecisaoWorkflowQueueStack` — PASS. `EventPattern` gerado:
   ```yaml
   EventPattern:
     source:
       - nexo.validacao
     detail-type:
       - OrcamentoValidado
       - OrcamentoValidadoComRessalva
   State: ENABLED
   ```
   Fila (`decisao-workflow-queue`) e DLQ (`decisao-workflow-queue-dlq`) presentes no template, nomes inalterados.
3. `npx eslint infra/lib/decisao-workflow-queue-stack.ts infra/bin/app.ts` — PASS, sem warnings.
4. `npm test` (suíte completa, baseline) — 329 passed / 27 skipped / 11 arquivos falhando por dependência ausente no ambiente local (`pino`, `@opentelemetry/instrumentation-aws-lambda` não instalados em `node_modules`). Falhas pré-existentes, sem relação com os 3 arquivos desta PR (nenhum deles importa essas dependências) — classificado como **problema de ambiente**, não de produto desta PR.
5. Escopo do diff confirmado via `git diff fde696c..b2c67c9` — exatamente os 3 arquivos declarados no handoff, sem alteração fora do previsto (fila/DLQ pré-existentes de T003 preservados; apenas `Rule` + prop `dominioBus` + atualização de comentário/tasks.md).

## Cobertura estrutural
Não aplicável — stacks CDK em `infra/lib/` não possuem convenção de teste unitário no repositório (confirmado: nenhum arquivo em `tests/` cobre `infra/lib/*.ts`; mesma ausência já presente e aceita em T004/T005). Verificação funcional decorre de `cdk synth` (fonte de verdade do template CloudFormation gerado), typecheck e lint.

## Allure
Não aplicável — não há suíte de testes automatizados de aplicação exercitando este diff (IaC puro, sem lógica de domínio). Nenhum allure-results gerado para esta PR; validação registrada neste relatório com evidência de `cdk synth` reproduzível.

## Bugs encontrados
Nenhum.

## Riscos residuais
1. Contrato `OrcamentoValidado`/`OrcamentoValidadoComRessalva`/`nexo.validacao` ainda não implementado em código-fonte na spec 003 — regra fica inerte até então (ver seção "Lacuna de cobertura"). Ação de acompanhamento: QA revalidar este stack (detailType/source reais) quando spec 003 publicar os Domain Events.
2. Falhas de ambiente local (dependências ausentes em `node_modules` para pino/OpenTelemetry) impedem execução completa da suíte de testes de aplicação neste ambiente — não bloqueante para esta PR (arquivos não relacionados), mas registrado para DevOps/dev-back-end investigar se persistir em outras validações.

## Limitações do ambiente
Node do PATH padrão é v16 (incompatível); uso de `$HOME/.nvm/versions/node/v24.14.1/bin` necessário para todos os comandos npm/npx, conforme instruído.

## Parecer final
**APROVADO PELO QA**

Diff IaC puro, escopo exato, typecheck e synth limpos, EventPattern confirmado byte-a-byte contra o contrato documentado em `plan.md` das specs 003 e 005, sem regressão introduzida, sem defeito de produto. Racional do backend-reviewer sobre o evento upstream ainda não implementado é aceito por QA como risco de coordenação já registrado e não bloqueante, idêntico ao padrão já aprovado em T004/T005.

---

## Validação — T013 (issue #219), primeira validação

### SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- PR: #513, branch `feat/005-t013-domain-events`, commit `7c0376d`
- Primeira validação (sem BUG anterior)

### Resumo executivo
PR define os 5 Domain Events de desfecho do agregado `DecisaoWorkflow` (BC Orquestração): `OrcamentoAprovadoParaProcessamento`, `OrcamentoEncaminhadoParaComprador`, `OrcamentoReenvioSolicitado`, `IntegracaoExternaSolicitada`, `DecisaoWorkflowEscalonadaParaComprador`. Domain puro (sem framework/ORM/SDK), sem import cruzado de outro Bounded Context. Título desatualizado da issue #219 (menciona 6 eventos incluindo `decisao-workflow-baixa-confianca-detectada`, removido do `plan.md`/`tasks.md` vigentes após eliminação do Agente Revisor de Workflow) — não é lacuna de escopo; `plan.md`/`tasks.md` atuais confirmam 5 eventos, exatamente os implementados.

### Requisitos cobertos (T013, plan.md "Domain Events" linhas 119-127)
1. Todos os 5 eventos: `schemaVersion: 1` (literal `1 as const`), `orcamentoId: string`, `ocorreuEm` ISO 8601 (`Date.toISOString()`, default `new Date()`), `detailType` estático correspondente ao nome da classe — CONFIRMADO por leitura de código e teste parametrizado (`domain-events.test.ts`, `describe.each`).
2. `OrcamentoAprovadoParaProcessamento`/`OrcamentoEncaminhadoParaComprador`/`OrcamentoReenvioSolicitado` carregam `agenteOrigem: AgenteOrigemDecisao`, `criterio: string`, `nivelConfianca: number | null` (comentário explícito: null apenas quando `HUMANO`); `OrcamentoReenvioSolicitado` adicionalmente `motivoDadoAusente: string` — CONFIRMADO, e teste dedicado cobre valor não vazio referenciando pendência concreta.
3. `IntegracaoExternaSolicitada`: payload restrito a `orcamentoId`/`acaoOrigem`/`ocorreuEm` (+ envelope `detailType`/`schemaVersion`) — CONFIRMADO por leitura de código e por teste que assere `Object.keys(evento).sort()` exatamente igual a `['acaoOrigem','detailType','ocorreuEm','orcamentoId','schemaVersion']`. Nenhum campo de protocolo de sistema parceiro presente — requisito de segurança/desacoplamento do spec.md satisfeito.
4. `DecisaoWorkflowEscalonadaParaComprador` carrega `nivelConfianca: number` (não nullable, sempre reportado pelo Orquestrador) — CONFIRMADO.
5. Nenhum import de framework/ORM/SDK no Domain (`grep -rn "^import" src/bounded-contexts/orquestracao/domain/events/*.ts` — apenas imports internos a `./domain-event.js` e `../value-objects/decisao-roteamento.vo.js`, ambos do mesmo BC); nenhum import cruzado de outro Bounded Context — CONFIRMADO.

### Suítes executadas e comandos
```
npx vitest run tests/bounded-contexts/orquestracao/domain/events/domain-events.test.ts
→ 8 passed

npx vitest run tests/bounded-contexts/orquestracao
→ 72 passed | 1 skipped (10 arquivos) — skip pré-existente (teste de integração Drizzle
  dependente de banco local, não relacionado a esta PR)

npx eslint src/bounded-contexts/orquestracao/domain/events tests/bounded-contexts/orquestracao/domain/events
→ sem erros/warnings

npx tsc --noEmit -p .
→ erros pré-existentes de ambiente (módulos @aws-sdk/*, pino, @opentelemetry/* ausentes
  em node_modules — dependências não instaladas neste worktree), todos em BCs extracao/
  ingestao-identificacao/validacao/platform-conformidade; nenhum erro em
  src/bounded-contexts/orquestracao/** — confirmado via grep, zero ocorrências.
  Classificado como problema de ambiente, não relacionado a esta PR.
```

### Cobertura estrutural (escopo: arquivos desta PR)
```
npx vitest run tests/bounded-contexts/orquestracao/domain/events/domain-events.test.ts \
  --coverage --coverage.include='src/bounded-contexts/orquestracao/domain/events/**'
→ Statements 100% (37/37) | Branches 100% (5/5) | Functions 100% (5/5) | Lines 100% (37/37)
```

### Allure
Não configurado no repositório (nenhum adaptador Allure presente em `package.json`/config de runner nas validações anteriores desta spec nem das specs 001-004). Mantida a convenção já aceita: evidência via saída do `vitest` reproduzível neste relatório, sem lacuna nova introduzida por esta PR.

### Bugs encontrados
Nenhum.

### Riscos residuais
Nenhum novo. Risco de coordenação já registrado na validação de T006 (eventos upstream de spec 003 ainda pendentes) não se aplica aqui — T013 define eventos de desfecho publicados pela própria spec 005, sem dependência de spec externa.

### Limitações do ambiente
`node_modules` deste worktree não possui as dependências de infraestrutura (`@aws-sdk/*`, `pino`, `@opentelemetry/*`), gerando erros de `tsc --noEmit` fora do escopo desta PR (BCs extracao/ingestao-identificacao/validacao/platform-conformidade). Não bloqueante — nenhum arquivo de `orquestracao/domain/events` afetado.

### Parecer final
**APROVADO PELO QA**

Os 5 Domain Events cobrem exatamente o contrato descrito em `plan.md` (schemaVersion 1, orcamentoId, ocorreuEm ISO, detailType estático, payloads plausíveis conforme regra de negócio de `DecisaoRoteamento`), Domain puro sem framework/ORM/SDK e sem import cruzado de BC, teste unitário existente passa integralmente com 100% de cobertura estrutural no escopo da PR, lint limpo. Discrepância de título da issue #219 é cosmética (GitHub, não código) e já documentada tanto no PR quanto neste relatório — não bloqueia o gate.
