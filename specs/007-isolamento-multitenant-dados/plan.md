# Implementation Plan: Isolamento Multi-tenant de Dados e Exportação de Auditoria (Backend)

**Branch**: `007-isolamento-multitenant-dados` | **Date**: 2026-07-29 | **Spec**: `specs/007-isolamento-multitenant-dados/spec.md`

**Input**: Feature specification from `/specs/007-isolamento-multitenant-dados/spec.md` (status: clarified, versão 2, escopo reduzido a backend)

**Nota de convenção**: este plano estende as convenções vinculantes estabelecidas em `specs/001-ingestao-classificacao-orcamentos/plan.md` (nomenclatura de BC, formato de Domain Event, bus único, layout de pastas, `OrcamentoId` UUID v7, Drizzle/ADR-001). Não redefine nenhuma delas — adiciona um mecanismo transversal (tenant) que todo Bounded Context existente e futuro MUST adotar, e introduz um novo Bounded Context estritamente para o consumo de auditoria/exportação. Dois pontos são amendments explícitos ao já decidido em 001 (ver ADR-003 e ADR-005) — não alteração retroativa de decisão, adição de campo/regra sobre o que já existe.

## Summary

Requisito primário: (1) todo dado de orçamento em qualquer Bounded Context MUST ser isolado por tenant (rede varejista) de forma estrutural — nunca contornável por parâmetro de consulta, bug de aplicação ou falha de validação; (2) API de exportação de relatório de auditoria, restrita ao tenant solicitante, cobrindo o histórico de rastreabilidade (Princípio I) já produzido pelas specs 001–005.

Abordagem técnica: mecanismo compartilhado, não Bounded Context isolado. `TenantId` como Shared Kernel (VO único reaproveitado por todos os BCs — única exceção deliberada à regra "sem import direto entre contextos" de 001, porque aqui o requisito é irredutibilidade de um único conceito de identidade, não lógica de negócio). Isolamento em quatro camadas de defesa (Interface → Application → Repository → PostgreSQL Row-Level Security), sendo a RLS a garantia estrutural que satisfaz "nunca contornável mesmo em erro de aplicação". Exportação de auditoria modelada como um novo Bounded Context **Acompanhamento** (candidato já previsto no Context Map macro), escopo tático restrito nesta spec a um read model de trilha de auditoria alimentado por consumo dos eventos já publicados por 001–005 no `nexo-dominio-bus` — relação Customer/Supplier, nunca chamada direta, nunca bloqueia os BCs upstream.

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 (mesma baseline de 001 — Ricardo MUST reconfirmar LTS vigente no momento da implementação).

**Primary Dependencies**: Zod 4.4.x; AWS SDK v3 (`@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`, `@aws-sdk/client-cognito-identity-provider` para leitura de custom attribute); Fastify (plugin de tenant context); Drizzle ORM (mesmo ADR-001 de 001 — reaproveitado, nenhuma alternativa nova avaliada aqui).

**Storage**: Aurora Serverless v2 Postgres — mesma instância/cluster dos demais BCs (mecanismo de isolamento é lógico via RLS, não físico via cluster separado — ver ADR-003). Nova tabela `auditoria_trilha_eventos` (BC Acompanhamento, append-only).

**Testing**: Vitest para Domain/Application (TenantId VO, filtros de exportação); testes de integração adversariais dedicados — suíte que tenta ler cross-tenant deliberadamente (via repositório com tenantId trocado, via sessão DB sem `SET LOCAL`, via bypass de query param) e MUST sempre falhar em retornar dado (execução cabe a Ricardo/CI, não a este agente).

**Target Platform**: mesmo runtime AWS Lambda + Aurora Serverless v2 de 001; novo consumidor SQS dedicado para o BC Acompanhamento.

**Project Type**: Web service (API + pipeline de eventos assíncrono), mesmo monorepo único, sem frontend (Additional Constraint da constituição v1.2.0).

**Performance Goals**: isolamento não pode degradar p95 de nenhum caso de uso já medido em 001 (RLS adiciona overhead de `current_setting()` por query — aceitável, não medido ainda; medir após implementação). Exportação de auditoria: sem meta de latência definida na spec (não é caminho crítico do pipeline) — paginação obrigatória para não impor timeout de Lambda em tenant com grande volume histórico.

**Constraints**: guardrail "0 incidentes de vazamento cross-tenant, sempre" (métrica da spec) é não-negociável e domina toda decisão desta camada — onde houver trade-off entre conveniência/performance e garantia estrutural de isolamento, a garantia estrutural MUST vencer (ordem de prioridade da constituição: Segurança antes de Performance).

**Scale/Scope**: mecanismo transversal a 1 BC já planejado (Ingestão & Identificação, retrofit) + convenção vinculante para 4 BCs ainda não planejados (Extração, Validação, Busca & Indexação, Orquestração) + 1 Bounded Context novo (Acompanhamento, escopo tático restrito a auditoria/exportação). Nenhum tenant real em produção ainda (baseline da métrica) — retrofit sem necessidade de backfill de dado real.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0 — PASS em todos os princípios; uma exceção formal registrada (Complexity Tracking) para o Shared Kernel de `TenantId`.*

| Princípio / Constraint | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | BC Acompanhamento consome todos os eventos do bus e monta `auditoria_trilha_eventos` sem depender de log efêmero; exportação expõe exatamente essa trilha, restrita ao tenant | PASS |
| II. Desacoplamento por eventos | Acompanhamento é consumidor puro via EventBridge/SQS; nenhuma chamada direta a 001–005; falha do consumidor de auditoria (DLQ) MUST NUNCA bloquear o pipeline upstream | PASS |
| III. Dado bruto imutável | Não alterado por esta spec; `auditoria_trilha_eventos` é append-only (nunca UPDATE/DELETE) | PASS |
| IV. Exceção nunca silenciosa | Consumidor de auditoria com DLQ + alarme (mesmo padrão de 001); falha de RLS/tenant-context em qualquer request MUST responder 401/403 explícito, nunca "vazio silencioso" tratado como sucesso | PASS |
| V. IA generativa como motor de entendimento | Não aplicável — `envolve_ia_ou_agentes: false` na spec | N/A |
| VI. Serverless-first | RLS em Aurora Serverless v2 existente (sem cluster/schema por tenant, sem servidor fixo novo); consumidor de auditoria é Lambda+SQS | PASS |
| VII. Segurança e LGPD desde o desenho | Núcleo desta spec É o Princípio VII aplicado a multi-tenant; `tenant_id` nunca aceito de input não-autenticado; retenção/anonimização herdada das specs de origem, não redefinida aqui | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec é Fase 03 por natureza (Additional Constraint "Multi-tenant é requisito de Fase 03"), mas retrofit sobre 001 (Fase 01) é exatamente o que a constituição autoriza ("nenhuma decisão de Fase 01/02 MUST impedir introdução na Fase 03") | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI; exportação é endpoint JSON paginado, formato/tela de consumo é responsabilidade externa | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Não introduz agente de IA novo (`envolve_ia_ou_agentes: false`) | PASS |
| Additional Constraint — multi-tenant é Fase 03 | Esta spec É a introdução formal, não uma antecipação indevida | PASS |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação nova introduzida. Uma exceção de complexidade (Shared Kernel) permanece registrada e justificada em Complexity Tracking — aceita por ser mínima (um VO, sem lógica de negócio) e por servir diretamente o guardrail de segurança de prioridade 1.

## Convenções desta spec (vinculantes para specs 002–005 quando forem planejadas)

1. **`TenantId` é Shared Kernel** — único caso autorizado de import direto entre Bounded Contexts nesta base de código. Vive em `src/shared-kernel/tenant/tenant-id.vo.ts`. Contém apenas: validação de formato (UUID v7, mesma convenção de `OrcamentoId`), (de)serialização. MUST NUNCA acumular lógica de negócio — qualquer PR que adicione um método além de validação/serialização a este VO é uma violação de escopo do Shared Kernel e exige ADR de revisão.
2. **`tenantId` é atributo mandatório e imutável de todo agregado de orçamento em todo BC** — definido no momento de criação (para o BC Ingestão & Identificação, no Gateway de Ingestão, junto com `OrcamentoId`), nunca alterável depois. Qualquer tentativa de sobrescrita lança erro de domínio, mesmo padrão já usado para `referenciaBruta` em 001.
3. **Envelope de Domain Event ganha `tenantId` obrigatório** — amendment à convenção #3 de 001. A partir desta spec, todo evento publicado por qualquer BC MUST incluir `tenantId` junto de `schemaVersion`, `orcamentoId`, `ocorreuEm`. Como não há tenant real em produção ainda (baseline da métrica desta spec), o cutover é direto: eventos de 001 passam a `schemaVersion: 2` incluindo `tenantId`; não há necessidade de suportar consumidores de `schemaVersion: 1` em paralelo. **Ação de documentação pendente** (task desta spec, não decisão unilateral deste plano): adicionar nota de amendment em `specs/001-ingestao-classificacao-orcamentos/plan.md` referenciando este ADR-005, sem reabrir o Constitution Check original de 001.
4. **Toda query/repositório é tenant-scoped por assinatura, nunca por convenção implícita** — toda função de Application e todo método de Repository que leia ou escreva dado de orçamento MUST receber `tenantId: TenantId` como parâmetro explícito (nunca opcional, nunca lido de estado global mutável fora do mecanismo de RLS descrito no ADR-003). Isto vale para 002–005 no momento em que forem planejadas.
5. **`tenant_id` nunca é aceito como input de query param, path param ou body** — única fonte legítima é a claim verificada do JWT Cognito (`custom:tenant_id`) ou, no canal SFTP, o mapeamento usuário/servidor→tenant resolvido na Infrastructure (nunca do payload do arquivo).

## Bounded Context e Context Map (recorte desta spec)

```text
Mecanismo transversal (Shared Kernel — aplica-se a TODOS os BCs abaixo):
  TenantId (VO) --> presente em todo agregado de orçamento, todo evento, toda tabela

[BC: Ingestão & Identificação] --OrcamentoRecebido (v2, com tenantId)--> nexo-dominio-bus
[BC: Extração]                 --OrcamentoExtraido  (com tenantId, quando planejada)--> nexo-dominio-bus
[BC: Validação]                --OrcamentoValidado  (com tenantId, quando planejada)--> nexo-dominio-bus
[BC: Busca & Indexação]        --OrcamentoIndexado  (com tenantId, quando planejada)--> nexo-dominio-bus
[BC: Orquestração]             --(decisões de workflow, com tenantId, quando planejada)--> nexo-dominio-bus
                                              |
                                              v (consumo, nunca chamada direta)
                              [BC: Acompanhamento — escopo tático desta spec: Auditoria/Exportação]
                                              |
                              auditoria_trilha_eventos (append-only, tenant-scoped via RLS)
                                              |
                              GET /v1/auditoria/orcamentos/export (Interface, tenant do JWT)
```

Relação entre contextos: **Customer/Supplier** — Acompanhamento é estritamente downstream de todos os demais BCs (consumidor de eventos, nunca origem de decisão de negócio sobre o orçamento). **Shared Kernel** — `TenantId` entre todos os BCs, incluindo Acompanhamento, escopo mínimo conforme convenção #1 acima.

**Anti-Corruption Layer**: não introduzida nova nesta spec — Acompanhamento consome apenas o `detail` já validado/tipado dos eventos de domínio publicados pelos próprios BCs (que já passam por suas ACLs de origem, ex. `BedrockClassificacaoACL` em 001); não há fronteira de sistema externo aqui.

## Domain — Shared Kernel, Agregados, VOs, Domain Events

### Shared Kernel

- `TenantId` — VO, UUID v7, valida formato; sem lógica de negócio (ver convenção #1).

### BC Ingestão & Identificação (retrofit sobre o agregado `Orcamento` já existente em 001)

- **Novo atributo**: `tenantId: TenantId`, obrigatório, definido na criação (mesmo ponto onde `OrcamentoId` é gerado), imutável.
- **Nova invariante**: qualquer tentativa de sobrescrever `tenantId` após criação lança `TenantIdImutavelError` (mesmo padrão de `ReferenciaBrutaImutavelError`).
- **Evento afetado**: todos os 5 eventos de 001 (`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoBaixaConfiancaDetectada`, `OrcamentoEscalonadoParaRevisaoHumana`, `OrcamentoReclassificadoPorRevisaoHumana`) passam a incluir `tenantId` no payload, `schemaVersion: 2`.

### BC Acompanhamento (novo, escopo tático: Auditoria/Exportação)

- **Read Model** (não é agregado com invariantes de escrita de negócio — é projeção terminal, consumidora): `TrilhaAuditoriaEvento` — `{ tenantId, orcamentoId, tipoEvento, sourceBc, ocorreuEm, agenteOrigem (opcional), resumoPayload (jsonb, subconjunto sanitizado — nunca o texto bruto do fornecedor, apenas os campos relevantes para auditoria: fornecedorIdentificado, status, decisao), schemaVersion }`.
- **Value Object**: `FiltroExportacaoAuditoria` — `{ tenantId (obrigatório, nunca do input do cliente), periodo (opcional, `PeriodoValidade` — reaproveitar VO se já existir em BC de origem, senão criar equivalente local), fornecedorId (opcional), status (opcional, enum aberto por BC de origem) }`. Validação: `periodo.fim >= periodo.inicio`, mesmo padrão de VOs de 001.
- **Sem Domain Events publicados por este BC** nesta spec — é um consumidor terminal; se uma capacidade futura de Acompanhamento (ex. status agregado para o Portal) precisar publicar eventos próprios, é revisão de escopo explícita, não implícita (mesma regra da constituição para agentes).

## Application — Casos de uso

### BC Ingestão & Identificação (ajuste aos casos de uso já existentes em 001)

- `ReceberOrcamento(tenantId, canal, arquivo, referenciaExternaOpcional)` — `tenantId` passa a ser parâmetro obrigatório, resolvido pela Interface a partir do JWT (ou do mapeamento SFTP), nunca do corpo da requisição. Demais casos de uso de 001 (`ClassificarOrcamento`, `RevisarOrcamentoComIA`, `ConfirmarRevisaoHumana`, `ConsultarStatusOrcamento`) passam a receber/propagar `tenantId` (lido do agregado já persistido nos 3 primeiros; explícito por parâmetro no último, vindo do JWT do solicitante — e MUST validar que o `tenantId` do JWT corresponde ao `tenantId` do agregado antes de retornar qualquer dado, retornando 404 Problem Details, nunca 403 revelador de existência cross-tenant, se não corresponder).

### BC Acompanhamento (novo)

- `RegistrarEventoNaTrilha(evento)` — consumidor do SQS ligado à regra EventBridge "todos os `detail-type` de `nexo.*`"; idempotente via `UNIQUE(orcamentoId, tipoEvento, ocorreuEm)` com `ON CONFLICT DO NOTHING` (redelivery do SQS nunca duplica linha de auditoria).
- `ExportarRelatorioAuditoria(tenantId, filtro: FiltroExportacaoAuditoria, cursor?, limit?)` — query paginada (cursor-based), somente leitura, nunca escreve; retorna Problem Details em filtro inválido.

Todos os casos de uso publicam/consomem evento via as mesmas interfaces (`EventPublisher`/consumidor SQS) já estabelecidas em 001 — nenhuma nova abstração de mensageria introduzida.

## Infrastructure

- **`TenantContextMiddleware` (Fastify plugin, compartilhado por todos os BCs)** — decodifica JWT Cognito já verificado, extrai `custom:tenant_id`, valida como `TenantId`, popula `request.tenantContext`. Requisição sem claim válida MUST retornar 401 Problem Details antes de qualquer código de Application ser alcançado. Canal SFTP: Lambda trigger resolve `tenantId` a partir do mapeamento usuário/servidor AWS Transfer Family → tabela `sftp_tenant_mapping` (não do conteúdo do arquivo).
- **RLS (Row-Level Security) em toda tabela tenant-scoped** — `orcamentos`, `orcamentos_historico` (001, retrofit) e `auditoria_trilha_eventos` (Acompanhamento, nova); política `CREATE POLICY tenant_isolation ON <tabela> USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`; MUST ser aplicada a qualquer tabela tenant-scoped criada por 002–005 quando planejadas.
- **`DrizzleTenantScopedRepositoryBase`** — classe base de repositório (Infrastructure) que executa `SET LOCAL app.current_tenant_id = $1` no início de toda transação Drizzle, com `$1` vindo exclusivamente do `TenantContext` já validado pela Interface (nunca de parâmetro solto). Toda role IAM/DB de Lambda que acesse estas tabelas MUST NOT ter `BYPASSRLS`, verificado como item de checklist de infraestrutura (Terraform/CDK).
- **Cognito**: novo custom attribute `custom:tenant_id`, imutável após provisionamento do usuário (gerenciado no onboarding operacional do tenant — fora de escopo desta spec, ver "Fora de escopo" do spec.md).
- **EventBridge**: nova regra no `nexo-dominio-bus` (bus único já existente, convenção #4 de 001) roteando todo `detail-type` de `source` iniciado em `nexo.` para a fila SQS `acompanhamento-auditoria-queue`, com DLQ própria + alarme CloudWatch (mesmo padrão de 001).
- **`DrizzleTrilhaAuditoriaRepository`** — tabela `auditoria_trilha_eventos`, append-only, RLS ativa.
- **IAM**: `AcompanhamentoAuditoriaConsumerLambdaRole` (least privilege — sem `s3:*`, sem `bedrock:*`; apenas leitura de SQS e escrita na tabela de auditoria); `ExportarAuditoriaLambdaRole` (apenas leitura na tabela de auditoria).

## Interface

- `GET /v1/auditoria/orcamentos/export?periodo_inicio=&periodo_fim=&fornecedorId=&status=&cursor=&limit=` — paginação cursor-based, resposta JSON estruturada (decisão desta spec, ver ADR-006 — formato CSV/PDF fica a cargo de um consumidor externo, fora do escopo backend). `tenantId` sempre do `TenantContextMiddleware`, nunca de query param. Contrato Problem Details (RFC 7807) para erro. Autenticação Cognito (JWT), mesmo padrão de 001.
- Todos os endpoints já existentes de 001 (e futuros de 002–005) passam a rodar atrás do mesmo `TenantContextMiddleware` — nenhum endpoint novo de isolamento por BC individual.

## Segurança (riscos específicos desta spec)

- **Vazamento cross-tenant é o risco central desta spec** — mitigado em 4 camadas independentes (Interface valida claim → Application exige parâmetro explícito → Repository sempre filtra → RLS impede estruturalmente mesmo se as 3 anteriores falharem). RLS é a camada que sustenta o critério de aceite "nunca contornável... mesmo em caso de erro do sistema" — as demais camadas são defesa em profundidade, não a garantia final.
- **`tenant_id` nunca aceito de input não-autenticado**: nenhuma rota, nenhum handler de evento MUST ler `tenantId` de body/query/path — apenas de claim JWT verificada ou de mapeamento de infraestrutura (SFTP). Qualquer PR que adicione uma exceção a esta regra exige ADR.
- **Least privilege reforçado**: nenhuma role de Lambda com acesso a tabela tenant-scoped MUST ter `BYPASSRLS` na conexão Postgres — item de revisão de infraestrutura, não apenas de código de aplicação.
- **LGPD**: `resumoPayload` da trilha de auditoria MUST conter apenas subconjunto necessário à auditoria (nunca o texto bruto do documento do fornecedor) — mesma disciplina de minimização já aplicada ao ACL de 001.
- **Isolamento não é autorização granular**: papéis/permissões dentro do mesmo tenant (gestor vs. comprador) permanecem fora de escopo (declarado no spec.md) — este mecanismo resolve fronteira entre tenants, não entre papéis internos a um tenant.

## Project Structure

### Documentation (this feature)

```text
specs/007-isolamento-multitenant-dados/
├── spec.md               # já existente, clarificado (versão 2)
├── plan.md               # este arquivo
└── tasks.md               # gerado por /speckit-tasks
```

### Source Code (repository root) — extensão do monorepo único de 001

```text
src/
├── shared-kernel/
│   └── tenant/
│       ├── tenant-id.vo.ts
│       └── tenant-context.ts        # tipo de contexto de request, não estado global mutável
├── bounded-contexts/
│   ├── ingestao-identificacao/       # já existente (001) — alterações desta spec:
│   │   ├── domain/
│   │   │   ├── orcamento.aggregate.ts        # + atributo tenantId, invariante de imutabilidade
│   │   │   └── events/                        # + tenantId no payload, schemaVersion: 2
│   │   ├── application/use-cases/             # + parâmetro tenantId obrigatório
│   │   └── infrastructure/persistence/        # + coluna tenant_id, RLS, DrizzleTenantScopedRepositoryBase
│   └── acompanhamento/                # novo (esta spec, escopo tático: auditoria/exportação)
│       ├── domain/
│       │   ├── read-models/ (trilha-auditoria-evento.ts)
│       │   └── value-objects/ (filtro-exportacao-auditoria.ts)
│       ├── application/
│       │   └── use-cases/ (registrar-evento-na-trilha, exportar-relatorio-auditoria)
│       ├── infrastructure/
│       │   ├── persistence/ (drizzle-trilha-auditoria.repository.ts, schema/)
│       │   └── aws/ (eventbridge-rule-consumer/)
│       └── interface/
│           ├── http/ (controller GET /v1/auditoria/orcamentos/export + Zod schemas)
│           └── events/ (handler Lambda consumidor de acompanhamento-auditoria-queue)
└── interface/
    └── shared/
        └── tenant-context.middleware.ts       # plugin Fastify reaproveitado por todos os BCs

tests/
├── shared-kernel/tenant/ (unit — TenantId VO)
├── bounded-contexts/ingestao-identificacao/ (ajustes de teste existentes + invariante tenantId)
├── bounded-contexts/acompanhamento/ (unit read-model, application, contract)
└── security/isolamento-multitenant/ (suíte adversarial cross-tenant — cabe a Ricardo/CI executar)
```

**Structure Decision**: extensão do monorepo único já estabelecido em 001; `shared-kernel/` é diretório novo de primeira classe (não um `bounded-context`), documentando a única excepcionalidade de import direto entre módulos autorizada por esta spec (ver ADR-004). BC `acompanhamento` segue exatamente o mesmo layout de 4 camadas dos demais.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Shared Kernel (`TenantId` importado diretamente entre Bounded Contexts, desviando da regra de 001 "nenhum código compartilhado por import direto entre contextos") | O guardrail de isolamento exige que a validação de `TenantId` seja byte-idêntica em todos os BCs — qualquer duplicação por BC (VO equivalente redefinido em cada contexto) cria risco real de drift silencioso entre implementações, o que é inaceitável dado o guardrail "0 incidentes, sempre" | Duplicar o VO por BC evitaria o import cross-context, mas troca um risco de acoplamento superficial (um VO puro, sem lógica de negócio) por um risco de segurança real (duas implementações de validação de tenant divergindo com o tempo) — trade-off não aceitável dada a ordem de prioridade da constituição (Segurança > Simplicidade) |

## ADRs desta spec

### ADR-003 — Isolamento por Row-Level Security (RLS) em vez de apenas filtro de aplicação ou banco/schema por tenant

**Contexto**: guardrail "nenhuma consulta retorna dado de outro tenant, mesmo em erro do sistema" exige uma garantia que não dependa exclusivamente de todo desenvolvedor lembrar de filtrar corretamente em todo repositório, presente e futuro, em 5+ Bounded Contexts.

**Problema**: como impedir estruturalmente que um `WHERE` esquecido, um bug de Application, ou um novo BC futuro sem revisão adequada resultem em vazamento cross-tenant.

**Alternativas consideradas**: (a) apenas filtro de aplicação (`WHERE tenant_id = ?` disciplinado por convenção/code review); (b) banco de dados físico separado por tenant; (c) schema Postgres separado por tenant dentro do mesmo cluster; (d) RLS (política por linha) + filtro de aplicação como defesa em profundidade.

**Vantagens (RLS + filtro de aplicação)**: garantia estrutural no nível do banco — mesmo query mal escrita ou repositório futuro sem o wrapper correto não consegue ler linha de outro tenant, porque a sessão Postgres em si está restrita; convive com Aurora Serverless v2 único (Princípio VI, serverless-first, sem multiplicar clusters); custo incremental baixo (uma política por tabela, um `SET LOCAL` por transação).

**Desvantagens**: overhead de performance de `current_setting()` por query (pequeno, não medido ainda); exige disciplina de nunca conceder `BYPASSRLS` a nenhuma role de Lambda (item de checklist de infraestrutura, risco de erro humano na configuração do IAM/DB role, não no código); RLS mal configurada (política ausente em tabela nova) é um risco residual — mitigado por exigir RLS como parte obrigatória do checklist de criação de qualquer tabela tenant-scoped em 002–005.

**Alternativas (b) e (c) rejeitadas**: banco ou schema por tenant multiplica migrações, conexões e custo operacional de forma incompatível com Princípio VI e com o modelo de pool de conexões do Aurora Serverless v2 sob carga de Lambda (cada schema/banco novo é overhead de gestão que cresce linearmente com número de tenants, sem benefício de isolamento adicional relevante frente à RLS).

**Decisão**: RLS em toda tabela tenant-scoped, com filtro explícito de aplicação como primeira linha de defesa (mais rápido de detectar em teste, mais legível em code review) e RLS como garantia final.

**Trade-offs**: complexidade operacional adicional (checklist de infraestrutura, disciplina de IAM) em troca da única garantia que satisfaz literalmente o critério de aceite "nunca contornável mesmo em erro do sistema".

**Impactos futuros**: toda tabela tenant-scoped criada por specs 002–005 MUST ter RLS habilitada como parte da definição de schema, não como tarefa posterior.

### ADR-004 — `TenantId` como Shared Kernel explícito, não como VO duplicado por Bounded Context

**Contexto**: 001 estabeleceu que "código nunca é compartilhado por import direto entre contextos". `TenantId` precisa existir de forma idêntica em todos os BCs.

**Problema**: manter a regra de 001 sem exceção (duplicar o VO) vs. abrir uma exceção controlada (Shared Kernel).

**Alternativas consideradas**: VO `TenantId` duplicado por BC; Shared Kernel restrito (só o VO, sem lógica de negócio); publicar `TenantId` como pacote npm interno versionado (overhead de tooling desproporcional ao tamanho do BC neste estágio do monorepo).

**Vantagens (Shared Kernel restrito)**: elimina risco de drift de validação entre contextos; sem overhead de publicação de pacote; escopo do Shared Kernel é deliberadamente mínimo (um VO, sem regra de negócio), o que reduz o risco clássico de Shared Kernel (acoplamento que cresce sem controle).

**Desvantagens**: qualquer mudança em `TenantId` agora exige coordenação entre times/specs que dependam dele — mitigado por manter o VO deliberadamente estável e sem lógica de negócio.

**Decisão**: Shared Kernel restrito a `src/shared-kernel/tenant/tenant-id.vo.ts`. Nenhum outro código é compartilhado por import direto entre Bounded Contexts — a regra de 001 continua valendo para tudo o mais.

**Trade-offs**: pequeno acoplamento estrutural aceito em troca de eliminar um risco de segurança real (drift de validação de tenant).

**Impactos futuros**: qualquer proposta de adicionar um segundo Shared Kernel exige ADR próprio — não é precedente automático para generalizar a prática.

### ADR-005 — Amendment ao envelope de Domain Event de 001: `tenantId` obrigatório, `schemaVersion: 2`

**Contexto**: 001 definiu envelope padrão (`schemaVersion`, `orcamentoId`, `ocorreuEm`) como convenção vinculante para specs futuras. Este plano precisa adicionar `tenantId` como campo obrigatório em todo evento, inclusive nos 5 já desenhados por 001.

**Problema**: tratar isso como alteração retroativa de uma decisão já aprovada (exigindo reabertura do Constitution Check de 001) ou como amendment aditivo explícito nesta spec.

**Alternativas consideradas**: reabrir e reescrever `specs/001-ingestao-classificacao-orcamentos/plan.md`; versionar o schema com suporte dual (v1 sem tenantId + v2 com tenantId, para compatibilidade); amendment direto com cutover único, sem suporte dual.

**Vantagens (amendment com cutover único)**: mais simples; sem custo de manter dois formatos de evento em paralelo; justificado porque a métrica desta spec confirma baseline "0 tenants reais em produção ainda" — não há consumidor real de `schemaVersion: 1` a proteger.

**Desvantagens**: se este plano for implementado depois que 001 já estiver em produção com tenants reais, o cutover direto não é mais seguro e a alternativa de suporte dual passa a ser obrigatória — risco registrado explicitamente em "Riscos remanescentes".

**Decisão**: amendment aditivo. `specs/001-ingestao-classificacao-orcamentos/plan.md` não é reescrito por este agente; uma nota de amendment referenciando este ADR MUST ser adicionada a ele (task desta spec, ver `tasks.md`), preservando o Constitution Check original de 001 como estava.

**Trade-offs**: exige que Ricardo confirme, no momento da implementação, se já existe tenant real em produção antes de aplicar o cutover direto — se sim, a Alternativa de suporte dual (v1/v2 em paralelo) MUST ser adotada em vez do cutover único aqui decidido.

**Impactos futuros**: specs 002–005, ao serem planejadas, MUST desenhar seus eventos já com `tenantId` desde a v1 (não herdam o problema de migração, só 001 herda, por ter sido planejada antes deste ADR).

### ADR-006 — Exportação de auditoria em JSON paginado, não em arquivo pré-gerado (CSV/PDF)

**Contexto**: spec.md declara formato de exportação como decisão do `arquiteto-back`. Escopo é exclusivamente backend (sem UI que renderize o arquivo).

**Problema**: retornar JSON paginado via API síncrona vs. gerar arquivo (CSV/PDF) assíncrono com URL pré-assinada de download.

**Alternativas consideradas**: JSON paginado (cursor-based) síncrono; geração assíncrona de arquivo (Lambda + S3 + presigned URL, padrão similar ao ADR-002 de 001, com endpoint de polling de status).

**Vantagens (JSON paginado)**: mais simples, sem infraestrutura nova de geração/armazenamento de arquivo; sem estado de job assíncrono a rastrear; qualquer consumidor externo (frontend, BI, integração) converte para CSV/PDF a partir do JSON, que é o contrato mais flexível para um time backend que não constrói UI.

**Desvantagens**: exportações muito grandes exigem múltiplas páginas (mais chamadas do cliente) em vez de um único arquivo; não resolve por si só um caso de exportação "para imprimir/anexar em e-mail" — mas isso é responsabilidade de UI, fora de escopo.

**Decisão**: `GET /v1/auditoria/orcamentos/export` paginado, JSON, cursor-based.

**Trade-offs**: menor esforço de implementação agora, com possível necessidade de revisão (ADR novo) se o volume real por tenant tornar paginação impraticável para o caso de uso de auditoria.

**Impactos futuros**: se um consumidor externo pedir explicitamente exportação em arquivo único (CSV/PDF assíncrono), é uma nova decisão de arquitetura, não uma extensão implícita deste endpoint.
