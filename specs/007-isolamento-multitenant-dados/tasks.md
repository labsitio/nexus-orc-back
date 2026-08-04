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
- [x] T005 Implementar `TenantContextMiddleware` (plugin Fastify) em `src/interface/shared/tenant-context.middleware.ts` — extrai/valida claim JWT, popula `request.tenantContext`, rejeita com 401 Problem Details se ausente/inválida. Nunca aceita `tenantId` de query/path/body. (#268)
- [x] T006 [P] Criar tabela `sftp_tenant_mapping` (Drizzle schema + migration) e resolver `tenantId` no trigger Lambda do canal SFTP a partir do mapeamento usuário/servidor (nunca do conteúdo do arquivo). Resolução via tags `aws:transfer:server-id`/`aws:transfer:user-name` (AWS Transfer Family tagueia o objeto S3 automaticamente) + `SftpTenantMappingRepository`. `ReceberOrcamento` ainda não exige `tenantId` (T016 formaliza) — resolvido/logado nesta fase Foundational. (#269)
- [x] T007 Habilitar RLS no Aurora Serverless v2: migration adicionando `tenant_id UUID NOT NULL` + `CREATE POLICY tenant_isolation ... USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` nas tabelas `orcamentos` e `orcamentos_historico` (retrofit de 001). (#270)
- [x] T008 Implementar `DrizzleTenantScopedRepositoryBase` em `src/shared-kernel/tenant/` (ou infra compartilhada equivalente) — executa `SET LOCAL app.current_tenant_id = $1` no início de toda transação, `$1` vindo exclusivamente do `TenantContext` validado em T005. (#271)
- [x] T009 Checklist de infraestrutura (Terraform/CDK): garantir que nenhuma role IAM/DB de Lambda que acesse tabela tenant-scoped tenha `BYPASSRLS`. Aplicar a `ClassificadorLambdaRole`, `ReceberOrcamentoLambdaRole`, `ConfirmarRevisaoHumanaLambdaRole`, `ConsultaStatusLambdaRole` (001) e às novas roles de Acompanhamento (T019). Entregue como checklist em `specs/007-isolamento-multitenant-dados/infra/checklist-bypassrls-iam-roles.md` — camada IAM confirmada nas 3 roles hoje existentes em CDK; camada Postgres (`NOSUPERUSER NOBYPASSRLS`) especificada e testada adversarialmente em CI (T010); verificação contra Aurora real por ambiente rastreada operacionalmente, fora do escopo de código deste repositório. (#272)
- [x] T010 [P] Suíte de teste adversarial em `tests/security/isolamento-multitenant/` — tenta ler cross-tenant via: (a) repositório com `tenantId` trocado após `SET LOCAL` de outro tenant; (b) sessão DB sem `SET LOCAL` (deve retornar zero linhas, nunca todas); (c) query param `tenantId` forjado na Interface (deve ser ignorado, claim do JWT prevalece). MUST falhar em toda tentativa de retornar dado cross-tenant. (a)/(b) cobertos em `tests/security/isolamento-multitenant/repositorio-tenant-scoped-adversarial.test.ts` (via `DrizzleTenantScopedRepositoryBase`, T008); (c) já coberto em `tests/interface/shared/tenant-context.middleware.test.ts` (T005). (#273)

**Checkpoint**: mecanismo de isolamento (4 camadas) funcional e testado adversarialmente antes de qualquer user story avançar.

---

## Phase 3: User Story 1 - Isolamento de dado por tenant (Priority: P1) 🎯 Guardrail crítico

**Goal**: nenhuma consulta/busca/exportação via API retorna dado de tenant diferente do solicitante, sob nenhuma condição, incluindo erro de sistema.

**Independent Test**: executar a suíte adversarial de T010 contra os endpoints já existentes de 001 (`GET /v1/orcamentos/{id}/status`, `POST /v1/orcamentos/{id}/revisao-humana`) autenticados como Tenant A tentando acessar `orcamentoId` pertencente a Tenant B — MUST retornar 404 Problem Details (nunca revelar existência cross-tenant via 403).

### Tests for User Story 1

- [x] T011 [P] [US1] Teste de contrato: `GET /v1/orcamentos/{id}/status` com JWT de Tenant A e `orcamentoId` de Tenant B retorna 404, não 200/403, em `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`. Escrito em RED (`it.fails`, documentado): agregado `Orcamento` ainda não carrega `tenantId` (T014-T018 pendentes) — hoje o endpoint retorna 200 para qualquer tenant. (#274)
- [x] T012 [P] [US1] Teste unit: `Orcamento.aggregate` lança `TenantIdImutavelError` em tentativa de sobrescrever `tenantId` pós-criação, em `tests/bounded-contexts/ingestao-identificacao/domain/orcamento-tenant.test.ts`. Escrito em RED (`it.fails`, documentado, mesmo padrão de T011): agregado ainda não carrega `tenantId` (T014 pendente). (#275)
- [x] T013 [P] [US1] Teste unit: `TenantId` VO rejeita formato inválido, em `tests/shared-kernel/tenant/tenant-id.vo.test.ts` (arquivo já criado em T001; adicionados casos de string vazia e variant nibble inválido para completar a cobertura de "formato inválido"). (#276)

### Implementation for User Story 1

- [x] T014 [US1] Adicionar atributo `tenantId: TenantId` (obrigatório, imutável) ao agregado `Orcamento` em `src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.ts`; invariante `TenantIdImutavelError`. Implementado como `tenantId?: TenantId` (expand/contract): obrigatório quebraria compilação de #279/#280/#281, que ainda não preenchem o campo — PR de contrato futura torna-o obrigatório nos 4 BCs de uma vez. (#277, PR #627)
- [x] T015 [US1] Atualizar os 4 Domain Events de 001 (`src/bounded-contexts/ingestao-identificacao/domain/events/`) para incluir `tenantId` no payload, `schemaVersion: 2` (ADR-005). Diretório tem 4 arquivos de evento (`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`, `OrcamentoReclassificadoPorRevisaoHumana`), não 5 — divergência do texto original registrada em comentário na issue #278. Implementado como `tenantId?: string` opcional no envelope e nas 4 classes (mesmo padrão expand/contract de T014/#277): `schemaVersion` mantido em `1`, obrigatório quebraria a build de #279 (`receber-orcamento.ts`), #280 (demais casos de uso) e #281 (repositório Drizzle), que ainda não preenchem o campo. PR de contrato futura torna `tenantId` obrigatório e sobe `schemaVersion` para `2` nos 4 BCs de uma vez (ADR-008 — cutover único, sem suporte dual v1/v2 publicado; o opcional é estado interno de compilação, não contrato publicado). (#278, PR #629)
- [x] T016 [US1] Atualizar `ReceberOrcamento` (Application) para receber `tenantId` obrigatório do `TenantContext` (nunca do body) e propagá-lo à criação do agregado, em `src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.ts`. Escopo estendido aos 2 sites de chamada reais (o título fala só do use case, mas obrigatório na entrada quebraria a build sem eles): `confirmar-upload.controller.ts` lê `request.tenantContext.tenantId` (populado pelo `TenantContextMiddleware`, nunca do body Zod) e devolve 401 Problem Details se ausente; `sftp-upload.handler.ts` já resolvia `tenantId` via `SftpTenantResolverGateway` (T006) — agora propaga ao `ReceberOrcamento` e pula (log + `continue`, sem lançar) o registro quando o mapeamento usuário/servidor está ausente, já que o parâmetro passou a ser obrigatório. `upload-url.controller.ts` não chama `ReceberOrcamento` (só gera a URL presigned, ADR-002) — sem alteração. `composition/ingestao-identificacao.ts` não chama `.executar()` diretamente — compila sem alteração; wiring de produção do `TenantContextMiddleware` como `preHandler` real ainda não existe em nenhum BC (nem no já pronto BC 004) — fora de escopo desta issue, é wiring de composition root/handler Lambda. (#279)
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
- [x] T034 [US3] Confirmar, antes do cutover de T015, se já existe tenant real em produção (ver ADR-005 "Riscos remanescentes") — se sim, implementar suporte dual v1/v2 em vez do cutover único; se não, proceder com T015 como desenhado. **Confirmado (2026-08-03, #297)**: não há tenant real em produção. Mesma evidência de T045/#587: `grep -rl 'lambda\.Function\|NodejsFunction' infra/` e `grep -rl 'export const handler' src/` não retornam nenhum resultado — zero handler Lambda de produção existe para 001 (nem para 002-005); `docs/plano-finalizacao.md` §1 confirma "zero produção implantável hoje". T015 (#278) ainda não implementada em código (`grep -rl tenantId src/bounded-contexts/ingestao-identificacao/domain/events/` vazio) — a confirmação vale como pré-condição para quando T015 for implementada. Decisão: cutover único direto (breaking) para T015, sem suporte dual v1/v2.

**Checkpoint**: convenção de tenant é rastreável e vinculante para todas as specs restantes do roadmap, sem retrabalho retroativo além do já registrado.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: robustez e observabilidade do mecanismo transversal.

- [ ] T035 [P] Logs estruturados (pino) incluindo `tenantId` e `orcamentoId` em toda correlação de request/evento tocado por esta spec, em `src/interface/shared/` e nos handlers novos de Acompanhamento.
- [ ] T036 [P] Métrica/alarme CloudWatch para "requisição rejeitada por `TenantContextMiddleware`" (sinaliza tentativa de acesso sem claim válida — não é erro esperado em operação normal).
- [ ] T037 Validar meta de performance: medir overhead de RLS (`current_setting()` por query) nos casos de uso já medidos em 001; registrar resultado, sem otimização prematura sem medição.
- [ ] T038 Atualizar OpenAPI gerado a partir dos schemas Zod para incluir o novo endpoint de exportação de auditoria.

---

## Phase 7: Retrofit real de `tenantId` em 002/003/004/005 (ADR-008)

**Purpose**: T033 só deixou nota de referência cruzada nos `spec.md` de 002–005 assumindo que ainda seriam planejadas — premissa quebrada, essas specs já existem sem `tenantId` em nenhum Domain Event. Esta fase é o retrofit de código real, gate explícito de `#190` (004 T030).

**⚠️ CRITICAL**: nenhuma task desta fase roda em paralelo com a seguinte — cada uma consome o `schemaVersion: 2` publicado pela anterior. Ver ADR-008.

- [x] T039 [P] Adicionar nota de amendment (ADR-008 desta spec) em `specs/002-extracao-dados-orcamento/plan.md`, `specs/003-validacao-consistencia-orcamentos/plan.md`, `specs/004-indexacao-busca-semantica-orcamentos/plan.md`, `specs/005-orquestracao-workflow-integracoes/plan.md` — mesma mecânica de T032, apontando para T040–T044 como o retrofit real (sem reabrir o Constitution Check original de cada spec).
- [x] T040 Atualizar os 2 Domain Events de 002 (`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`, `src/bounded-contexts/extracao/domain/events/domain-event.ts` + os 2 arquivos de evento) para incluir `tenantId: string` (extraído do envelope v2 de 001 pelo ACL já existente de 002, nunca inferido) e `schemaVersion: 2`. Depende de T015 mergeada (#278). Diretório `src/bounded-contexts/extracao/domain/events/` tem 3 arquivos de evento, não 2: `orcamento-extraido.event.ts`, `orcamento-extraido-pendencia-confirmada.event.ts` (ambos citados no texto original, escopo desta task) e `extracao-escalonada-revisao-humana.event.ts` (não citado — fora de escopo, permanece sem `tenantId`; divergência registrada em comentário na issue #582). Implementado como `tenantId?: string` opcional no envelope e nas 2 classes em escopo (mesmo padrão expand/contract de T014/T015): `schemaVersion` mantido em `1`, obrigatório quebraria a build dos sites de emissão de `extrair-dados-orcamento.ts`/`confirmar-revisao-humana-extracao.ts`, que ainda não preenchem o campo. PR de contrato futura torna `tenantId` obrigatório e sobe `schemaVersion` para `2` nos 4 BCs de uma vez (ADR-008 — cutover único, sem suporte dual v1/v2 publicado). (#582, PR #630)
- [ ] T041 Atualizar os 3 Domain Events de 003 (`src/bounded-contexts/validacao/domain/events/domain-event.ts` + `orcamento-validado.event.ts`, `orcamento-validado-com-ressalva.event.ts`, `orcamento-inconsistencia-detectada.event.ts`) para incluir `tenantId: string` **no mesmo bump** de `schemaVersion: 2` já exigido por ADR-003 de `specs/004-indexacao-busca-semantica-orcamentos/plan.md` (`itens`/`condicoesComerciais`, coordenação fechada em #166, código ainda não escrito) — um único PR, não dois. `tenantId` extraído do envelope v2 de 002 via `OrcamentoExtraidoEventACL` de 003. Depende de T040.
- [ ] T042 Atualizar `OrcamentoValidadoEventACL` (spec 004 T018, `src/bounded-contexts/busca-indexacao/infrastructure/`) para extrair `tenantId` do envelope v2 de 003 (T041) e propagá-lo ao caso de uso `IndexarOrcamento` (já recebe `tenantId` como parâmetro dedicado, PR #574). Depende de T041.
- [ ] T043 Gate de desbloqueio: spec 004 T030/#190 (handler Lambda SQS `indexador-queue`) só pode ser implementada e mergeada depois de T042 mergeada — sem essa ordem, o handler não tem de onde extrair `tenantId` do evento `OrcamentoValidado` recebido. Nenhuma alteração de código nesta task, apenas remoção do bloqueio (T030 já está desenhada corretamente em `specs/004-.../tasks.md`).
- [ ] T044 [P] Atualizar os Domain Events publicados por 005 (Orquestração, `src/bounded-contexts/orquestracao/domain/events/`) e o contexto consolidado (ADR-001 de 005) para incluir `tenantId`, extraído dos 3 eventos upstream (001/002/003, já v2 após T040/T041). Depende de T040 e T041.
- [x] T045 Confirmar, antes de cada cutover (T040, T041, T044), se já existe tenant real em produção usando 002/003/004/005 (mesma checagem de T034, estendida) — se sim, leitura dual v1/v2 obrigatória para aquele BC específico; se não, cutover único como desenhado. **Confirmado (2026-08-03, #587)**: não há tenant real em produção. Evidência verificada: `grep -rl 'lambda\.Function\|NodejsFunction' infra/` e `grep -rl 'export const handler' src/` não retornam nenhum resultado — zero handler Lambda de produção existe para 002/003/004/005 (nem para 001); `src/composition/` (composition root) segue não commitado; `docs/plano-finalizacao.md` §1 confirma "zero produção implantável hoje". Sem deploy, não há consumidor real de `schemaVersion: 1` a proteger — baseline "0 tenants reais em produção" de ADR-005/ADR-008 permanece válida para as 4 specs. Decisão: cutover único direto (breaking) para 002, 003, 004 e 005, sem leitura dual v1/v2, conforme já desenhado em T040-T044. Mesma evidência aplica-se a T034/#297 (001) — a confirmar/registrar naquela issue quando reservada.

**Checkpoint**: `tenantId` propagado de ponta a ponta em 001→002→003→(004|005); `#190` desbloqueada e implementável; nenhum ponto do pipeline aceita `tenantId` inventado, inferido do payload ou consultado de tabela de outro BC.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode iniciar imediatamente.
- **Foundational (Phase 2)**: depende de Phase 1 — BLOQUEIA todas as user stories.
- **US1 (Phase 3)**: depende de Phase 2. Bloqueia parcialmente US2 (T031 depende de T009; T027/T029 não dependem de US1 diretamente, mas reaproveitam T008).
- **US2 (Phase 4)**: depende de Phase 2; pode rodar em paralelo com US1 depois do checkpoint de Phase 2 (times diferentes), mas T025 depende de eventos v2 de US1 (T015) para consumir `tenantId` corretamente — portanto T025 em diante depende de T015.
- **US3 (Phase 5)**: depende de US1 completa (T015, para T032) — é essencialmente documentação/rastreabilidade do que foi decidido, não implementação nova.
- **Polish (Phase 6)**: depende de US1 e US2 completas.
- **Retrofit 002–005 (Phase 7)**: depende de T015 (US1) mergeada. T040→T041→T042→T043 estritamente serial (cada uma consome o `schemaVersion: 2` publicado pela anterior); T044 depende de T040 e T041; T039 é documentação, pode rodar em paralelo a qualquer momento da fase.

### Parallel Opportunities

- T001–T003 (Setup) em paralelo.
- T006, T010 (Foundational) em paralelo entre si após T005/T007.
- T011–T013, T019–T021 (testes) em paralelo dentro de cada user story.
- T022, T023 (US2, entidades de domínio) em paralelo.
- T035, T036 (Polish) em paralelo.
- T039 (Phase 7) em paralelo com T040–T044 (é só documentação).

### Riscos de sequenciamento a observar

- T025 (regra EventBridge de Acompanhamento) só deve ser ativada em produção depois de T015 (eventos v2 com `tenantId`) estar implantado — ativar a regra antes geraria linhas de auditoria sem `tenantId`, violando o próprio guardrail desta spec.
- T009 (checklist `BYPASSRLS`) é pré-requisito de aceite de T018 e T028 — nenhum repositório tenant-scoped MUST ser considerado "pronto" sem essa verificação de infraestrutura confirmada.
- T040–T043 são a cadeia que trava `#190` (spec 004 T030) — nenhum agente `dev-back-end` deve implementar T030 antes de T042 estar mergeada (ver ADR-008).
