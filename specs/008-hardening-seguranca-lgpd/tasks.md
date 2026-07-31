# Tasks: Hardening de Segurança e Conformidade LGPD

**Input**: Design documents from `specs/008-hardening-seguranca-lgpd/` (`spec.md`, `plan.md`)

**Tests**: incluídos — spec exige critérios de aceite testáveis; Domain/Application testados sem mock de rede, conforme convenção de 001.

**Organization**: tarefas agrupadas por User Story, priorizadas pelo guardrail não-negociável da spec (0 incidentes de exposição) e pela métrica de SLA de esquecimento. Cada task já em formato pronto para virar issue técnica no GitHub (título = descrição da task; corpo = contexto + critério de aceite), vinculada à issue de negócio do PM que originou a feature 008.

## Format: `[ID] [P?] [Story] Descrição — caminho de arquivo`

- **[P]**: paralelizável (arquivo diferente, sem dependência)
- **[Story]**: US1 Segregação de Ambientes · US2 Direito ao Esquecimento · US3 Trilha de Auditoria de Acesso · US4 Retenção Configurável por Categoria

## Path Conventions

Conforme `plan.md` desta spec e convenção herdada de 001: `src/platform/conformidade/{domain,application,infrastructure,interface}`, `src/platform/shared-value-objects/domain/`, extensão em `src/bounded-contexts/ingestao-identificacao/{application,infrastructure}`, testes em `tests/platform/...` e `tests/bounded-contexts/ingestao-identificacao/...`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: scaffolding de pastas e dependências, sem lógica de negócio.

- [x] T001 Criar estrutura de pastas `src/platform/conformidade/{domain,application,infrastructure,interface}` e `src/platform/shared-value-objects/domain/` conforme `plan.md` (Project Structure). (#302, PR #407)
- [x] T002 [P] Criar schema Drizzle inicial `platform` (migração) com tabelas vazias `solicitacoes_esquecimento`, `confirmacoes_anonimizacao`, `politicas_retencao`, `trilha_auditoria_acesso`, `contextos_com_dado_pessoal` em `src/platform/conformidade/infrastructure/persistence/schema/`. (#303, PR #407)
- [x] T003 [P] Configurar lint/format já existentes do monorepo para os novos diretórios (nenhuma config nova — apenas confirmar que `tsc --strict`/ESLint cobrem `src/platform/**`). (#304, PR #407)

**Checkpoint**: estrutura pronta, sem código de negócio ainda.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: VOs compartilhados (ADR-004) e contratos de evento que todas as 4 User Stories consomem.

**CRITICAL**: nenhuma User Story abaixo pode começar antes desta fase.

- [x] T004 [P] Implementar VO `CategoriaDocumento` (enum fechado, valor inicial `ORCAMENTO_FORNECEDOR`) em `src/platform/shared-value-objects/domain/categoria-documento.vo.ts` — teste unit em `tests/platform/shared-value-objects/categoria-documento.spec.ts`. (#305)
- [x] T005 [P] Implementar VO `PoliticaRetencao` (`categoria`, `prazoEmDias` positivo, `baseLegal`, `atualizadaEm`) em `src/platform/shared-value-objects/domain/politica-retencao.vo.ts` — teste unit cobrindo rejeição de `prazoEmDias <= 0`. (#306)
- [x] T006 [P] Implementar VO `DadoAnonimizado` (`campoOriginal`, `metodo: MASCARAMENTO|REMOCAO`, `aplicadoEm`, `solicitacaoId`, sem construtor que aceite valor original de volta) em `src/platform/shared-value-objects/domain/dado-anonimizado.vo.ts` — teste unit garantindo que a API do VO não expõe getter de valor original.
- [x] T007 [P] Implementar VO `ReferenciaTitular` em `src/platform/conformidade/domain/value-objects/referencia-titular.vo.ts`. (#308, PR #441)
- [x] T008 Definir contrato dos Domain Events (`SolicitacaoEsquecimentoRegistrada`, `DadoPessoalAnonimizadoNoContexto`, `SolicitacaoEsquecimentoConcluida`, `SolicitacaoEsquecimentoPrazoExcedido`, `RetencaoAplicadaNoContexto`) como tipos TS em `src/platform/conformidade/domain/events/` — cada um com `schemaVersion: 1` e os campos definidos em `plan.md`. Depende de T004–T007.
- [x] T009 Reaproveitar (import, não reimplementar) `EventPublisher`/`EventBridgePublisher` já estabelecido em 001 — confirmar publicação no mesmo bus `nexo-dominio-bus`, `detail-type` = nome do evento, `source = nexo.conformidade` para eventos publicados pelo componente de plataforma. (#310)
- [ ] T010 Popular manualmente a tabela `platform.contextos_com_dado_pessoal` com a linha `ingestao-identificacao` (único BC arquitetado até aqui) — registrar como dado de seed, não hardcode em código de domínio.

**Checkpoint**: VOs e contratos de evento prontos — User Stories podem começar em paralelo.

---

## Phase 3: User Story 1 - Segregação de Ambientes (Priority: P1) 🎯 Guardrail crítico

**Goal**: garantir que dado real de produção nunca esteja presente ou acessível em dev/homologação — guardrail não-negociável da spec (meta: 0 incidentes).

**Independent Test**: tentar (em ambiente de teste controlado) promover um snapshot de prod para hml via pipeline de CI/CD e confirmar bloqueio pela SCP; auditoria de configuração confirma ausência de dado de prod fora da conta de prod.

### Tests for User Story 1

- [ ] T011 [P] [US1] Teste de infraestrutura (via `cdk-nag`/`aws-cli` em pipeline, documentado como script para Ricardo/DevOps executarem) validando que a SCP da conta dev/hml bloqueia `rds:CopyDBSnapshot`/`rds:RestoreDBInstanceFromDBSnapshot` e `s3:CopyObject` com origem na conta prod.
- [ ] T012 [P] [US1] Teste de contrato garantindo que a role de deploy de CI/CD de um ambiente não assume role de outro ambiente (verificação de `sts:AssumeRole` restrito por conta).

### Implementation for User Story 1

- [ ] T013 [US1] Provisionar 3 contas AWS (dev, hml, prod) sob a mesma AWS Organization (IaC — Ricardo/DevOps; este item é entregue como especificação de infraestrutura, não código de aplicação).
- [ ] T014 [US1] Definir e aplicar Service Control Policy bloqueando cópia direta de snapshot RDS/objeto S3 de prod para dev/hml sem passar por pipeline de anonimização.
- [ ] T015 [US1] Configurar roles de deploy do GitHub Actions (OIDC) uma por conta/ambiente — nunca uma role única com acesso multi-conta.
- [ ] T016 [US1] Implementar (ou documentar como reaproveitamento) o pipeline de seed anonimizado para hml, que invoca o mesmo caso de uso `AnonimizarDadoPessoalDoOrcamento` (US2) como etapa obrigatória antes de qualquer carga de dado "realista" em hml — depende de T024.
- [ ] T017 [US1] [P] Provisionar GuardDuty + Security Hub + AWS Config (conformance pack básico) nas 3 contas — mecanismo de detecção de ameaça/desvio exigido pela spec como "deve existir e funcionar".

**Checkpoint**: segregação de ambiente verificável independentemente das demais stories.

---

## Phase 4: User Story 2 - Direito ao Esquecimento (Priority: P1) 🎯 SLA de LGPD

**Goal**: solicitação de exclusão/anonimização é atendida dentro do prazo definido, sem apagar o restante da trilha de rastreabilidade.

**Independent Test**: registrar uma solicitação via `POST /v1/conformidade/solicitacoes-esquecimento`, aguardar (ou simular) a confirmação do único BC configurado (`ingestao-identificacao`), verificar transição para `CONCLUIDA` e que o `historico` do orçamento afetado permanece consultável com o campo pessoal marcado `[ANONIMIZADO]`.

### Tests for User Story 2

- [ ] T018 [P] [US2] Teste unit do agregado `SolicitacaoEsquecimento`: transição para `CONCLUIDA` só com 100% de `contextosEsperados` confirmados; rejeição de confirmação duplicada do mesmo contexto; nunca autoconclui por tempo.
- [ ] T019 [P] [US2] Teste unit do agregado: transição para `PRAZO_EXCEDIDO` quando `prazoLimite` expira sem cobertura total.
- [ ] T020 [P] [US2] Teste de contrato para `POST /v1/conformidade/solicitacoes-esquecimento` e `GET /v1/conformidade/solicitacoes-esquecimento/{id}` (Zod schema + Problem Details em erro).
- [ ] T021 [P] [US2] Teste unit do caso de uso `AnonimizarDadoPessoalDoOrcamento` do BC `ingestao-identificacao`: gera nova versão do dado (nunca sobrescreve o bruto — Princípio III), publica `DadoPessoalAnonimizadoNoContexto` mesmo quando não há dado pessoal daquele titular (`camposAnonimizados: []`).

### Implementation for User Story 2

- [ ] T022 [US2] Implementar agregado `SolicitacaoEsquecimento` em `src/platform/conformidade/domain/solicitacao-esquecimento.aggregate.ts` + VOs `StatusSolicitacao`, `ConfirmacaoAnonimizacao` em `src/platform/conformidade/domain/value-objects/`. Depende de T007, T008.
- [ ] T023 [US2] Implementar interface `SolicitacaoEsquecimentoRepository` (domain) + `DrizzleSolicitacaoEsquecimentoRepository` (infra) em `src/platform/conformidade/infrastructure/persistence/`.
- [ ] T024 [US2] [P] Implementar caso de uso `RegistrarSolicitacaoEsquecimento` em `src/platform/conformidade/application/use-cases/registrar-solicitacao-esquecimento.ts` — resolve `contextosEsperados` a partir de `platform.contextos_com_dado_pessoal` (T010), publica `SolicitacaoEsquecimentoRegistrada`.
- [ ] T025 [US2] [P] Implementar caso de uso `AcompanharConfirmacoesDeAnonimizacao` (consumidor SQS de `DadoPessoalAnonimizadoNoContexto`) em `src/platform/conformidade/application/use-cases/acompanhar-confirmacoes-de-anonimizacao.ts`.
- [ ] T026 [US2] Implementar job agendado `VerificarPrazoDasSolicitacoes` (EventBridge Scheduler, diário) em `src/platform/conformidade/application/use-cases/verificar-prazo-das-solicitacoes.ts`.
- [ ] T027 [US2] Implementar caso de uso `AnonimizarDadoPessoalDoOrcamento` no BC `ingestao-identificacao`, em `src/bounded-contexts/ingestao-identificacao/application/use-cases/anonimizar-dado-pessoal-do-orcamento.ts` — consumidor de `SolicitacaoEsquecimentoRegistrada`; decide localmente (Domain do próprio BC) quais campos de `Orcamento` são dado pessoal.
- [ ] T028 [US2] Implementar endpoints REST `POST /v1/conformidade/solicitacoes-esquecimento` e `GET /v1/conformidade/solicitacoes-esquecimento/{id}` em `src/platform/conformidade/interface/http/` — RBAC Cognito grupo `compliance-admin`, Zod na borda, Problem Details em erro. Depende de T024, T020.
- [ ] T029 [US2] IAM: criar `ConformidadeLambdaRole` sem `s3:GetObject`/`s3:PutObject` em bucket de nenhum BC — least privilege.

**Checkpoint**: fluxo completo de esquecimento testável de ponta a ponta, independente de US1/US3/US4.

---

## Phase 5: User Story 3 - Trilha de Auditoria de Acesso (Priority: P2)

**Goal**: toda ação sobre dado de orçamento ou infraestrutura correlata é reconstruível a partir do `orcamentoId`.

**Independent Test**: executar uma consulta de leitura sobre um orçamento existente (ex.: `GET /v1/orcamentos/{id}/status` de 001) e confirmar, via `GET /v1/conformidade/auditoria/{orcamentoId}`, que a ação aparece na trilha agregada com ator, timestamp e ação.

### Tests for User Story 3

- [ ] T030 [P] [US3] Teste unit do decorator `AuditoriaAccessLogger`: toda invocação decorada grava exatamente uma linha em `platform.trilha_auditoria_acesso`, mesmo em caso de exceção do caso de uso decorado.
- [ ] T031 [P] [US3] Teste de contrato para `GET /v1/conformidade/auditoria/{orcamentoId}` — confirma agregação de (a) histórico de pipeline do BC via sua API pública e (b) `trilha_auditoria_acesso`, sem acesso direto à tabela interna do BC.

### Implementation for User Story 3

- [ ] T032 [US3] Implementar `AuditoriaAccessLogger` (decorator/middleware de Application Service, sem regra de negócio) em `src/platform/conformidade/infrastructure/auditoria/auditoria-access-logger.ts`.
- [ ] T033 [US3] Aplicar o decorator aos casos de uso de leitura/escrita existentes do BC `ingestao-identificacao` (`ConsultarStatusOrcamento`, `ConfirmarRevisaoHumana`) sem alterar sua lógica de negócio — apenas composição na fronteira de Application/Interface.
- [ ] T034 [US3] Implementar caso de uso `ConsultarTrilhaDeAuditoria(orcamentoId)` em `src/platform/conformidade/application/use-cases/consultar-trilha-de-auditoria.ts` — chama a API pública de cada BC (nunca sua tabela interna) + lê `platform.trilha_auditoria_acesso`.
- [ ] T035 [US3] Implementar endpoint `GET /v1/conformidade/auditoria/{orcamentoId}` — RBAC `compliance-admin` ou `gestor-de-compras` restrito ao próprio tenant (nota: enforcement completo de tenant depende de 007, ainda não arquitetada — registrar como dependência futura, não bloqueante aqui).
- [ ] T036 [US3] Confirmar que nenhuma role IAM (incluindo `compliance-admin`) tem `UPDATE`/`DELETE` sobre `platform.trilha_auditoria_acesso` — apenas `INSERT`/`SELECT`.

**Checkpoint**: trilha de auditoria de acesso testável independentemente, reaproveitável por qualquer BC futuro que aplique o mesmo decorator.

---

## Phase 6: User Story 4 - Retenção Configurável por Categoria (Priority: P2)

**Goal**: prazo de retenção ajustável por categoria de documento, sem deployment de código.

**Independent Test**: atualizar `prazoEmDias` de `ORCAMENTO_FORNECEDOR` via `PUT /v1/conformidade/politicas-retencao/ORCAMENTO_FORNECEDOR`, disparar manualmente o job de retenção do BC `ingestao-identificacao` (execução avulsa em ambiente de teste) e confirmar que o novo prazo é respeitado sem qualquer alteração de código/redeploy.

### Tests for User Story 4

- [ ] T037 [P] [US4] Teste de contrato para `PUT /v1/conformidade/politicas-retencao/{categoria}` e `GET /v1/conformidade/politicas-retencao` (RBAC, Zod, Problem Details).
- [ ] T038 [P] [US4] Teste unit do caso de uso `AplicarPoliticaRetencaoDoContexto` do BC `ingestao-identificacao`: identifica dados além do `prazoEmDias` vigente lido de `platform.politicas_retencao`; publica `RetencaoAplicadaNoContexto` mesmo quando nenhum dado é afetado (`quantidadeAfetada: 0`).

### Implementation for User Story 4

- [ ] T039 [US4] Implementar caso de uso `AtualizarPoliticaRetencao(categoria, prazoEmDias, baseLegal)` em `src/platform/conformidade/application/use-cases/atualizar-politica-retencao.ts` — grava em `platform.politicas_retencao`, RBAC `compliance-admin`.
- [ ] T040 [US4] Implementar endpoints `PUT /v1/conformidade/politicas-retencao/{categoria}` e `GET /v1/conformidade/politicas-retencao` em `src/platform/conformidade/interface/http/`.
- [ ] T041 [US4] Implementar caso de uso `AplicarPoliticaRetencaoDoContexto` no BC `ingestao-identificacao`, em `src/bounded-contexts/ingestao-identificacao/application/use-cases/aplicar-politica-retencao-do-contexto.ts` — job agendado (EventBridge Scheduler), leitura apenas de `platform.politicas_retencao`.
- [ ] T042 [US4] Configurar tag `categoria` no upload S3 (`nexo-orcamentos-raw`) desde `ReceberOrcamento` (001) para permitir lifecycle rule por categoria — ajuste mínimo no caso de uso já existente de 001, sem alterar seu contrato de evento.
- [ ] T043 [US4] Configurar S3 Lifecycle Rule parametrizada por tag `categoria` para expiração automática, complementando a expiração ativa via caso de uso (dado em Aurora precisa de anonimização ativa; dado em S3 pode usar lifecycle nativo).

**Checkpoint**: retenção configurável testável independentemente das demais stories.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Documentar no `README`/runbook de operações o procedimento manual de disparo do job de retenção e de verificação de prazo de esquecimento (para Ricardo/DevOps, fora do escopo deste agente).
- [ ] T045 [P] Revisão de segurança: `npm audit`/`osv-scanner`/Semgrep sobre os novos módulos `src/platform/**` (execução cabe a Ricardo/CI, não a este agente).
- [ ] T046 Registrar em `plan.md` de 002–007 (ao serem arquitetadas) a obrigação estrutural de implementar `AnonimizarDadoPessoalDoOrcamento` e `AplicarPoliticaRetencaoDoContexto` locais, e a linha correspondente em `platform.contextos_com_dado_pessoal`.
- [ ] T047 Rodar `speckit-analyze` (já executado nesta entrega — ver seção de consistência do plano) após qualquer alteração futura de `spec.md`/`plan.md`/`tasks.md` desta feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as 4 User Stories.
- **US1 (Segregação)**: depende de Foundational; T016 depende de T024 (US2) — única dependência cross-story, documentada explicitamente.
- **US2 (Esquecimento)**: depende de Foundational (T004–T010). Independente de US1/US3/US4, exceto pela dependência inversa de T016 (US1) sobre T024.
- **US3 (Auditoria)**: depende de Foundational. Independente das demais.
- **US4 (Retenção)**: depende de Foundational. Independente das demais.
- **Polish (Phase 7)**: depende de todas as User Stories desejadas estarem completas.

### Parallel Opportunities

- T004–T007 (VOs) paralelizáveis entre si.
- Após Foundational: US2, US3, US4 podem ser trabalhadas em paralelo por desenvolvedores diferentes; US1 pode iniciar em paralelo mas seu item T016 aguarda T024 de US2.
- Dentro de cada User Story, tasks marcadas `[P]` (arquivos distintos, sem dependência) são paralelizáveis.

---

## Implementation Strategy

### MVP First

1. Completar Setup + Foundational.
2. Completar US2 (Direito ao Esquecimento) — maior exposição regulatória direta (SLA explícito na spec).
3. Completar US1 (Segregação de Ambientes) — guardrail crítico, mas majoritariamente infraestrutura, pode correr em paralelo com US2 por outra pessoa/DevOps.
4. Completar US3 e US4 — reforçam auditoria e retenção, sem bloquear as duas primeiras.

### Rastreabilidade para GitHub Issues

Cada task acima MUST virar uma issue técnica com: título = texto da task; corpo = trecho correspondente de `plan.md` (seção Application/Infrastructure/Interface referenciada) + critério de aceite extraído de `spec.md`; label de fase (`US1`..`US4`); vínculo à issue de negócio do PM que originou a feature 008. A criação efetiva das issues e o label `ready-for-dev` cabem ao pipeline de automação ou a Ricardo — não a este agente.
