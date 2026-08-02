# Tasks: Indexação e Busca Semântica de Orçamentos (Agente de Indexação)

**Input**: `specs/004-indexacao-busca-semantica-orcamentos/plan.md`, `spec.md` (versão 2, clarified)

**Tests**: incluídas — spec tem critérios de aceite testáveis explícitos e reforça invariante NON-NEGOTIABLE (Princípio IV: falha de indexação nunca é silenciosa; Princípio II: falha nunca bloqueia o pipeline principal).

**Organização**: tarefas agrupadas por user story (prioridade P1), rastreáveis ao `plan.md`. Cada task abaixo está pronta para virar issue técnica no GitHub (título = ID + descrição; critério de aceite = referência ao item correspondente do `spec.md`); vinculada à issue de negócio original do PM (feature `indexacao-busca-semantica-orcamentos`, depende de `validacao-consistencia-orcamentos`).

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Criar estrutura de pastas `src/bounded-contexts/busca-indexacao/{domain,application,infrastructure,interface}` e `tests/bounded-contexts/busca-indexacao/{domain,application,contract}` conforme `plan.md` (monorepo já inicializado pelas specs 001–003 — não repetir setup daquelas specs).
- [x] T002 [P] Migração Drizzle Kit: `CREATE EXTENSION IF NOT EXISTS vector;` no Aurora Serverless v2 Postgres — primeira spec do projeto a exigir extensão Postgres além do padrão (ADR-001 do `plan.md`); coordenar com Ricardo/DevOps a habilitação da extensão no cluster antes desta migração rodar.
- [x] T003 [P] Migração Drizzle Kit: schema inicial do BC Busca & Indexação (tabelas `indices_orcamento` com coluna `embedding vector(1024)` + índice HNSW distância cosseno, `indices_orcamento_historico`, ambas vazias, baseline).
- [x] T004 [P] Provisionar fila SQS `indexador-queue` com DLQ própria, `maxReceiveCount` configurado para retentativas automáticas com backoff, e alarme CloudWatch em mensagem na DLQ (IaC — Ricardo/DevOps). Sem fila de revisão humana de negócio, por decisão de ADR-002 desta spec.
- [x] T005 [P] Provisionar regra EventBridge no bus `nexo-dominio-bus` roteando `detail-type: OrcamentoValidado` e `detail-type: OrcamentoValidadoComRessalva`, `source: nexo.validacao` → `indexador-queue`.
- [ ] T006 Coordenar com owner da spec 003 (Validação) o enriquecimento do payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` para incluir `itens` e `condicoesComerciais` **e `tenantId`** (ADR-003 e ADR-005 do `plan.md`) — pré-requisito bloqueante; sem este enriquecimento, `OrcamentoValidadoEventACL` (T018) não tem dado de origem para montar `ConteudoIndexavel` nem para popular `IndiceOrcamento.tenantId`.

**Checkpoint**: estrutura pronta, extensão pgvector habilitada, fila e regra de roteamento provisionadas, payload upstream coordenado, CI verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [x] T007 Domain: implementar VOs `OrcamentoId`, `Dinheiro` (redefinidos localmente neste BC, mesma validação das specs 001–003, sem import cruzado) em `src/bounded-contexts/busca-indexacao/domain/value-objects/`.
- [x] T008 [P] Domain: implementar VO `ConteudoIndexavel` — construtor valida não-vazio (erro de domínio se vazio, nunca "indexação válida" de conteúdo nulo); estrutura `{ resumoFornecedor, itensDescricao: string[], condicoesResumo, categorias }`.
- [x] T009 [P] Domain: implementar VO `Embedding` — construtor valida `vetor.length === dimensao`; sem lógica de similaridade (isso é query, não Domain).
- [x] T010 [P] Domain: implementar VO `OrigemValidacao` (enum fechado `VALIDADO | VALIDADO_COM_RESSALVA`) e VO `TentativaIndexacao` (histórico imutável).
- [x] T011 [P] Domain: implementar VOs `CriterioBusca` e `ResultadoBusca` (usados pelo caso de uso de busca, US2).
- [x] T012 Domain: implementar agregado `IndiceOrcamento` (`indice-orcamento.aggregate.ts`) com método `registrarTentativaIndexacao`, invariante "só transita para INDEXADO com embedding gerado e persistido na mesma tentativa", retry sem limite estrutural no Domain (limite é infraestrutura, ver T004), histórico append-only, `OrigemValidacaoImutavelError` se houver tentativa de sobrescrever `origemValidacao`/`conteudoIndexavel` fora do construtor. Critério: unit test que tenta forçar `INDEXADO` sem embedding e espera erro de domínio.
- [x] T012b **(ADR-005, retrofit)** Domain: adicionar atributo `tenantId: TenantId` (import de `src/shared-kernel/tenant/tenant-id.vo.ts`, spec 007) ao agregado `IndiceOrcamento`, obrigatório e imutável desde a criação; invariante `TenantIdImutavelError` em tentativa de sobrescrita, mesmo padrão de `OrigemValidacaoImutavelError`. Critério: unit test cobrindo criação sem `tenantId` (erro), sobrescrita pós-criação (erro).
- [x] T013 [P] Domain: definir os 2 Domain Events (`orcamento-indexado`, `falha-indexacao-detectada`) com `schemaVersion: 1`, `source: nexo.busca-indexacao`, conforme convenção do `plan.md`.
- [x] T013b **(ADR-005, retrofit)** Domain: subir os 2 Domain Events de T013 para `schemaVersion: 2`, payload incluindo `tenantId` obrigatório — mesma convenção de amendment já aplicada pela spec 007 aos eventos de 001 (ADR-005 daquela spec).
- [x] T014 [P] Domain: definir interfaces de repositório/gateway (`indice-orcamento.repository.ts`, `agente-embedding.gateway.ts`, `agente-interpretador-consulta.gateway.ts`, `orcamento-validado-event.acl.ts`) — sem implementação, apenas contratos TypeScript.
- [x] T015 Infrastructure: schema Drizzle completo das tabelas `indices_orcamento` (estado atual, `conteudo_indexavel` JSONB, `embedding vector(1024)`, índice HNSW) e `indices_orcamento_historico` (append-only, sem UPDATE/DELETE) + migração (complementa T003 com o mapeamento Drizzle real).
- [x] T015b **(ADR-005, retrofit — BLOCKER apontado por backend-reviewer no PR #176)** Infrastructure: nova migração Drizzle Kit adicionando `tenant_id UUID NOT NULL` + `CREATE POLICY tenant_isolation ON indices_orcamento USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` (e mesma política em `indices_orcamento_historico`) — mesmo padrão exato de `drizzle/0013_rls_orcamentos_tenant_isolation.sql` (spec 007). Pré-requisito de T016. Verificar junto ao checklist T009 da spec 007 (nenhuma role IAM com `BYPASSRLS`).
- [x] T016 Infrastructure: `DrizzlePgvectorIndiceOrcamentoRepository` implementando `IndiceOrcamentoRepository` — inclui `upsert` idempotente por `orcamentoId`+`tenantId` (necessário para retry, T012) e método `buscarPorCriterioEVetor` (filtro SQL determinístico AND `ORDER BY embedding <=> :vetor LIMIT :n`), traduzindo linha↔agregado, nunca vazando o tipo `vector` bruto para fora da Infra. **(ADR-005) MUST estender `DrizzleTenantScopedRepositoryBase` (`src/shared-kernel/tenant/`, spec 007/T008), usando `transacaoTenantScoped` em toda transação — depende de T015b.** `tenantId` nunca é parâmetro solto dos métodos: vem do `TenantContext` fixado na instância do repositório (mesma convenção da classe base), não de um argumento explícito por chamada. Não considerar T016/PR #176 pronto sem esse retrofit.
- [x] T017 Infrastructure: `EventBridgePublisher` implementando `EventPublisher` (instância própria deste BC, mesmo bus `nexo-dominio-bus`).
- [ ] T018 Infrastructure: `OrcamentoValidadoEventACL` traduzindo o payload (enriquecido, ver T006) dos eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva` para `ConteudoIndexavel` + `OrigemValidacao` + `tenantId` (ADR-005) — nunca importa tipos de domínio do BC Validação.
- [x] T019 Configurar logging estruturado (pino) + OpenTelemetry Node SDK para os handlers Lambda deste BC, correlação por `orcamentoId`/`tenantId` (mesma trilha ponta a ponta das specs 001–003 e 007).

**Checkpoint**: Domain testável isoladamente (sem infra, sem IA), repositório (incluindo query vetorial, tenant-scoped) e publisher funcionais contra ambiente local (LocalStack + Postgres com pgvector).

---

## Phase 3: User Story 1 — Indexação automática de orçamento validado (Priority: P1) 🎯 MVP

**Goal**: orçamento marcado "validado" (ou "validado com ressalva") torna-se pesquisável por linguagem natural em até 5 minutos (p95), sem reinterpretar/alterar valor estruturado, sem nunca ser omitido do índice por critério de relevância de negócio, e sem que uma falha técnica bloqueie o pipeline principal (Princípio II).

**Independent Test**: publicar `OrcamentoValidado` de teste (com itens/condições e `tenantId` no payload enriquecido) e verificar que `OrcamentoIndexado` é publicado com embedding persistido em até 5 minutos (p95) — critério de aceite spec.md "torna-se pesquisável por linguagem natural em até 5 minutos (p95)". Publicar também um cenário de falha simulada do gateway de embeddings e verificar que (a) `FalhaIndexacaoDetectada` é publicado, (b) o orçamento permanece "validado" e consultável por outras formas (fora desta spec), (c) o processamento de outros orçamentos na fila não é afetado — critério de aceite spec.md "falha de indexação nunca impede que esse orçamento continue disponível como validado nem impede o processamento dos demais".

### Tests (US1)

- [x] T020 [P] [US1] Unit test do agregado `IndiceOrcamento.criar(tenantId, conteudoIndexavel, origemValidacao)` + `registrarTentativaIndexacao` com sucesso → transita para `INDEXADO`, embedding persistido. Coberto por `tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` (casos "transita para INDEXADO quando embedding é fornecido na mesma tentativa" e "reconstitui agregado já indexado a partir de estado persistido"), já implementado junto de T012/T012b (PRs #501, #532).
- [x] T021 [P] [US1] Unit test `registrarTentativaIndexacao` com falha técnica → transita para `FALHA_INDEXACAO`, histórico anexado (nunca sobrescrito), nenhum limite estrutural de tentativas no Domain. Coberto por `tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` (casos "transita para FALHA_INDEXACAO em falha técnica e preserva histórico" e "permite retry sem limite estrutural após FALHA_INDEXACAO, mantendo tentativas anteriores no histórico" — 3 tentativas anexadas, nenhuma sobrescrita), já implementado junto de T012/T012b (PRs #501, #532).
- [x] T022 [P] [US1] Unit test de invariante "nunca omitir por relevância" — nenhum método do agregado aceita parâmetro de exclusão de negócio; única via para não indexar é falha técnica registrada. Coberto por `tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` (casos "único método de transição de estado é registrarTentativaIndexacao — nenhum método de exclusão de negócio exposto" e "rejeita resultado fora do conjunto fechado INDEXADO|FALHA_TECNICA").
- [ ] T023 [P] [US1] Unit test `OrcamentoValidadoEventACL` (mock de payload enriquecido de `OrcamentoValidado`/`OrcamentoValidadoComRessalva`, incluindo `tenantId`) → produz `ConteudoIndexavel` + `OrigemValidacao` + `TenantId` corretos, preservando ambas as origens (ver ADR-004).
- [x] T024 [P] [US1] Contract test `GET /v1/orcamentos/{orcamentoId}/indexacao/status` em `tests/bounded-contexts/busca-indexacao/contract/`, incluindo caso Tenant A consultando `orcamentoId` de Tenant B → 404 (mesmo padrão T011 da spec 007).
- [ ] T025 [P] [US1] Integration test: `OrcamentoValidado` publicado → `OrcamentoIndexado` publicado, embedding persistido em `indices_orcamento` com `tenant_id` correto, p95 medido em ambiente de teste local (LocalStack + Postgres/pgvector).
- [ ] T026 [P] [US1] Integration test: falha simulada do `AgenteEmbeddingGateway` → `FalhaIndexacaoDetectada` publicado; orçamento seguinte na fila (mesmo de outro tenant) processado normalmente (sem bloqueio) — critério de aceite spec.md "não impede o processamento dos demais orçamentos".
- [ ] T027 [P] [US1] Integration test: retry automático via redrive da DLQ após falha transiente simulada → `OrcamentoIndexado` publicado na retentativa, histórico com as duas tentativas visível.
- [x] T027b [P] [US1] **(ADR-005)** Teste adversarial cross-tenant: repositório com `TenantContext` de Tenant A não retorna/atualiza linha de `indices_orcamento`/`indices_orcamento_historico` de Tenant B, mesmo sem `SET LOCAL` (deve retornar zero linhas) — mesmo padrão de T010 da spec 007, em `tests/security/isolamento-multitenant/busca-indexacao.test.ts`.

### Implementation (US1)

- [ ] T028 [US1] Infrastructure: `BedrockEmbeddingGateway` + `BedrockEmbeddingACL` usando Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`, 1024 dimensões) — Ricardo MUST reconfirmar o model ID vigente no console Bedrock da região de deploy antes de codificar o ARN fixo na role IAM (T032).
- [ ] T029 [US1] Application: caso de uso `IndexarOrcamento(tenantId, ...)` (consome `OrcamentoValidado`/`OrcamentoValidadoComRessalva`, traduz via ACL, invoca `AgenteEmbeddingGateway`, aplica `registrarTentativaIndexacao`, persiste via upsert idempotente, publica `OrcamentoIndexado` ou `FalhaIndexacaoDetectada` — ambos `schemaVersion: 2` com `tenantId`, ver T013b).
- [ ] T030 [US1] Interface: handler Lambda consumidor SQS de `indexador-queue`, invocando `IndexarOrcamento`.
- [ ] T031 [US1] Interface: controller `GET /v1/orcamentos/{orcamentoId}/indexacao/status` (query, Zod schema de response, Problem Details para erro) + autenticação Cognito (JWT) atrás do `TenantContextMiddleware` compartilhado (spec 007) — `tenantId` do JWT comparado ao `tenantId` do agregado antes de retornar dado, 404 em divergência.
- [ ] T032 [US1] IAM: role dedicada `IndexarOrcamentoLambdaRole` (least privilege: `bedrock:InvokeModel` restrito ao ARN do modelo de embedding aprovado, escrita apenas em `indices_orcamento`/`indices_orcamento_historico`, nenhuma permissão sobre `nexo-orcamentos-raw` nem sobre tabelas de outros BCs, **sem `BYPASSRLS`**) e `ConsultaStatusIndexacaoLambdaRole` (idem).

**Checkpoint**: US1 funcional e testável isoladamente — orçamento validado é indexado automaticamente, tenant-scoped, falha técnica nunca bloqueia o pipeline nem é silenciosa.

---

## Phase 4: User Story 2 — Busca em linguagem natural via API (Priority: P1) 🎯 MVP

**Goal**: consulta em linguagem natural combinando critérios (categoria, faixa de preço, período) retorna os orçamentos relevantes já indexados do tenant solicitante, ordenados por relevância, sem exigir correspondência exata de texto — sem que a IA decida quais orçamentos existem/passam nos filtros (isso é sempre determinístico, no repositório).

**Independent Test**: com orçamentos de teste já indexados (US1) de dois tenants distintos, submeter consulta combinando categoria + faixa de preço + período via `POST /v1/orcamentos/busca` autenticado como Tenant A e verificar que (a) apenas orçamentos de Tenant A são retornados, ordenados por relevância, (b) nenhum orçamento de Tenant B aparece mesmo que atenda aos mesmos critérios — critério de aceite spec.md "retorna os orçamentos relevantes à consulta, ordenados por relevância" / "sem exigir correspondência exata de texto", combinado ao guardrail cross-tenant da spec 007.

### Tests (US2)

- [ ] T033 [P] [US2] Unit test `BedrockInterpretacaoConsultaACL` (mock de saída do Bedrock) — saída estruturada restrita ao catálogo de categorias configurado, nunca uma categoria/filtro inventado fora do catálogo.
- [ ] T034 [P] [US2] Unit test do caso de uso `BuscarOrcamentos` — filtro explícito enviado na requisição nunca é sobrescrito pela interpretação da IA, apenas complementado (mock de `AgenteInterpretadorConsultaGateway` e `AgenteEmbeddingGateway`); `tenantId` sempre presente e nunca sobrescrevível por parâmetro de busca.
- [ ] T035 [P] [US2] Contract test `POST /v1/orcamentos/busca` (body com consulta em linguagem natural + filtros explícitos; resposta paginada com `ResultadoBusca[]`; Problem Details para erro de validação Zod).
- [ ] T036 [P] [US2] Integration test: consulta combinando categoria + faixa de preço + período contra orçamentos indexados de teste de dois tenants (LocalStack + Postgres/pgvector) → resultado relevante ordenado por distância vetorial + filtro determinístico, restrito ao tenant do JWT, sem exigir correspondência exata de texto na descrição do item.

### Implementation (US2)

- [ ] T037 [US2] Infrastructure: `BedrockInterpretadorConsultaGateway` + `BedrockInterpretacaoConsultaACL` (structured output/tool-use restrito ao catálogo de categorias configurado, nunca parsing de texto livre por regex; mitigação de prompt injection via bloco delimitado de conteúdo, mesmo padrão das specs 001–003, aplicado aqui à consulta do usuário).
- [ ] T038 [US2] Application: caso de uso `BuscarOrcamentos(tenantId, ...)` (interpreta consulta via `AgenteInterpretadorConsultaGateway`, mescla com filtros explícitos, gera vetor de consulta via `AgenteEmbeddingGateway` sobre `textoLivreResidual`, executa `IndiceOrcamentoRepository.buscarPorCriterioEVetor(tenantId, ...)`, mapeia para `ResultadoBusca[]`).
- [ ] T039 [US2] Interface: controller `POST /v1/orcamentos/busca` (Zod schema de request/response, paginação, Problem Details para erro) + autenticação Cognito (JWT) atrás do `TenantContextMiddleware` compartilhado (spec 007) — `tenantId` sempre do middleware, nunca de body/query.
- [ ] T040 [US2] IAM: role dedicada `BuscarOrcamentosLambdaRole` (least privilege: `bedrock:InvokeModel` restrito aos dois modelos — embedding e interpretação de consulta —, apenas leitura em `indices_orcamento`, nenhuma escrita, **sem `BYPASSRLS`**).

**Checkpoint**: todas as user stories funcionais e testáveis independentemente — orçamento validado indexa-se automaticamente (US1) e torna-se encontrável por linguagem natural (US2), ambas tenant-scoped.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T041 [P] Documentação OpenAPI gerada a partir dos schemas Zod dos 2 endpoints REST deste BC (status de indexação, busca).
- [ ] T042 Medir p95 real end-to-end (validação disponível → indexação disponível, US1) e p95 do endpoint de busca (US2, sem meta declarada na spec — ver risco remanescente do `plan.md`) em ambiente de teste; decidir se a Lambda de busca exige Provisioned Concurrency, dado que a chamada síncrona ao Interpretador de Consulta é percebida pelo usuário final.
- [ ] T043 Security review: `npm audit`/`pnpm audit`, Semgrep, revisão de prompt injection nos prompts do `AgenteInterpretadorConsultaGateway` e do `AgenteEmbeddingGateway`, revisão de least privilege das roles IAM deste BC (mesmo checklist das specs 001–003), **checklist `BYPASSRLS` (T009 da spec 007) aplicado às roles T032/T040**.
- [ ] T044 [P] Métrica de observabilidade: "tempo até indexação disponível (p95)" e "percentual de orçamentos validados indexados com sucesso" — conforme "Métricas de Avaliação Contínua" do spec.md; alarme se taxa de falha sustentada acima do esperado (gatilho de investigação de capacidade, não de revisão humana individual — ADR-002).
- [ ] T045 Confirmar com owner da spec 003 (Validação) que o enriquecimento do payload coordenado em T006 foi de fato implementado — **incluindo `tenantId`** (ADR-005) — antes de considerar esta feature pronta para produção — dependência bloqueante registrada como risco remanescente no `plan.md` (ADR-003 e ADR-005).
- [ ] T046 Validar em npmjs.com/package/drizzle-orm e no console Bedrock da região de deploy, no momento real da implementação: (a) versão exata do `drizzle-orm` com suporte ao tipo `vector`/`customType` (ver Technical Context do `plan.md`); (b) disponibilidade regional atual do model ID `amazon.titan-embed-text-v2:0` — nenhum dos dois deve ser assumido como definitivo sem essa reconfirmação.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depende da infraestrutura já provisionada pelas specs 001–003 (bus `nexo-dominio-bus`, Aurora Serverless v2) e da coordenação de enriquecimento de payload com a spec 003 (T006, agora incluindo `tenantId`) — pode iniciar em paralelo à espera dessa coordenação, mas T029 (US1) não pode ser considerado "completo" antes de T006 estar resolvido.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories. **T015b bloqueia T016** (retrofit ADR-005); T012b/T013b não bloqueiam T016 tecnicamente mas MUST ser resolvidos no mesmo PR/checkpoint, para não deixar o agregado/eventos sem `tenantId` enquanto o repositório já o exige.
- **User Stories (Phase 3+)**: ambas dependem de Foundational.
  - US1 (indexação automática) é o caminho de enriquecimento assíncrono mínimo — MVP.
  - US2 (busca em linguagem natural) depende dos mesmos fundamentos de US1 e, para teste de integração completo, de orçamentos já indexados por US1 — mas os artefatos de código de US2 (T037–T040) são implementáveis em paralelo a US1 a partir de Foundational, usando dados de teste inseridos diretamente na tabela `indices_orcamento` sem depender do pipeline de US1 estar 100% funcional.
- **Polish (Phase 5)**: depende de ambas as user stories completas.

### User Story Dependencies

- **US1 (P1)**: nenhuma dependência de código de outra story; depende externamente da coordenação de payload (T006/ADR-003/ADR-005) com a spec 003.
- **US2 (P1)**: nenhuma dependência de código de US1 (usa o mesmo repositório e a mesma tabela, mas não chama nenhum caso de uso de US1); dependência de dado (precisa de linhas em `indices_orcamento` para testes de integração significativos), não de código.

### Parallel Opportunities

- Todos os T0XX marcados [P] na mesma fase podem rodar em paralelo (arquivos distintos, sem dependência).
- VOs (T007–T011) em paralelo entre si; agregado (T012/T012b) depende de todos os VOs.
- US1 (T020–T032) e US2 (T033–T040) podem ser implementadas por desenvolvedores distintos em paralelo, a partir do Checkpoint de Foundational, dado que não compartilham caso de uso (diferente do padrão de US1/US2 compartilhando `ValidarOrcamento` na spec 003).

### Riscos de sequenciamento a observar

- **(ADR-005) T015b/T016**: PR #176 (T016) não deve ser mergeado como "pronto" antes de T015b (migração `tenant_id`/RLS) e T012b (atributo `tenantId` no agregado) existirem — mesmo que em PRs separados, a sequência lógica é T015b → T016; T012b pode seguir em paralelo, mas o repositório T016 precisa do VO `TenantId` (já disponível via Shared Kernel da spec 007) e da tabela com a coluna `tenant_id` (T015b) antes de fechar.
- Verificar, antes de fechar T029/T045, se a spec 003 já propaga `tenantId` no payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` — se não, é bloqueio adicional (ADR-005), não resolvido apenas por T006.

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Phase 1: Setup (incluindo resolução de T006 — coordenação de payload, itens/condições/`tenantId`, com spec 003).
2. Completar Phase 2: Foundational (bloqueia tudo) — incluindo retrofit ADR-005 (T012b/T013b/T015b) antes de T016 ser considerado pronto.
3. Completar Phase 3 (US1) + Phase 4 (US2) — ambas P1, formam o MVP real: "orçamento validado indexa-se automaticamente" + "orçamento indexado é encontrável por linguagem natural", ambas tenant-scoped.
4. **PARAR e VALIDAR**: rodar cenário de indexação com sucesso, cenário de falha técnica sem bloqueio de pipeline (US1), cenário de busca combinando categoria/preço/período (US2), e suíte adversarial cross-tenant (T027b) antes de avançar.

### Incremental Delivery

1. Setup + Foundational → base pronta (extensão pgvector habilitada, payload upstream coordenado, tenant_id/RLS retrofit aplicado).
2. US1 → testar isoladamente → demo (orçamento validado torna-se "indexado", falha nunca bloqueia, tenant isolado).
3. US2 → testar isoladamente → demo (consulta em linguagem natural retorna resultado relevante do tenant certo, sem exigir texto exato).
4. Polish → métricas, performance, segurança, confirmação final da dependência de payload com spec 003.
