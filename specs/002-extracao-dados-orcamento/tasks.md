# Tasks: Extração de Dados do Orçamento (Agente Extrator)

**Input**: `specs/002-extracao-dados-orcamento/plan.md`, `spec.md` (versão 2, clarified)

**Tests**: incluídas — spec tem critérios de aceite testáveis explícitos e reforça invariante NON-NEGOTIABLE (Princípio IV: nunca inventar valor).

**Organização**: tarefas agrupadas por user story (prioridade P1–P3), rastreáveis ao `plan.md`. Cada task abaixo está pronta para virar issue técnica no GitHub (título = ID + descrição; critério de aceite = referência ao item correspondente do `spec.md`); vinculada à issue de negócio original do PM (feature `extracao-dados-orcamento`, depende de `ingestao-classificacao-orcamentos`).

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Criar estrutura de pastas `src/bounded-contexts/extracao/{domain,application,infrastructure,interface}` e `tests/bounded-contexts/extracao/{domain,application,contract}` conforme `plan.md` (monorepo já inicializado pela spec 001 — não repetir T001/T002/T003 daquela spec).
- [x] T002 [P] Migração Drizzle Kit: schema inicial do BC Extração (tabelas vazias, baseline) — ADR-001 herdado da spec 001. #67
- [x] T003 [P] Provisionar fila SQS `extrator-queue`, com DLQ própria + alarme CloudWatch (IaC — Ricardo/DevOps). #68
- [x] T004 [P] Provisionar regra EventBridge no bus `nexo-dominio-bus` roteando `detail-type: OrcamentoClassificado`, `source: nexo.ingestao-identificacao` → `extrator-queue`. #69

**Checkpoint**: estrutura pronta, filas e regra de roteamento provisionadas, CI verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [x] T005 Domain: implementar VOs `OrcamentoId`, `NivelConfianca` (redefinidos localmente neste BC, mesma validação da spec 001, sem import cruzado) em `src/bounded-contexts/extracao/domain/value-objects/`.
- [x] T006 Domain: implementar VO genérico `CampoExtraido<T>` — construtor MUST garantir `extraido === false ⟺ valor === null`. Critério de aceite: spec.md "NUNCA preenche o campo com um valor inventado/estimado" — unit test que tenta construir `CampoExtraido` com `extraido: true` e `valor: null` (ou vice-versa) e espera erro de domínio.
- [x] T007 [P] Domain: implementar VOs `Dinheiro`, `Quantidade`, `DescricaoProduto`, `PeriodoValidade` (nunca primitivos soltos).
- [x] T008 [P] Domain: implementar VOs `ItemOrcamento`, `CondicoesComerciais`, `ReferenciaClassificacao`, `ReferenciaS3` (redefinido localmente), `TentativaExtracao`.
- [x] T009 Domain: implementar agregado `ExtracaoOrcamento` (`extracao-orcamento.aggregate.ts`) com métodos `registrarTentativaExtrator` (1+ campo obrigatório sem confiança → transita direto para `PENDENTE_REVISAO_HUMANA`), `registrarConfirmacaoHumana`, invariante de campo obrigatório completo para transitar a `EXTRAIDO`, histórico append-only. Critério: unit test que tenta forçar transição para `EXTRAIDO` com campo obrigatório `extraido: false` e espera erro de domínio.
- [x] T010 [P] Domain: definir os 3 Domain Events (`orcamento-extraido`, `extracao-escalonada-revisao-humana`, `orcamento-extraido-pendencia-confirmada`) com `schemaVersion: 1`, `source: nexo.extracao`, conforme convenção do `plan.md`. `extracao-escalonada-revisao-humana` é publicado diretamente quando o Extrator não atinge confiança em 1+ campo obrigatório.
- [x] T011 [P] Domain: definir interfaces de repositório/gateway (`extracao-orcamento.repository.ts`, `agente-extrator.gateway.ts`, `leitura-bruta.gateway.ts`, `markitdown-conversao-extracao.acl.ts`) — sem implementação, apenas contratos TypeScript.
- [x] T012 Infrastructure: schema Drizzle das tabelas `extracoes_orcamento` (estado atual, `itens`/`condicoes_comerciais` JSONB — ADR-004) e `extracoes_orcamento_historico` (append-only, sem UPDATE/DELETE) + migração. #77
- [x] T013 Infrastructure: `DrizzleExtracaoOrcamentoRepository` implementando `ExtracaoOrcamentoRepository`, traduzindo linha↔agregado, nunca vazando tipo JSONB bruto para fora da Infra.
- [x] T014 [P] Infrastructure: `S3LeituraBrutaGateway` implementando `LeituraBrutaGateway` — read-only sobre `nexo-orcamentos-raw`, sem nenhuma permissão de escrita. #79
- [x] T015 Infrastructure: `EventBridgePublisher` implementando `EventPublisher` (instância própria deste BC, mesmo bus `nexo-dominio-bus`). #80
- [x] T016 Configurar logging estruturado (pino) + OpenTelemetry Node SDK para os handlers Lambda deste BC, correlação por `orcamentoId` (mesma trilha ponta a ponta da spec 001). #81

**Checkpoint**: Domain testável isoladamente (sem infra), repositório e publisher funcionais contra ambiente local (LocalStack).

---

## Phase 3: User Story 1 — Extração bem-sucedida (Priority: P1) 🎯 MVP

**Goal**: orçamento classificado tem itens, preços e condições comerciais extraídos e estruturados; evento `OrcamentoExtraido` publicado quando todos os campos obrigatórios têm confiança suficiente.

**Independent Test**: publicar `OrcamentoClassificado` de teste (payload com referência a documento bruto conhecido) e verificar que `OrcamentoExtraido` é publicado com itens/condições estruturados, sem intervenção manual — critério de aceite spec.md "resultado de extração disponível em até 5 minutos (p95)".

### Tests (US1)

- [x] T017 [P] [US1] Unit test do agregado `ExtracaoOrcamento.criar(referenciaClassificacao, referenciaBrutaS3)` + `registrarTentativaExtrator` com todos os campos obrigatórios completos → transita para `EXTRAIDO`. Já coberto por `tests/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.test.ts` (escrito junto de T009) — nenhum código novo necessário. #82
- [x] T018 [P] [US1] Unit test do `MarkItDownConversaoExtracaoACL` (mock de saída do MarkItDown) — sanitização de conteúdo antes de compor prompt (mitigação de prompt injection, mesmo padrão da spec 001). Implementação (Infrastructure) criada junto, réplica do padrão de `ingestao-identificacao` (nenhuma outra task do BC previa essa implementação). #83
- [x] T019 [P] [US1] Contract test `GET /v1/orcamentos/{orcamentoId}/extracao/status` em `tests/bounded-contexts/extracao/contract/`. #84
- [x] T020 [P] [US1] Integration test: `OrcamentoClassificado` publicado → `OrcamentoExtraido` publicado, payload com itens/condições estruturados, p95 medido em ambiente de teste local (LocalStack). #85

### Implementation (US1)

- [x] T021 [US1] Infrastructure: `BedrockExtratorGateway` + `BedrockExtracaoACL` (structured output/tool-use, nunca parsing de texto livre por regex). #86
- [x] T022 [US1] Application: caso de uso `ExtrairDadosOrcamento` (consome `OrcamentoClassificado`, converte via MarkItDown, invoca Extrator, aplica `registrarTentativaExtrator`, persiste, publica `OrcamentoExtraido` se todos os campos obrigatórios OK ou `ExtracaoEscalonadaParaRevisaoHumana` se 1+ campo sem confiança). #87
- [x] T023 [US1] Interface: handler Lambda consumidor SQS de `extrator-queue`, invocando `ExtrairDadosOrcamento`. Dependia de ADR-003 (spec 001, `referenciaBruta` no payload de `OrcamentoClassificado` — PR #483) para poder construir `referenciaBrutaS3`. #88
- [x] T024 [US1] Interface: controller `GET /v1/orcamentos/{orcamentoId}/extracao/status` (query, Zod schema de response, Problem Details para erro). Caso de uso `ConsultarStatusExtracao` criado junto (nenhuma outra task previa essa implementação, pré-requisito do controller). #89
- [x] T025 [US1] Interface: autenticação Cognito (JWT) no endpoint de status, mesmo esquema da spec 001. #90
- [x] T026 [US1] IAM: role dedicada `ExtratorLambdaRole` (least privilege: `bedrock:InvokeModel` restrito ao ARN do modelo aprovado, `s3:GetObject` restrito ao prefixo do bucket raw, sem `PutObject`/`DeleteObject`). #91

**Checkpoint**: US1 funcional e testável isoladamente — orçamento classificado com documento bem formado é extraído com sucesso, sem intervenção manual.

---

## Phase 4: User Story 2 — Campo obrigatório ausente ou de baixa confiança (Priority: P1) 🎯 MVP

**Goal**: campo obrigatório sem confiança suficiente nunca é inventado; escala diretamente para a fila de escalonamento humano própria deste BC (sem revisor de IA); estado visível na consulta de status.

**Independent Test**: publicar `OrcamentoClassificado` referenciando documento com campo ambíguo/ilegível conhecido e verificar que (a) nenhum valor inventado aparece no resultado, (b) `ExtracaoEscalonadaParaRevisaoHumana` é publicado, (c) status reflete a pendência — critério de aceite spec.md "Extrator NUNCA preenche o campo com um valor inventado/estimado".

### Tests (US2)

- [x] T027 [P] [US2] Unit test `ExtracaoOrcamento.registrarTentativaExtrator` com campo obrigatório de confiança insuficiente → transita direto para `PENDENTE_REVISAO_HUMANA`, nunca para `EXTRAIDO`, campo permanece `extraido: false`/`valor: null`. Já coberto por `tests/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.test.ts` (escrito junto de T009) — nenhum código novo necessário. #92
- [x] T029 [P] [US2] Integration test: campo ambíguo conhecido → `ExtracaoEscalonadaParaRevisaoHumana` publicado diretamente pelo Extrator (sem revisor de IA) → status reflete `PENDENTE_REVISAO_HUMANA`. #94

> **Nota (revisão)**: T028 (unit test do revisor de extração) e T030–T034 (implementação do `BedrockRevisorExtracaoGateway`, caso de uso `RevisarExtracaoComIA`, fila `revisor-extracao-queue`, regra EventBridge e role `RevisorExtracaoLambdaRole`) foram **removidos** — o Agente Revisor de Extração deixou de existir. O caminho de baixa confiança agora é publicado diretamente pelo `ExtrairDadosOrcamento` (T022) via `registrarTentativaExtrator` (T009). Os IDs T028 e T030–T034 não existem mais; os demais IDs foram mantidos estáveis para preservar a rastreabilidade das issues do GitHub.

**Checkpoint**: US2 funcional isoladamente — nenhum valor inventado aparece em nenhum cenário, pipeline nunca trava, exceção sempre visível e escalada direto ao humano.

---

## Phase 5: User Story 3 — Confirmação humana e preservação de vínculo (Priority: P2)

**Goal**: gestor/operador confirma manualmente campo pendente (valor real ou indisponibilidade definitiva) via endpoint próprio; resultado de extração preserva vínculo rastreável com bruto e classificação, sem sobrescrever nenhum dos dois.

**Independent Test**: orçamento em `PENDENTE_REVISAO_HUMANA` recebe confirmação via API — se valor real fornecido, status vira `EXTRAIDO` e `OrcamentoExtraido` é publicado; se indisponibilidade confirmada, status vira `EXTRAIDO_COM_PENDENCIA_CONFIRMADA` e `OrcamentoExtraidoComPendenciaConfirmada` é publicado; em ambos os casos, `referenciaBrutaS3` e `referenciaClassificacao` permanecem inalterados desde a criação — critério de aceite spec.md "nenhum dos dois é sobrescrito ou substituído".

### Tests (US3)

- [x] T035 [P] [US3] Unit test `ExtracaoOrcamento.registrarConfirmacaoHumana` — só válido a partir de `PENDENTE_REVISAO_HUMANA`; valor real → `EXTRAIDO`; indisponibilidade confirmada → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`; histórico nunca sobrescrito. Já coberto pela suíte existente em `tests/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.test.ts` (describe `ExtracaoOrcamento.registrarConfirmacaoHumana`, linhas 104-130) — nenhum teste novo necessário.
- [x] T036 [P] [US3] Unit test de imutabilidade: tentativa de sobrescrever `referenciaBrutaS3` ou `referenciaClassificacao` após criação lança `ReferenciaImutavelError`. Já coberto pela suíte existente em `tests/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.test.ts` (describe `ExtracaoOrcamento — imutabilidade de referências`, linhas 146-156) — nenhum teste novo necessário. #101
- [x] T037 [P] [US3] Contract test `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana` (aceito em `PENDENTE_REVISAO_HUMANA`; 409 Problem Details em qualquer outro status). #102

### Implementation (US3)

- [x] T038 [US3] Application: caso de uso `ConfirmarRevisaoHumanaExtracao` (valida status, aplica `registrarConfirmacaoHumana`, publica `OrcamentoExtraido` ou `OrcamentoExtraidoComPendenciaConfirmada`). #103
- [x] T039 [US3] Interface: controller `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana`, Zod schema (campos confirmados: valor real OU marcação explícita "indisponível"), Problem Details para 409. #104
- [x] T040 [US3] IAM: role dedicada `ConfirmarRevisaoHumanaExtracaoLambdaRole`, least privilege. #105

**Checkpoint**: todas as user stories funcionais e testáveis independentemente; nenhum dado bruto ou de classificação sobrescrito em nenhum fluxo.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T041 [P] Documentação OpenAPI gerada a partir dos schemas Zod dos 2 endpoints REST deste BC. #106
- [ ] T042 Medir p95 real end-to-end (classificação disponível → extração disponível) em ambiente de teste; decidir Provisioned Concurrency para `ExtratorLambdaRole` se meta de 5 minutos não for atingida (ver Constraints do `plan.md`).
- [ ] T043 [P] Monitorar tamanho de payload de `OrcamentoExtraido` contra limite de 256KB do EventBridge (risco registrado no `plan.md`) — alarme se aproximar do limite. #108

### Alarme CloudWatch de T043 pendente de stack IaC (gap de Infrastructure — achado 2026-08-03)

`EventBridgePublisher` (T043/#108, código mergeável) já mede `Buffer.byteLength` do `Detail` de todo evento publicado e loga `logger.warn` estruturado quando >= 80% do limite de 256KB do EventBridge. Isso cobre a detecção em tempo de execução, mas **não é o alarme CloudWatch real** que o texto da task pede — falta a stack CDK do Lambda Function consumidor de `extrator-queue` (log group) à qual um `MetricFilter`/`Alarm` precisaria se anexar; essa stack de Lambda Function ainda não existe no repositório (mesma lacuna de IaC do gap T046 abaixo, achado no mesmo dia).

- [ ] T043a Infrastructure: quando a stack CDK do Lambda Function consumidor de `extrator-queue` existir, adicionar `logs.MetricFilter` sobre o log group desse Lambda casando a mensagem de warn de `EventBridgePublisher` ("Payload de domain event próximo do limite de 262144B do EventBridge") + `cloudwatch.Alarm` (mesmo padrão de `ExtratorQueueDlqAlarm` em `infra/lib/extrator-queue-stack.ts`) — sem essa stack, o `MetricFilter` não tem log group real para se anexar.

- [ ] T044 Security review: `npm audit`/`pnpm audit`, Semgrep, revisão de prompt injection no prompt do Extrator (mesmo checklist da spec 001).
- [ ] T045 [P] Métrica de observabilidade: taxa de campos marcados "não extraído" e taxa de uso de serviço pago como exceção (MarkItDown vs. exceção) — conforme "Métricas de Avaliação Contínua" do spec.md.

### Conversão de documento: Lambda MarkItDown deste BC (gap de Infrastructure — achado 2026-08-03)

`MarkItDownConversaoExtracaoACL` (T018, mergeado) invoca via `lambda:Invoke` um Lambda Python dedicado que **não existe** — nem código, nem stack IaC, nem task até este bloco. Mesmo gap identificado na spec 001 (T066/T067 de lá); aqui é instância própria por exigência do **ADR-002** desta spec ("MarkItDown roda em instância própria por Bounded Context, não como serviço de conversão compartilhado"). Consequência: `ExtrairDadosOrcamento` não converte documento nenhum em runtime.

- [ ] T046 Infrastructure: implementar o Lambda Python dedicado ao MarkItDown **deste** BC — função separada da spec 001 (ADR-002), nunca reaproveitar a função da Ingestão. **Contrato já fixado pelo lado mergeado** (`src/bounded-contexts/extracao/infrastructure/markitdown-conversao-extracao.acl.ts`): request `{conteudoBase64, nomeArquivo}`, response `{texto}` — idêntico ao da 001, o ACL é o lado existente, não alterar. Entregar: (a) handler Python + empacotamento (Lambda Layer ou container); (b) stack CDK em `infra/lib/`; (c) role IAM dedicada least-privilege — **somente logs**, não lê S3 nem publica Domain Event, portanto NÃO recebe `events:PutEvents` (ADR-004 da spec 001, critério (b)); (d) timeout e memória dimensionados para a conversão **completa/estruturável** desta spec, maiores que a conversão leve da 001 (`plan.md` Constraints: "parsing de documento potencialmente maior/mais complexo que o uso leve da spec 001"); (e) nome da função exposto ao consumidor como parâmetro/variável de ambiente (o ACL recebe `functionName` por construtor). O pacote/layer Python **pode** ser compartilhado com a spec 001 — ADR-002 exige instâncias de Lambda separadas (isolamento de falha e dimensionamento independente), não pacotes duplicados. Bloqueia US1/US2 em produção para qualquer formato binário. Ferramental de execução local: reusar spec 001 T067 (LocalStack Lambda), sem segunda implementação de ACL.

---

### Hosting HTTP em produção (gap de Infrastructure — issue #753, ADR-017)

Achado durante a análise da #753: as 2 rotas HTTP deste BC (`revisão humana`, `consultar-status`) também não têm caminho de produção — mesmo gap da spec 001/T068, resolvido pela mesma decisão. Antecipa o muro que #614/#615 bateriam.

- [ ] T047 Infrastructure: hosting HTTP de produção das 2 rotas deste BC — ADR-017 (`docs/architecture-diagrams/adr-017-hosting-http-producao.html`). Um `*.production.ts` por rota (Fastify mínimo com só `registrarRotaRevisaoHumanaExtracao`/`registrarRotaStatusExtracao` já existentes + `opts.preHandler = criarTenantContextMiddleware(...)` real + `app.inject(...)`, helper transversal — ver Relatório do arquiteto, não recriar). 1 `NodejsFunction` por rota: `revisão humana` liga à role já existente (`ConfirmarRevisaoHumanaExtracaoLambdaRoleStack`); `consultar-status` exige role nova, somente leitura (mesmo padrão de `ConsultaStatusLambdaRoleStack` da spec 001 — sem `events:PutEvents`/S3/Bedrock). Ambas mapeadas na stack única de API Gateway HTTP API (transversal, `infra/lib/http-api-stack.ts`). **Faz parte desta task**: apagar `src/bounded-contexts/extracao/interface/http/auth-cognito.middleware.ts` e o teste correspondente (não sustenta `request.tenantContext`/`request.papeis`, não é consumido por nenhuma composição real).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depende apenas da infraestrutura já provisionada pela spec 001 (bucket raw, bus `nexo-dominio-bus`) — pode iniciar em paralelo à spec 001 desde que o contrato do evento `OrcamentoClassificado` esteja fechado (ver risco remanescente do `plan.md`).
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories.
- **User Stories (Phase 3+)**: todas dependem de Foundational.
  - US1 (extração bem-sucedida) é o caminho feliz mínimo — MVP.
  - US2 (campo não extraído) depende dos mesmos fundamentos de US1, mas é independentemente testável (documento com campo ambíguo conhecido).
  - US3 (confirmação humana) depende do agregado poder chegar a `PENDENTE_REVISAO_HUMANA` (produzido por US2), mas seu próprio código (endpoint, caso de uso) é implementável em paralelo a partir de Foundational.
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: nenhuma dependência de outra story.
- **US2 (P1)**: nenhuma dependência de código de US1, mas compartilha o mesmo caso de uso `ExtrairDadosOrcamento` (T022) como ponto de entrada — implementar T022 cobrindo ambos os desfechos (sucesso e baixa confiança) antes de considerar US1 "completa" isoladamente é aceitável, mas o teste de US2 só é executável após T009 (agregado) e T022 existirem.
- **US3 (P2)**: requer que o agregado alcance `PENDENTE_REVISAO_HUMANA` (produzido pelo fluxo de US2) para ser testado ponta a ponta, mas os artefatos de código (T038–T040) são implementáveis em paralelo a US2.

### Parallel Opportunities

- Todos os T00X marcados [P] na mesma fase podem rodar em paralelo (arquivos distintos, sem dependência).
- VOs (T005–T008) em paralelo entre si; agregado (T009) depende de todos os VOs.
- O gateway de Infrastructure do Extrator (T021) pode ser implementado assim que Foundational estiver completo.
- T046 (Lambda MarkItDown deste BC) em paralelo com spec 001 T066 — funções e stacks distintas (ADR-002); a única sobreposição possível é o pacote/layer Python compartilhado, que se for extraído deve ser mergeado uma vez antes das duas stacks o referenciarem.

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (bloqueia tudo).
3. Completar Phase 3 (US1) + Phase 4 (US2) — ambas P1, formam o MVP real: "extração nunca falha silenciosamente".
4. **PARAR e VALIDAR**: rodar cenário de documento bem formado (US1) e cenário de documento ambíguo (US2) antes de avançar.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar isoladamente → demo (caminho feliz).
3. US2 → testar isoladamente → demo (nunca inventa valor, sempre escalona).
4. US3 → testar isoladamente → demo (fecha o loop humano sem sobrescrever histórico).
5. Polish → métricas, performance, segurança.
