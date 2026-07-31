---

description: "Task list for feature: Isolamento Multi-tenant de Dados e Exportação de Auditoria (Backend)"

---

# Tasks: Isolamento Multi-tenant de Dados e Exportação de Auditoria (Backend)

**Input**: `specs/007-isolamento-multitenant-dados/plan.md`, `specs/007-isolamento-multitenant-dados/spec.md`

**Tests**: incluídas — spec.md declara critérios de aceite testáveis com guardrail de segurança não-negociável ("0 incidentes, sempre"); testes adversariais de vazamento cross-tenant são obrigatórios, não opcionais.

**Organization**: tasks agrupadas pelas 3 seções de "Comportamento esperado" do spec.md, mapeadas 1:1 para user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 = Isolamento de dado por tenant · US2 = Exportação de relatório de auditoria · US3 = Continuidade dos contratos existentes (001)

## Path Conventions

Monorepo único, conforme `plan.md` desta spec — `src/shared-kernel/`, `src/bounded-contexts/ingestao-identificacao/` (retrofit), `src/bounded-contexts/acompanhamento/` (novo), `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: base de código para o Shared Kernel de tenant, sem a qual nenhuma user story pode avançar.

- [x] T001 Criar `src/shared-kernel/tenant/tenant-id.vo.ts` — VO `TenantId`, UUID v7, validação de formato, sem lógica de negócio (ADR-004 do plan.md). (#264, PR #454)
- [x] T002 [P] Criar `src/shared-kernel/tenant/tenant-context.ts` — tipo `TenantContext` (request-scoped, nunca estado global mutável). (#265)
- [x] T003 [P] Configurar lint rule/checklist de PR documentando que `src/shared-kernel/tenant/` é a única exceção autorizada de import direto entre Bounded Contexts (ADR-004). (#266)

**Checkpoint**: Shared Kernel disponível para todas as fases seguintes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: mecanismo de isolamento estrutural que TODA user story depende (Interface → Application → Repository → RLS). Bloqueante — nenhuma user story pode ser considerada concluída sem esta fase.

**⚠️ CRITICAL**: nenhuma implementação de US1/US2/US3 é aceitável antes desta fase estar completa e testada.

- [x] T004 Provisionar Cognito custom attribute `custom:tenant_id` (imutável pós-onboarding) — infraestrutura, IAM/Cognito. Entregue como runbook em `specs/007-isolamento-multitenant-dados/infra/cognito-custom-attribute-tenant-id.md` (User Pool não é gerenciado por IaC neste repo — nenhuma spec 001-006 provisiona o pool via CDK/Terraform; mutação de schema é operacional, executada uma única vez por ambiente, sem acesso AWS real disponível neste agente). Execução real por ambiente rastreada separadamente — ver seção "Status" do runbook. (#267)
- [ ] T005 Implementar `TenantContextMiddleware` (plugin Fastify) em `src/interface/shared/tenant-context.middleware.ts` — extrai/valida claim JWT, popula `request.tenantContext`, rejeita com 401 Problem Details se ausente/inválida. Nunca aceita `tenantId` de query/path/body.
- [ ] T006 [P] Criar tabela `sftp_tenant_mapping` (Drizzle schema + migration) e resolver `tenantId` no trigger Lambda do canal SFTP a partir do mapeamento usuário/servidor (nunca do conteúdo do arquivo).
- [ ] T007 Habilitar RLS no Aurora Serverless v2: migration adicionando `tenant_id UUID NOT NULL` + `CREATE POLICY tenant_isolation ... USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` nas tabelas `orcamentos` e `orcamentos_historico` (retrofit de 001).
- [ ] T008 Implementar `DrizzleTenantScopedRepositoryBase` em `src/shared-kernel/tenant/` (ou infra compartilhada equivalente) — executa `SET LOCAL app.current_tenant_id = $1` no início de toda transação, `$1` vindo exclusivamente do `TenantContext` validado em T005.
- [ ] T009 Checklist de infraestrutura (Terraform/CDK): garantir que nenhuma role IAM/DB de Lambda que acesse tabela tenant-scoped tenha `BYPASSRLS`. Aplicar a `ClassificadorLambdaRole`, `ReceberOrcamentoLambdaRole`, `ConfirmarRevisaoHumanaLambdaRole`, `ConsultaStatusLambdaRole` (001) e às novas roles de Acompanhamento (T019).
- [ ] T010 [P] Suíte de teste adversarial em `tests/security/isolamento-multitenant/` — tenta ler cross-tenant via: (a) repositório com `tenantId` trocado após `SET LOCAL` de outro tenant; (b) sessão DB sem `SET LOCAL` (deve retornar zero linhas, nunca todas); (c) query param `tenantId` forjado na Interface (deve ser ignorado, claim do JWT prevalece). MUST falhar em toda tentativa de retornar dado cross-tenant.

**Checkpoint**: mecanismo de isolamento (4 camadas) funcional e testado adversarialmente antes de qualquer user story avançar.

---

## Phase 3: User Story 1 - Isolamento de dado por tenant (Priority: P1) 🎯 Guardrail crítico

**Goal**: nenhuma consulta/busca/exportação via API retorna dado de tenant diferente do solicitante, sob nenhuma condição, incluindo erro de sistema.

**Independent Test**: executar a suíte adversarial de T010 contra os endpoints já existentes de 001 (`GET /v1/orcamentos/{id}/status`, `POST /v1/orcamentos/{id}/revisao-humana`) autenticados como Tenant A tentando acessar `orcamentoId` pertencente a Tenant B — MUST retornar 404 Problem Details (nunca revelar existência cross-tenant via 403).

### Tests for User Story 1

- [ ] T011 [P] [US1] Teste de contrato: `GET /v1/orcamentos/{id}/status` com JWT de Tenant A e `orcamentoId` de Tenant B retorna 404, não 200/403, em `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`.
- [ ] T012 [P] [US1] Teste unit: `Orcamento.aggregate` lança `TenantIdImutavelError` em tentativa de sobrescrever `tenantId` pós-criação, em `tests/bounded-contexts/ingestao-identificacao/domain/orcamento-tenant.test.ts`.
- [ ] T013 [P] [US1] Teste unit: `TenantId` VO rejeita formato inválido, em `tests/shared-kernel/tenant/tenant-id.test.ts`.

### Implementation for User Story 1

- [ ] T014 [US1] Adicionar atributo `tenantId: TenantId` (obrigatório, imutável) ao agregado `Orcamento` em `src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.ts`; invariante `TenantIdImutavelError`.
- [ ] T015 [US1] Atualizar os 5 Domain Events de 001 (`src/bounded-contexts/ingestao-identificacao/domain/events/`) para incluir `tenantId` no payload, `schemaVersion: 2` (ADR-005).
- [ ] T016 [US1] Atualizar `ReceberOrcamento` (Application) para receber `tenantId` obrigatório do `TenantContext` (nunca do body) e propagá-lo à criação do agregado, em `src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.ts`.
- [ ] T017 [US1] Atualizar `ClassificarOrcamento`, `ConfirmarRevisaoHumana`, `ConsultarStatusOrcamento` para propagar/validar `tenantId` (comparação explícita contra o agregado antes de retornar dado; 404 em divergência) em `src/bounded-contexts/ingestao-identificacao/application/use-cases/`.
- [ ] T018 [US1] Migrar `DrizzleOrcamentoRepository` (001) para estender `DrizzleTenantScopedRepositoryBase` (T008), garantindo `SET LOCAL` em toda transação, em `src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-orcamento.repository.ts`.

**Checkpoint**: BC Ingestão & Identificação (001) totalmente tenant-scoped em todas as 4 camadas; suíte adversarial de T010/T011 passando.

---

## Phase 4: User Story 2 - Exportação de relatório de auditoria via API (Priority: P2)

**Goal**: API de exportação retorna histórico de rastreabilidade (origem, canal, timestamps, decisões de agente) filtrado por período/fornecedor/status, restrito ao tenant solicitante.

**Independent Test**: publicar eventos de teste de dois tenants distintos no `nexo-dominio-bus`, chamar `GET /v1/auditoria/orcamentos/export` autenticado como Tenant A — resposta contém apenas eventos de Tenant A, paginação funcional, filtros aplicados corretamente.

### Tests for User Story 2

- [ ] T019 [P] [US2] Teste de contrato: `GET /v1/auditoria/orcamentos/export` sem JWT válido retorna 401; com JWT de Tenant A nunca retorna evento de Tenant B, em `tests/bounded-contexts/acompanhamento/contract/exportacao-auditoria.test.ts`.
- [ ] T020 [P] [US2] Teste unit: `FiltroExportacaoAuditoria` rejeita `periodo.fim < periodo.inicio`, em `tests/bounded-contexts/acompanhamento/domain/filtro-exportacao-auditoria.test.ts`.
- [ ] T021 [P] [US2] Teste unit/integração: consumidor `RegistrarEventoNaTrilha` é idempotente sob redelivery SQS (mesmo evento duas vezes não duplica linha), em `tests/bounded-contexts/acompanhamento/application/registrar-evento-na-trilha.test.ts`.

### Implementation for User Story 2

- [ ] T022 [P] [US2] Criar read model `TrilhaAuditoriaEvento` em `src/bounded-contexts/acompanhamento/domain/read-models/trilha-auditoria-evento.ts`.
- [ ] T023 [P] [US2] Criar VO `FiltroExportacaoAuditoria` em `src/bounded-contexts/acompanhamento/domain/value-objects/filtro-exportacao-auditoria.ts`.
- [ ] T024 [US2] Criar tabela `auditoria_trilha_eventos` (Drizzle schema + migration, append-only, RLS habilitada, `UNIQUE(orcamentoId, tipoEvento, ocorreuEm)`) em `src/bounded-contexts/acompanhamento/infrastructure/persistence/schema/`.
- [ ] T025 [US2] Criar regra EventBridge no `nexo-dominio-bus` roteando todo `detail-type` de `source` iniciado em `nexo.` para nova fila `acompanhamento-auditoria-queue` (+ DLQ + alarme CloudWatch, mesmo padrão de 001).
- [ ] T026 [US2] Implementar caso de uso `RegistrarEventoNaTrilha` (consumidor SQS) em `src/bounded-contexts/acompanhamento/application/use-cases/registrar-evento-na-trilha.ts` — `ON CONFLICT DO NOTHING` para idempotência.
- [ ] T027 [US2] Implementar caso de uso `ExportarRelatorioAuditoria` (query paginada, cursor-based) em `src/bounded-contexts/acompanhamento/application/use-cases/exportar-relatorio-auditoria.ts`.
- [ ] T028 [US2] Implementar `DrizzleTrilhaAuditoriaRepository` (estendendo `DrizzleTenantScopedRepositoryBase`) em `src/bounded-contexts/acompanhamento/infrastructure/persistence/drizzle-trilha-auditoria.repository.ts`.
- [ ] T029 [US2] Implementar controller `GET /v1/auditoria/orcamentos/export` + Zod schemas de filtro/paginação + Problem Details em `src/bounded-contexts/acompanhamento/interface/http/`.
- [ ] T030 [US2] Implementar handler Lambda consumidor de `acompanhamento-auditoria-queue` em `src/bounded-contexts/acompanhamento/interface/events/`.
- [ ] T031 [P] [US2] Criar `AcompanhamentoAuditoriaConsumerLambdaRole` e `ExportarAuditoriaLambdaRole` (least privilege, sem `BYPASSRLS` — depende de T009).

**Checkpoint**: exportação de auditoria funcional, tenant-scoped, consumindo eventos de 001 sem bloquear seu pipeline.

---

## Phase 5: User Story 3 - Continuidade dos contratos de dado já existentes (Priority: P2)

**Goal**: contexto de tenant preservado e consultável em toda capacidade já especificada (001–005), sem exigir reprocessamento retroativo, sem mudar comportamento de negócio das specs anteriores.

**Independent Test**: revisar `specs/001-ingestao-classificacao-orcamentos/plan.md` e confirmar que a nota de amendment (ADR-005) está registrada; confirmar que specs 002–005 (ainda não planejadas) referenciam esta spec como pré-requisito de convenção antes de seu próprio `speckit-plan`.

### Implementation for User Story 3

- [ ] T032 [US3] Adicionar nota de amendment em `specs/001-ingestao-classificacao-orcamentos/plan.md` (seção "Convenções estabelecidas nesta spec") referenciando ADR-005 desta spec (`tenantId` obrigatório no envelope de evento, `schemaVersion: 2`) — sem reabrir o Constitution Check original de 001.
- [ ] T033 [US3] Registrar em `specs/002-extracao-dados-orcamento/spec.md`, `specs/003-validacao-consistencia-orcamentos/spec.md`, `specs/004-indexacao-busca-semantica-orcamentos/spec.md`, `specs/005-orquestracao-workflow-integracoes/spec.md` — referência cruzada de que, quando planejadas (`speckit-plan`), MUST adotar `TenantId` (Shared Kernel), envelope de evento com `tenantId`, e RLS desde a primeira versão do schema (convenções #2–#5 do `plan.md` desta spec).
- [ ] T034 [US3] Confirmar, antes do cutover de T015, se já existe tenant real em produção (ver ADR-005 "Riscos remanescentes") — se sim, implementar suporte dual v1/v2 em vez do cutover único; se não, proceder com T015 como desenhado.

**Checkpoint**: convenção de tenant é rastreável e vinculante para todas as specs restantes do roadmap, sem retrabalho retroativo além do já registrado.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: robustez e observabilidade do mecanismo transversal.

- [ ] T035 [P] Logs estruturados (pino) incluindo `tenantId` e `orcamentoId` em toda correlação de request/evento tocado por esta spec, em `src/interface/shared/` e nos handlers novos de Acompanhamento.
- [ ] T036 [P] Métrica/alarme CloudWatch para "requisição rejeitada por `TenantContextMiddleware`" (sinaliza tentativa de acesso sem claim válida — não é erro esperado em operação normal).
- [ ] T037 Validar meta de performance: medir overhead de RLS (`current_setting()` por query) nos casos de uso já medidos em 001; registrar resultado, sem otimização prematura sem medição.
- [ ] T038 Atualizar OpenAPI gerado a partir dos schemas Zod para incluir o novo endpoint de exportação de auditoria.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode iniciar imediatamente.
- **Foundational (Phase 2)**: depende de Phase 1 — BLOQUEIA todas as user stories.
- **US1 (Phase 3)**: depende de Phase 2. Bloqueia parcialmente US2 (T031 depende de T009; T027/T029 não dependem de US1 diretamente, mas reaproveitam T008).
- **US2 (Phase 4)**: depende de Phase 2; pode rodar em paralelo com US1 depois do checkpoint de Phase 2 (times diferentes), mas T025 depende de eventos v2 de US1 (T015) para consumir `tenantId` corretamente — portanto T025 em diante depende de T015.
- **US3 (Phase 5)**: depende de US1 completa (T015, para T032) — é essencialmente documentação/rastreabilidade do que foi decidido, não implementação nova.
- **Polish (Phase 6)**: depende de US1 e US2 completas.

### Parallel Opportunities

- T001–T003 (Setup) em paralelo.
- T006, T010 (Foundational) em paralelo entre si após T005/T007.
- T011–T013, T019–T021 (testes) em paralelo dentro de cada user story.
- T022, T023 (US2, entidades de domínio) em paralelo.
- T035, T036 (Polish) em paralelo.

### Riscos de sequenciamento a observar

- T025 (regra EventBridge de Acompanhamento) só deve ser ativada em produção depois de T015 (eventos v2 com `tenantId`) estar implantado — ativar a regra antes geraria linhas de auditoria sem `tenantId`, violando o próprio guardrail desta spec.
- T009 (checklist `BYPASSRLS`) é pré-requisito de aceite de T018 e T028 — nenhum repositório tenant-scoped MUST ser considerado "pronto" sem essa verificação de infraestrutura confirmada.
