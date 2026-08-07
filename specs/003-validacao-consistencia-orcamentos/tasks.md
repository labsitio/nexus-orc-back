# Tasks: Validação de Consistência de Orçamentos (Agente Validador)

**Input**: `specs/003-validacao-consistencia-orcamentos/plan.md`, `spec.md` (versão 1, clarified)

**Tests**: incluídas — spec tem critérios de aceite testáveis explícitos e reforça invariante NON-NEGOTIABLE (Princípio IV: inconsistência nunca é silenciosa/autoaprovada).

**Organização**: tarefas agrupadas por user story (prioridade P1–P2), rastreáveis ao `plan.md`. Cada task abaixo está pronta para virar issue técnica no GitHub (título = ID + descrição; critério de aceite = referência ao item correspondente do `spec.md`); vinculada à issue de negócio original do PM (feature `validacao-consistencia-orcamentos`, depende de `extracao-dados-orcamento`).

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Criar estrutura de pastas `src/bounded-contexts/validacao/{domain,application,infrastructure,interface}` e `tests/bounded-contexts/validacao/{domain,application,contract}` conforme `plan.md` (monorepo já inicializado pelas specs 001/002 — não repetir setup daquelas specs).
- [x] T002 [P] Migração Drizzle Kit: schema inicial do BC Validação (tabelas vazias, baseline) — ADR-001 da spec 001, herdado.
- [x] T003 [P] Provisionar fila SQS `validador-queue` com DLQ própria + alarme CloudWatch (IaC — Ricardo/DevOps). Sem fila de revisor de IA, por decisão de ADR-001 desta spec. #113
- [x] T004 [P] Provisionar regra EventBridge no bus `nexo-dominio-bus` roteando `detail-type: OrcamentoExtraido` e `detail-type: OrcamentoExtraidoComPendenciaConfirmada`, `source: nexo.extracao` → `validador-queue`. #114

**Checkpoint**: estrutura pronta, fila e regra de roteamento provisionadas, CI verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [x] T005 Domain: implementar VOs `OrcamentoId`, `Dinheiro`, `PeriodoValidade` (redefinidos localmente neste BC, mesma validação das specs 001/002, sem import cruzado) em `src/bounded-contexts/validacao/domain/value-objects/`.
- [x] T006 Domain: implementar VO `CNPJ` — valida formato (14 dígitos) e dígito verificador (algoritmo determinístico, sem chamada externa); lança erro de domínio se inválido. Critério de aceite: unit test com CNPJ de dígito verificador incorreto → erro de domínio, nunca aceito silenciosamente.
- [x] T007 [P] Domain: implementar VOs `FaixaPreco`, `CategoriaItem`, `InconsistenciaDetectada` (com campo `regra` enumerado e `detalhe` legível — critério de aceite spec.md "identifica especificamente qual regra falhou").
- [x] T008 [P] Domain: implementar VOs `DadosExtraidosParaValidacao`, `ItemParaValidacao` (preserva `extraido: boolean` do item de origem), `TentativaValidacao`.
- [x] T009 Domain: implementar agregado `OrcamentoValidacao` (`orcamento-validacao.aggregate.ts`) com métodos `avaliarRegrasDeConsistencia`, `registrarDecisaoHumana`, invariante "só transita para VALIDADO com todas as regras passando na mesma tentativa", histórico append-only. Critério: unit test que tenta forçar transição para `VALIDADO` com 1+ inconsistência pendente e espera erro de domínio.
- [x] T010 [P] Domain: implementar as 4 regras determinísticas de consistência como funções puras do Domain — CNPJ válido, campos obrigatórios preenchidos, preço dentro de faixa por categoria, coerência de prazo de validade — cada uma testável isoladamente sem mock de IA ou rede.
- [x] T011 [P] Domain: definir os 3 Domain Events (`orcamento-validado`, `orcamento-inconsistencia-detectada`, `orcamento-validado-com-ressalva`) com `schemaVersion: 1`, `source: nexo.validacao`, conforme convenção do `plan.md`.
- [x] T012 [P] Domain: definir interfaces de repositório/gateway (`orcamento-validacao.repository.ts`, `agente-categorizador-item.gateway.ts`, `fornecedor-cadastrado.gateway.ts`, `parametro-faixa-preco.gateway.ts`, `orcamento-extraido-event.acl.ts`) — sem implementação, apenas contratos TypeScript.
- [x] T013 Infrastructure: schema Drizzle das tabelas `validacoes_orcamento` (estado atual, `dados_extraidos`/`inconsistencias` JSONB), `validacoes_orcamento_historico` (append-only, sem UPDATE/DELETE) e `faixas_preco_categoria` (configuração) + migração.
- [x] T014 Infrastructure: `DrizzleOrcamentoValidacaoRepository` implementando `OrcamentoValidacaoRepository`, traduzindo linha↔agregado, nunca vazando tipo JSONB bruto para fora da Infra.
- [x] T015 [P] Infrastructure: `OrcamentoExtraidoEventACL` traduzindo o payload dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` para `DadosExtraidosParaValidacao` — nunca importa tipos de domínio do BC Extração.
- [x] T016 Infrastructure: `EventBridgePublisher` implementando `EventPublisher` (instância própria deste BC, mesmo bus `nexo-dominio-bus`).
- [x] T017 Configurar logging estruturado (pino) + OpenTelemetry Node SDK para os handlers Lambda deste BC, correlação por `orcamentoId` (mesma trilha ponta a ponta das specs 001/002).

**Checkpoint**: Domain testável isoladamente (sem infra, sem IA), repositório e publisher funcionais contra ambiente local (LocalStack).

---

## Phase 3: User Story 1 — Validação bem-sucedida (Priority: P1) 🎯 MVP

**Goal**: orçamento extraído sem nenhuma inconsistência de negócio é marcado "validado" em até 5 minutos (p95), sem ação manual.

**Independent Test**: publicar `OrcamentoExtraido` de teste com CNPJ válido/compatível, todos os campos obrigatórios preenchidos, preços dentro de faixa e prazo coerente; verificar que `OrcamentoValidado` é publicado sem intervenção manual — critério de aceite spec.md "marcado validado em até 5 minutos (p95), sem ação manual".

### Tests (US1)

- [x] T018 [P] [US1] Unit test do agregado `OrcamentoValidacao.criar(dadosExtraidos)` + `avaliarRegrasDeConsistencia` com todas as 4 regras passando → transita para `VALIDADO`.
- [x] T019 [P] [US1] Unit test de cada uma das 4 regras determinísticas (T010) isoladamente, com casos de sucesso e falha, sem mock de IA.
- [x] T020 [P] [US1] Contract test `GET /v1/orcamentos/{orcamentoId}/validacao/status` em `tests/bounded-contexts/validacao/contract/`.
- [x] T021 [P] [US1] Integration test: `OrcamentoExtraido` (documento de teste consistente) publicado → `OrcamentoValidado` publicado, p95 medido em ambiente de teste local (LocalStack).

### Implementation (US1)

- [x] T022 [US1] Infrastructure: `FornecedorCadastradoHttpGateway` + `FornecedorCadastradoACL` (timeout curto, retry limitado, nunca bloqueia processamento de outros orçamentos na fila caso indisponível — ver Segurança do `plan.md`).
- [x] T023 [US1] Infrastructure: `DrizzleFaixaPrecoRepository` implementando `ParametroFaixaPrecoGateway` (leitura da tabela `faixas_preco_categoria`).
- [x] T024 [US1] Application: caso de uso `ValidarOrcamento` (consome `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`, traduz via ACL, aplica `avaliarRegrasDeConsistencia`, persiste, publica `OrcamentoValidado` ou `OrcamentoInconsistenciaDetectada`) — caminho feliz sem categorização de item ainda (item já vem com `categoria` conhecida ou regra de preço não se aplica).
- [x] T025 [US1] Interface: handler Lambda consumidor SQS de `validador-queue`, invocando `ValidarOrcamento`.
- [x] T026 [US1] Interface: controller `GET /v1/orcamentos/{orcamentoId}/validacao/status` (query, Zod schema de response, Problem Details para erro).
- [x] T027 [US1] Interface: autenticação Cognito (JWT) no endpoint de status, mesmo esquema das specs 001/002.
- [x] T028 [US1] IAM: role dedicada `ValidarOrcamentoLambdaRole` (least privilege: leitura da tabela `faixas_preco_categoria`, sem qualquer permissão sobre `nexo-orcamentos-raw`).

**Checkpoint**: US1 funcional e testável isoladamente — orçamento consistente é validado com sucesso, sem intervenção manual.

---

## Phase 4: User Story 2 — Inconsistência detectada e resolução humana (Priority: P1) 🎯 MVP

**Goal**: 1+ regra de consistência falha nunca resulta em "validado" silencioso; evento de exceção explícito com lista específica de regras falhadas é publicado; orçamento só avança para validado (ou validado com ressalva) por decisão humana explícita via fila de escalonamento própria deste BC — sem camada de Agente Revisor de IA (ADR-001).

**Independent Test**: publicar `OrcamentoExtraido` com pelo menos uma inconsistência conhecida (ex.: CNPJ inválido) e verificar que (a) `OrcamentoInconsistenciaDetectada` é publicado com a regra específica identificada, (b) orçamento nunca é marcado "validado" sem decisão humana, (c) decisão humana via API produz `OrcamentoValidado` (correção aplicada) ou `OrcamentoValidadoComRessalva` (aceite explícito) — critério de aceite spec.md "único caminho para chegar a validado depois de uma inconsistência é resolução explícita, nunca por tempo de espera ou reprocessamento silencioso".

### Tests (US2)

- [x] T029 [P] [US2] Unit test `OrcamentoValidacao.avaliarRegrasDeConsistencia` com 1+ regra falhando → transita direto para `PENDENTE_REVISAO_HUMANA` (nunca uma segunda tentativa automática, conforme ADR-001), `inconsistencias` populado com a(s) regra(s) específica(s).
- [x] T030 [P] [US2] Unit test `OrcamentoValidacao.registrarDecisaoHumana` — só válido a partir de `PENDENTE_REVISAO_HUMANA`; `CORRECAO_APLICADA` reavalia regras (→ `VALIDADO` se todas passarem, ou permanece `PENDENTE_REVISAO_HUMANA` com nova tentativa se ainda falhar, nunca autoaprova); `ACEITE_COM_RESSALVA` → `VALIDADO_COM_RESSALVA` (terminal); histórico nunca sobrescrito. Cobertura já existente em `orcamento-validacao.aggregate.test.ts` (adicionada junto com T009/T029): confirmada e marcada concluída, sem duplicar teste.
- [x] T031 [P] [US2] Unit test da decisão de negócio "campo com pendência confirmada pela Extração ainda gera inconsistência aqui" (ver `plan.md`, seção Domain) — item com `extraido: false` de origem `OrcamentoExtraidoComPendenciaConfirmada` MUST ainda reprovar a regra "campos obrigatórios preenchidos" quando o campo é obrigatório para validação. Cobertura já existente em `regras-consistencia.test.ts` — "CAMPO_OBRIGATORIO_AUSENTE quando item sem descricao e extraido:false — pendência confirmada não isenta a regra" (adicionada junto com T010): confirmada e marcada concluída, sem duplicar teste.
- [x] T032 [P] [US2] Contract test `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana` (aceito em `PENDENTE_REVISAO_HUMANA`; 409 Problem Details em qualquer outro status).
- [x] T033 [P] [US2] Integration test: `OrcamentoExtraido` com inconsistência conhecida → `OrcamentoInconsistenciaDetectada` publicado → decisão humana via API → `OrcamentoValidado` ou `OrcamentoValidadoComRessalva` publicado; status reflete `PENDENTE_REVISAO_HUMANA` durante a espera (critério de aceite spec.md "estado de pendência fica visível na consulta de status, sem bloquear o processamento de outros orçamentos").

### Implementation (US2)

- [x] T034 [US2] Application: completar caso de uso `ValidarOrcamento` (T024) para o caminho de falha — publicar `OrcamentoInconsistenciaDetectada` quando 1+ regra falha.
- [x] T035 [US2] Application: caso de uso `RegistrarDecisaoHumanaValidacao` (valida status `PENDENTE_REVISAO_HUMANA`, aplica `registrarDecisaoHumana`, publica `OrcamentoValidado` ou `OrcamentoValidadoComRessalva`).
- [x] T036 [US2] Interface: controller `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana`, Zod schema (`decisao: 'CORRECAO_APLICADA' | 'ACEITE_COM_RESSALVA'`, dados corrigidos ou justificativa), Problem Details para 409.
- [x] T037 [US2] IAM: role dedicada `RegistrarDecisaoHumanaValidacaoLambdaRole`, least privilege.

**Checkpoint**: US2 funcional isoladamente — nenhuma inconsistência é silenciada ou autoaprovada em nenhum cenário, pipeline nunca trava, exceção sempre visível.

---

## Phase 5: User Story 3 — Faixas de preço configuráveis por categoria (Priority: P2)

**Goal**: faixa de preço esperada é parâmetro configurável por categoria de produto, sem valor numérico fixo hardcoded; item sem categoria estruturada é categorizado semanticamente via IA (Bedrock) apenas para seleção da faixa, nunca para decidir consistência (ADR-002).

**Independent Test**: configurar uma faixa de preço para uma categoria via endpoint administrativo; publicar `OrcamentoExtraido` com item de descrição livre correspondente àquela categoria e preço fora da faixa configurada; verificar que a inconsistência é detectada com a faixa correta (sem qualquer alteração de código) — critério de aceite spec.md "parametrizáveis por categoria sem exigir nova spec ou mudança de comportamento de produto".

### Tests (US3)

- [x] T038 [P] [US3] Contract test `POST` / `GET /v1/configuracoes/faixas-preco-categoria` (CRUD simples, transaction script — ver nota de complexidade do `plan.md`).
- [x] T039 [P] [US3] Unit test `BedrockCategorizacaoACL` (mock de saída do Bedrock) — saída estruturada restrita ao catálogo de categorias configurado, nunca uma categoria inventada fora do catálogo. Implementada em `src/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.ts` (apenas a ACL de tradução, pura, sem chamada AWS) + `tests/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.test.ts`; `BedrockCategorizadorItemGateway` (chamada Bedrock real) permanece escopo de T041/#151.
- [ ] T040 [P] [US3] Integration test: item com descrição livre → `AgenteCategorizadorItemGateway` retorna categoria do catálogo → regra de preço compara contra a `FaixaPreco` correta → resultado determinístico (dentro/fora de faixa) independente da IA.

### Implementation (US3)

- [x] T041 [US3] Infrastructure: `BedrockCategorizadorItemGateway` + `BedrockCategorizacaoACL` (structured output/tool-use restrito ao catálogo configurado, nunca parsing de texto livre por regex; mitigação de prompt injection via bloco delimitado de conteúdo, mesmo padrão das specs 001/002). Implementado em `bedrock-categorizador-item.gateway.ts` (issue #151) — `BedrockCategorizacaoACL` já mergeada em T039/#149. Wiring no caso de uso `ValidarOrcamento` é escopo de T042/#152.
- [x] T042 [US3] Application: estender `ValidarOrcamento` para, antes de aplicar a regra de preço, invocar `AgenteCategorizadorItemGateway` para cada item sem `categoria` conhecida. Implementado em `validar-orcamento.ts` (PR #680, issue #152) — item já categorizado nunca vai ao agente; catálogo vazio (sem faixa configurada) também nunca invoca; falha do agente propaga (mensagem SQS retenta).
- [x] T043 [US3] Infrastructure: `DrizzleFaixaPrecoRepository` (T023) completo com escrita (`upsert`) além da leitura já usada em US1.
- [x] T044 [US3] Interface: controllers `POST`/`GET /v1/configuracoes/faixas-preco-categoria` (Zod schema, papel administrativo distinto via Cognito, transaction script sem agregado rico). Implementado em `faixa-preco-categoria.controller.ts` (issue #154) — guard `criarExigenciaPapel(['compliance-admin'])` aplicado a ambos os endpoints (`plan.md:145` não distingue leitura de escrita); absorve T5 do ADR-010/#689 (rota não existia antes, guard já nasce aplicado).
- [ ] T045 [US3] IAM: role dedicada `ValidarOrcamentoLambdaRole` (T028) estendida com `bedrock:InvokeModel` restrito ao ARN do modelo de categorização aprovado.

**Checkpoint**: todas as user stories funcionais e testáveis independentemente; faixa de preço ajustável operacionalmente sem deploy de código.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T046 [P] Documentação OpenAPI gerada a partir dos schemas Zod dos 3 endpoints REST deste BC (status, decisão humana, configuração de faixa de preço).
- [ ] T047 Medir p95 real end-to-end (extração disponível → validação disponível) em ambiente de teste; decidir se a chamada síncrona ao categorizador de item (Bedrock) exige Provisioned Concurrency, dado que não é fluxo crítico de decisão de consistência (ver Constraints do `plan.md`).
- [ ] T048 Security review: `npm audit`/`pnpm audit`, Semgrep, revisão de prompt injection no prompt do `AgenteCategorizadorItemGateway`, revisão de timeout/circuit breaker do `FornecedorCadastradoHttpGateway` (mesmo checklist das specs 001/002).
- [ ] T049 [P] Métrica de observabilidade: "taxa de inconsistência por tipo de regra" e "percentual de orçamentos validados automaticamente sem intervenção humana" — conforme "Métricas de Avaliação Contínua" do spec.md.
- [ ] T050 Coordenar com owner da spec 002 (Extração) a inclusão de um campo de data de emissão da proposta no payload de `OrcamentoExtraido` — dependência registrada como risco remanescente no `plan.md` (regra de coerência de prazo depende desse dado).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depende apenas da infraestrutura já provisionada pelas specs 001/002 (bus `nexo-dominio-bus`) — pode iniciar em paralelo à spec 002 desde que o contrato do evento `OrcamentoExtraido` esteja fechado (ver risco remanescente do `plan.md` sobre `dataEmissaoProposta`).
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories.
- **User Stories (Phase 3+)**: todas dependem de Foundational.
  - US1 (validação bem-sucedida) é o caminho feliz mínimo — MVP.
  - US2 (inconsistência + resolução humana) depende dos mesmos fundamentos de US1, mas é independentemente testável (documento com inconsistência conhecida); compartilha o mesmo caso de uso `ValidarOrcamento` (T024/T034) como ponto de entrada.
  - US3 (faixas de preço configuráveis + categorização) é incremento sobre a regra de preço já existente em US1 — testável isoladamente com uma categoria configurada, mas só é MVP-crítico se o volume real de itens sem categoria estruturada exigir a etapa de IA (registrar decisão de produto se US3 puder ser adiada para pós-MVP).
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: nenhuma dependência de outra story.
- **US2 (P1)**: nenhuma dependência de código de US1, mas compartilha o caso de uso `ValidarOrcamento` (T024) como ponto de entrada — implementar T024 cobrindo ambos os desfechos (sucesso e inconsistência) antes de considerar US1 "completa" isoladamente é aceitável, mas o teste de US2 só é executável após T009 (agregado) e T024 existirem.
- **US3 (P2)**: requer T024 (US1) para o ponto de integração da categorização, mas os artefatos de código (T041, T044) são implementáveis em paralelo a US1/US2 a partir de Foundational — categoria pode ser mockada/fixa em US1 até US3 estar completa.

### Parallel Opportunities

- Todos os T0XX marcados [P] na mesma fase podem rodar em paralelo (arquivos distintos, sem dependência).
- VOs (T005–T008) em paralelo entre si; agregado (T009) depende de todos os VOs.
- Gateways de Infrastructure de US1 e US3 (T022/T023 e T041) podem ser implementados em paralelo por desenvolvedores distintos, desde que Foundational esteja completo.

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (bloqueia tudo).
3. Completar Phase 3 (US1) + Phase 4 (US2) — ambas P1, formam o MVP real: "orçamento consistente valida sozinho, inconsistente nunca valida sozinho".
4. **PARAR e VALIDAR**: rodar cenário de documento consistente (US1) e cenário de documento com inconsistência conhecida (US2) antes de avançar.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar isoladamente → demo (caminho feliz).
3. US2 → testar isoladamente → demo (nunca valida com inconsistência pendente, sempre escalona para humano).
4. US3 → testar isoladamente → demo (faixa de preço ajustável sem deploy, categorização por IA não decide consistência).
5. Polish → métricas, performance, segurança, coordenação de dependência com spec 002.
