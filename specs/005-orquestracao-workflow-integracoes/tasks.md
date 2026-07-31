# Tasks: Orquestração de Workflow e Integrações (Agente Orquestrador)

**Input**: `specs/005-orquestracao-workflow-integracoes/plan.md`, `spec.md` (versão 3, clarified)

**Nota de ferramenta**: geração manual (sem `.specify/scripts/powershell/setup-tasks.ps1` — sessão do agente arquiteto sem Bash/shell), seguindo a mesma estrutura de fases/formato já materializada em `specs/001-.../tasks.md`, `specs/002-.../tasks.md` e `specs/003-.../tasks.md`.

**Tests**: incluídas — spec tem critérios de aceite testáveis explícitos e reforça a invariante NON-NEGOTIABLE de maior risco financeiro do produto (Princípio IV: nenhuma aprovação sem confiança suficiente reportada com base auditável, nunca autoaprovação por exaustão/tempo/volume).

**Organização**: tarefas agrupadas por user story (prioridade P1–P2, derivadas das seções "Comportamento esperado" e "Critérios de aceite" do `spec.md`, que não usa rótulos US explícitos — mesma inferência já aplicada na spec 003), rastreáveis ao `plan.md`. Cada task abaixo está pronta para virar issue técnica no GitHub (título = ID + descrição; critério de aceite = referência ao item correspondente do `spec.md`); vinculada à issue de negócio original do PM (feature `orquestracao-workflow-integracoes`, depende de `validacao-consistencia-orcamentos`, `extracao-dados-orcamento` e `ingestao-classificacao-orcamentos`).

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Criar estrutura de pastas `src/bounded-contexts/orquestracao/{domain,application,infrastructure,interface}` e `tests/bounded-contexts/orquestracao/{domain,application,contract}` conforme `plan.md` (monorepo já inicializado pelas specs 001–003 — não repetir setup daquelas specs).
- [ ] T002 [P] Migração Drizzle Kit: schema inicial do BC Orquestração (tabelas vazias, baseline) — ADR-001 da spec 001, herdado.
- [x] T003 [P] Provisionar 3 filas SQS (`contexto-classificacao-queue`, `contexto-extracao-queue`, `decisao-workflow-queue`), cada uma com DLQ própria + alarme CloudWatch em mensagem na DLQ (IaC — Ricardo/DevOps).
- [x] T004 [P] Provisionar regra EventBridge no bus `nexo-dominio-bus` roteando `detail-type: OrcamentoClassificado`, `source: nexo.ingestao-identificacao` → `contexto-classificacao-queue`.
- [x] T005 [P] Provisionar regra EventBridge roteando `detail-type: OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`, `source: nexo.extracao` → `contexto-extracao-queue`.
- [x] T006 [P] Provisionar regra EventBridge roteando `detail-type: OrcamentoValidado`/`OrcamentoValidadoComRessalva`, `source: nexo.validacao` → `decisao-workflow-queue`.

> **Nota (revisão)**: T007 (regra EventBridge `DecisaoWorkflowBaixaConfiancaDetectada` → `revisor-workflow-queue`) foi **removida** — o Agente Revisor de Workflow deixou de existir. A fila `revisor-workflow-queue` também foi removida (T003). O ID T007 não existe mais; os demais IDs foram mantidos estáveis para preservar a rastreabilidade das issues do GitHub.

**Checkpoint**: estrutura pronta, 3 filas e 3 regras de roteamento provisionadas, CI verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [x] T008 Domain: implementar VOs `OrcamentoId`, `NivelConfianca` (redefinidos localmente neste BC, mesma validação das specs 001–003, sem import cruzado) em `src/bounded-contexts/orquestracao/domain/value-objects/`.
- [ ] T009 [P] Domain: implementar VOs `ContextoClassificacao`, `ContextoExtracao`, `ContextoValidacao` (cópias imutáveis traduzidas dos payloads upstream, ver `plan.md` seção Domain).
- [x] T010 Domain: implementar VO `DecisaoRoteamento` com as invariantes estruturais críticas — construtor rejeita: `acao === 'APROVAR'` sem `contextoValidacao.resultado` em `VALIDADO`/`VALIDADO_COM_RESSALVA`; `acao === 'SOLICITAR_REENVIO'` sem `motivoDadoAusente` não vazio referenciando inconsistência/pendência concreta; qualquer decisão automática (`agenteOrigem !== 'HUMANO'`) sem `criterio` não vazio. Critério de aceite: unit test para cada uma das 3 rejeições, mapeando diretamente as "Ações proibidas" e critérios de aceite do `spec.md`.
- [ ] T011 [P] Domain: implementar VO `TentativaDecisaoWorkflow` (histórico imutável).
- [ ] T012 Domain: implementar agregado `DecisaoWorkflow` (`decisao-workflow.aggregate.ts`) com `registrarContextoClassificacao/Extracao/Validacao` (idempotentes, lançam `ContextoImutavelError` em reentrega divergente), `consolidarContexto()` (lança `ContextoIncompletoError` se algum dos 3 contextos ausente), `registrarTentativaOrquestrador` (confiança insuficiente → transita direto para `PENDENTE_REVISAO_HUMANA`), `registrarDecisaoHumana`, histórico append-only. Critério: unit test que tenta consolidar/decidir com contexto incompleto e espera `ContextoIncompletoError`, nunca uma decisão parcial.
- [ ] T013 [P] Domain: definir os 5 Domain Events (`orcamento-aprovado-para-processamento`, `orcamento-encaminhado-para-comprador`, `orcamento-reenvio-solicitado`, `integracao-externa-solicitada`, `decisao-workflow-escalonada-para-comprador`) com `schemaVersion: 1`, `source: nexo.orquestracao`, conforme convenção do `plan.md`. `decisao-workflow-escalonada-para-comprador` é publicado diretamente quando o Orquestrador não atinge confiança suficiente.
- [ ] T014 [P] Domain: definir interfaces de repositório/gateway (`decisao-workflow.repository.ts`, `agente-orquestrador.gateway.ts`, `orcamento-classificado-event.acl.ts`, `orcamento-extraido-event.acl.ts`, `orcamento-validado-event.acl.ts`) — sem implementação, apenas contratos TypeScript.
- [ ] T015 Infrastructure: schema Drizzle das tabelas `decisoes_workflow` (estado atual, contextos/decisão em colunas JSONB) e `decisoes_workflow_historico` (append-only, sem UPDATE/DELETE) + migração.
- [ ] T016 Infrastructure: `DrizzleDecisaoWorkflowRepository` implementando `DecisaoWorkflowRepository`, traduzindo linha↔agregado.
- [ ] T017 [P] Infrastructure: `OrcamentoClassificadoEventACL`, `OrcamentoExtraidoEventACL`, `OrcamentoValidadoEventACL` traduzindo os 3 payloads de evento upstream — nunca importam tipos de domínio dos BCs de origem.
- [ ] T018 Infrastructure: `EventBridgePublisher` implementando `EventPublisher` (instância própria deste BC, mesmo bus `nexo-dominio-bus`).
- [ ] T019 Configurar logging estruturado (pino) + OpenTelemetry Node SDK para os handlers Lambda deste BC, correlação por `orcamentoId` (mesma trilha ponta a ponta das specs 001–003).

**Checkpoint**: Domain testável isoladamente (sem infra, sem IA), repositório e publisher funcionais contra ambiente local (LocalStack).

---

## Phase 3: User Story 1 — Decisão automática com confiança suficiente (Priority: P1) 🎯 MVP

**Goal**: orçamento validado, com contexto de classificação/extração/validação já consolidado, recebe uma decisão final (aprovar/encaminhar/reenvio) do Agente Orquestrador em até 5 minutos (p95), sem intervenção manual, nunca aprovando sem validação bem-sucedida.

**Independent Test**: publicar, na ordem causal real (`OrcamentoClassificado` → `OrcamentoExtraido` → `OrcamentoValidado`), os três eventos de teste para o mesmo `orcamentoId`; verificar que `OrcamentoAprovadoParaProcessamento` (ou outro desfecho, conforme cenário) é publicado com `agenteOrigem: 'ORQUESTRADOR'`, `criterio` não vazio e `nivelConfianca` presente — critério de aceite spec.md "todo orçamento validado recebe uma decisão final de workflow... produzida por Orquestrador... nunca ficando parado sem decisão".

### Tests (US1)

- [ ] T020 [P] [US1] Unit test `DecisaoWorkflow.registrarContextoClassificacao/Extracao/Validacao` + `consolidarContexto()` com os 3 contextos presentes → transita para `CONTEXTO_CONSOLIDADO`.
- [ ] T021 [P] [US1] Unit test `DecisaoWorkflow.registrarTentativaOrquestrador` com confiança suficiente e `contextoValidacao.resultado === 'VALIDADO'` → transita para `DECIDIDO`, publica o desfecho correspondente à `acao` reportada pelo agente.
- [ ] T022 [P] [US1] Unit test da invariante "nunca aprovar sem validação bem-sucedida" (T010) especificamente no fluxo de `registrarTentativaOrquestrador` — tentar `acao: 'APROVAR'` com `contextoValidacao` ausente/reprovado lança `AprovacaoSemValidacaoError`.
- [ ] T023 [P] [US1] Contract test `GET /v1/orcamentos/{orcamentoId}/workflow/status` em `tests/bounded-contexts/orquestracao/contract/`.
- [ ] T024 [P] [US1] Integration test: sequência completa dos 3 eventos upstream (ordem causal correta) → `ConsolidarEDecidirWorkflow` decide com confiança suficiente → evento de desfecho publicado, p95 medido em ambiente de teste local (LocalStack).

### Implementation (US1)

- [ ] T025 [US1] Infrastructure: `BedrockOrquestradorGateway` + `BedrockDecisaoWorkflowACL` (structured output/tool-use exigindo `acao`, `nivelConfianca`, `criterio` não vazio, `requerIntegracaoExterna`; rejeita resposta sem `criterio` — mitigação estrutural contra confiança artificial, ver Segurança do `plan.md`).
- [ ] T026 [US1] Application: caso de uso `RegistrarContextoClassificacao` (consome `OrcamentoClassificado`, traduz via ACL, cria/atualiza agregado, persiste — nunca decide).
- [ ] T027 [US1] Application: caso de uso `RegistrarContextoExtracao` (mesmo padrão, consome `OrcamentoExtraido`/`ComPendenciaConfirmada`).
- [ ] T028 [US1] Application: caso de uso `ConsolidarEDecidirWorkflow` (consome `OrcamentoValidado`/`ComRessalva`, traduz via ACL, tenta `consolidarContexto()`; se sucesso, invoca `AgenteOrquestradorGateway`, aplica `registrarTentativaOrquestrador`, persiste, publica evento de desfecho) — caminho feliz de confiança suficiente.
- [ ] T029 [US1] Interface: handlers Lambda consumidores de `contexto-classificacao-queue`, `contexto-extracao-queue` e `decisao-workflow-queue`, invocando os 3 casos de uso acima.
- [ ] T030 [US1] Interface: controller `GET /v1/orcamentos/{orcamentoId}/workflow/status` (query, Zod schema de response, Problem Details para erro).
- [ ] T031 [US1] Interface: autenticação Cognito (JWT) no endpoint de status, mesmo esquema das specs 001–003.
- [ ] T032 [US1] IAM: roles dedicadas `RegistrarContextoClassificacaoLambdaRole`, `RegistrarContextoExtracaoLambdaRole`, `ConsolidarEDecidirWorkflowLambdaRole` (least privilege: `bedrock:InvokeModel` restrito ao ARN do modelo aprovado apenas na última, sem qualquer permissão sobre `nexo-orcamentos-raw` ou tabelas de outros BCs), `ConsultaStatusDecisaoWorkflowLambdaRole`.

**Checkpoint**: US1 funcional e testável isoladamente — orçamento com contexto completo e confiança suficiente recebe decisão automática, nunca aprovando sem validação bem-sucedida.

---

## Phase 4: User Story 2 — Governança de baixa confiança: escalonamento humano ao comprador (Priority: P1) 🎯 MVP

**Goal**: quando o Orquestrador não atinge confiança suficiente, o orçamento vai diretamente para a fila de escalonamento assíncrona do comprador (sem agente revisor de IA) — nunca há aprovação automática por exaustão/tempo/volume, e a decisão humana explícita (qualquer uma das 3 ações) é registrada com o mesmo peso de uma decisão automática.

**Independent Test**: publicar cenário de contexto consolidado com resultado de baixa confiança simulado no `AgenteOrquestradorGateway` (mock); verificar que (a) `DecisaoWorkflowEscalonadaParaComprador` é publicado diretamente, (b) o agregado permanece em `PENDENTE_REVISAO_HUMANA` indefinidamente até decisão humana via API — critério de aceite spec.md "nenhum orçamento é aprovado automaticamente sem que o Orquestrador tenha reportado confiança suficiente" e "só avança mediante confirmação explícita do comprador... nunca por tempo de espera, volume da fila, ou exaustão de tentativas".

### Tests (US2)

- [ ] T033 [P] [US2] Unit test `DecisaoWorkflow.registrarTentativaOrquestrador` com confiança insuficiente → transita direto para `PENDENTE_REVISAO_HUMANA` (publica `DecisaoWorkflowEscalonadaParaComprador`), nunca para `DECIDIDO`.
- [ ] T035 [P] [US2] Unit test `DecisaoWorkflow.registrarDecisaoHumana` — só válido a partir de `PENDENTE_REVISAO_HUMANA`; aceita qualquer uma das 3 ações sem exigir `nivelConfianca`, mas exige `criterio`/justificativa não vazia; histórico nunca sobrescrito, apenas anexado.

> **Nota (revisão)**: T034 (unit test de `registrarTentativaRevisor`) foi **removido** — o Agente Revisor de Workflow deixou de existir. O ID T034 não existe mais.
- [ ] T036 [P] [US2] Unit test explícito: nenhuma transição do agregado permite `acao: 'APROVAR'` publicado automaticamente sem `nivelConfianca` presente e suficiente (agente) ou sem decisão humana explícita — teste negativo cobrindo "nunca autoaprova por exaustão/tempo/volume" (não há nenhum caminho de código que decida por timeout).
- [ ] T037 [P] [US2] Contract test `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana` (aceito em `PENDENTE_REVISAO_HUMANA`; 409 Problem Details em qualquer outro status).
- [ ] T038 [P] [US2] Integration test: contexto consolidado com baixa confiança simulada no Orquestrador → `DecisaoWorkflowEscalonadaParaComprador` publicado diretamente (sem revisor de IA) → decisão humana via API → evento de desfecho correspondente publicado com `agenteOrigem: 'HUMANO'`; status reflete `PENDENTE_REVISAO_HUMANA` durante a espera, sem bloquear outros orçamentos.

### Implementation (US2)

- [ ] T040 [US2] Application: completar `ConsolidarEDecidirWorkflow` (T028) para o caminho de baixa confiança — transitar o agregado para `PENDENTE_REVISAO_HUMANA` e publicar `DecisaoWorkflowEscalonadaParaComprador` diretamente quando o Orquestrador não atinge confiança suficiente.
- [ ] T042 [US2] Application: caso de uso `RegistrarDecisaoHumanaWorkflow` (valida status `PENDENTE_REVISAO_HUMANA`, aplica `registrarDecisaoHumana`, publica evento de desfecho com `agenteOrigem: 'HUMANO'`).
- [ ] T044 [US2] Interface: controller `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana`, Zod schema (`acao`, `justificativa` obrigatória, `motivoDadoAusente` obrigatório quando `acao === 'SOLICITAR_REENVIO'`), papel "comprador responsável" via Cognito, Problem Details para 409.
- [ ] T045 [US2] IAM: role dedicada `RegistrarDecisaoHumanaWorkflowLambdaRole`, least privilege.

> **Nota (revisão)**: T039 (`BedrockRevisorWorkflowGateway`), T041 (caso de uso `RevisarDecisaoWorkflowComIA`) e T043 (handler consumidor de `revisor-workflow-queue`) foram **removidos** — o Agente Revisor de Workflow deixou de existir. O caminho de baixa confiança agora é publicado diretamente pelo `ConsolidarEDecidirWorkflow` (T040). Os IDs T039, T041 e T043 não existem mais; os demais foram mantidos estáveis para preservar a rastreabilidade das issues do GitHub.

**Checkpoint**: US2 funcional isoladamente — nenhuma decisão de aprovação é tomada sem confiança suficiente reportada ou decisão humana explícita, em nenhum cenário; pipeline nunca trava; fila de escalonamento nunca autoaprova.

---

## Phase 5: User Story 3 — Reenvio ao fornecedor com fundamento obrigatório e integração externa desacoplada (Priority: P2)

**Goal**: uma decisão de "solicitar reenvio" nunca é tomada sem referência concreta a um dado essencial ausente já apontado por Validação/Extração; decisões que exigem comunicação com sistema externo publicam `IntegracaoExternaSolicitada` desacoplado, sem que o decisor conheça o contrato do sistema parceiro.

**Independent Test**: (a) publicar contexto consolidado onde `contextoValidacao`/`contextoExtracao` não apontam nenhum dado ausente e forçar o agente (mock) a tentar `acao: 'SOLICITAR_REENVIO'` sem `motivoDadoAusente` → domínio rejeita com `ReenvioSemFundamentoError`, nenhum evento de reenvio publicado; (b) publicar cenário com `requerIntegracaoExterna: true` reportado pelo agente → `IntegracaoExternaSolicitada` publicado junto do evento de desfecho, com payload sem nenhum detalhe de protocolo do sistema parceiro — critérios de aceite spec.md "uma decisão de solicitar reenvio nunca é tomada sem que a validação tenha apontado ausência de dado essencial específico" e "publica um evento de integração desacoplado, sem quem decidiu precisar conhecer o contrato do sistema parceiro".

### Tests (US3)

- [ ] T046 [P] [US3] Unit test `DecisaoRoteamento` (T010) — construtor rejeita `acao: 'SOLICITAR_REENVIO'` sem `motivoDadoAusente` não vazio; aceita quando referencia uma inconsistência/pendência concreta presente no `contextoValidacao`/`contextoExtracao`.
- [ ] T047 [P] [US3] Unit test: publicação de `IntegracaoExternaSolicitada` ocorre se e somente se `requerIntegracaoExterna === true` na decisão registrada, com payload restrito a `orcamentoId`/`acaoOrigem`/`ocorreuEm` (nenhum campo de protocolo específico).
- [ ] T048 [P] [US3] Integration test: cenário de reenvio válido (fundamento presente) → `OrcamentoReenvioSolicitado` publicado com `motivoDadoAusente`; cenário de reenvio sem fundamento → nenhum evento de reenvio publicado, tentativa registrada no histórico como falha de invariante.

### Implementation (US3)

- [ ] T049 [US3] Application: estender `ConsolidarEDecidirWorkflow` e `RegistrarDecisaoHumanaWorkflow` para publicar `IntegracaoExternaSolicitada` em conjunto com o evento de desfecho quando `requerIntegracaoExterna === true` (ADR-003 do `plan.md`).
- [ ] T050 [US3] Domain: garantir que `ReenvioSemFundamentoError` inclui referência legível ao que faltou validar/preencher (nunca mensagem genérica) — mesma disciplina de `InconsistenciaDetectada.detalhe` da spec 003.

**Checkpoint**: todas as user stories funcionais e testáveis independentemente; reenvio sempre fundamentado; integração externa sempre desacoplada de protocolo específico.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T051 [P] Documentação OpenAPI gerada a partir dos schemas Zod dos 2 endpoints REST deste BC (status, decisão humana).
- [ ] T052 Medir p95 real end-to-end (validação disponível → decisão de workflow publicada) em ambiente de teste; decidir se `AgenteOrquestradorGateway` exige Provisioned Concurrency, dado ser a decisão de maior risco financeiro da cadeia (ver Constraints do `plan.md`).
- [ ] T053 Security review: `npm audit`/`pnpm audit`, Semgrep, revisão de prompt injection no prompt do Orquestrador (texto de itens vindo do `contextoExtracao` é entrada não confiável, mesma disciplina de bloco delimitado das specs 001–003), revisão específica de que nenhuma resposta do Bedrock sem `criterio` não vazio é aceita pela ACL.
- [ ] T054 [P] Métrica de observabilidade: "distribuição das 3 decisões por camada decisora (Orquestrador / comprador)", "percentual de decisões escalonadas ao comprador por baixa confiança", "taxa e idade da fila de escalonamento", conforme "Métricas de Avaliação Contínua" do spec.md.
- [ ] T055 Coordenar com owner do futuro BC Acompanhamento o cálculo da métrica "taxa de decisão de aprovação automática revertida posteriormente por um comprador" — métrica de maior criticidade de negócio da spec, dependente de dado cross-BC (decisão automática × reversão humana futura), fora do escopo de implementação deste BC (ver Riscos remanescentes do `plan.md`).
- [ ] T056 Coordenar com owners das specs 002/003 a garantia de que o payload de `OrcamentoExtraido`/`OrcamentoValidado` contém dado suficiente para montar `ContextoExtracao`/`ContextoValidacao` sem reabertura de contrato — dependência registrada como risco remanescente no `plan.md` (ADR-001).
- [ ] T057 Runbook operacional para a DLQ de `decisao-workflow-queue`: mensagem na DLQ dessa fila específica significa "contexto nunca se consolidou" (ver ADR-001) — procedimento de investigação (verificar se `OrcamentoClassificado`/`OrcamentoExtraido` foram de fato publicados para o `orcamentoId`) distinto do runbook genérico de DLQ das specs 001–003.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depende da infraestrutura já provisionada pelas specs 001–003 (bus `nexo-dominio-bus`, eventos `OrcamentoClassificado`/`OrcamentoExtraido`/`OrcamentoValidado` já publicados) — pode iniciar em paralelo a ajustes finais dessas specs, desde que os contratos de evento estejam fechados (ver riscos remanescentes do `plan.md`).
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories.
- **User Stories (Phase 3+)**: todas dependem de Foundational.
  - US1 (decisão automática com confiança suficiente) é o caminho feliz mínimo — MVP.
  - US2 (governança de baixa confiança) depende dos mesmos fundamentos de US1 e compartilha o caso de uso `ConsolidarEDecidirWorkflow` (T028/T040) como ponto de entrada — implementar T028 cobrindo ambos os desfechos (confiança suficiente e insuficiente) antes de considerar US1 "completa" isoladamente é aceitável, mas o teste de US2 só é executável após T012 (agregado) e T028 existirem. US2 é P1 junto com US1 porque a governança de baixa confiança é NON-NEGOTIABLE (Princípio IV) — não há MVP sem ela.
  - US3 (reenvio fundamentado + integração externa) é incremento sobre a decisão já existente em US1/US2 — testável isoladamente, mas depende de T010 (VO `DecisaoRoteamento`) já existir desde Foundational.
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: nenhuma dependência de outra story.
- **US2 (P1)**: nenhuma dependência de código de US1, mas compartilha o caso de uso `ConsolidarEDecidirWorkflow` (T028) como ponto de entrada — mesmo padrão de compartilhamento já usado entre US1/US2 da spec 003.
- **US3 (P2)**: requer T010/T028 (US1) como ponto de integração das regras de fundamento/integração, mas a validação estrutural em si (T010) já está em Foundational — os testes de US3 podem ser escritos e passar assim que Foundational estiver completo, mesmo antes de US1/US2 estarem "prontas" para produção.

### Parallel Opportunities

- Todos os T0XX marcados [P] na mesma fase podem rodar em paralelo (arquivos distintos, sem dependência).
- VOs (T008–T011) em paralelo entre si; agregado (T012) depende de todos os VOs, especialmente T010.
- Os 3 ACLs de evento upstream (T017) são implementáveis em paralelo entre si (arquivos distintos, sem dependência mútua).
- O gateway Bedrock do Orquestrador (T025) pode ser implementado assim que Foundational estiver completo.

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (bloqueia tudo).
3. Completar Phase 3 (US1) + Phase 4 (US2) — ambas P1, formam o MVP real: "toda decisão de workflow é tomada com confiança suficiente reportada, humana explícita, ou fica visivelmente pendente — nunca autoaprovada por exaustão".
4. **PARAR e VALIDAR**: rodar cenário de confiança suficiente (US1) e cenário de baixa confiança em cascata até escalonamento humano (US2) antes de avançar.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar isoladamente → demo (caminho feliz de decisão automática).
3. US2 → testar isoladamente → demo (nunca autoaprova sem confiança, escalonamento sempre disponível como retaguarda).
4. US3 → testar isoladamente → demo (reenvio sempre fundamentado, integração externa sempre desacoplada).
5. Polish → métricas, performance, segurança, coordenação de dependências com specs 002/003 e com o futuro BC Acompanhamento.
