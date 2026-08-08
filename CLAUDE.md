# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Repositório e documentação são em português. Escreva código, comentários, commits e PRs em português.

## Setup

```bash
nvm use && corepack enable && pnpm install   # Node 24 fixo no .nvmrc, pnpm 11 fixo em packageManager
cp .env.example .env                          # defaults já funcionam local
pnpm docker:up                                # Postgres+pgvector, LocalStack, Ollama
pnpm db:migrate                               # migrações Drizzle
pnpm dev:seed                                 # cria bucket, bus, filas e regras no LocalStack
pnpm dev                                      # Fastify :3000 + pollers das filas
```

Para usar os gateways Ollama, puxe os modelos antes do primeiro uso:

```bash
docker compose exec ollama ollama pull llama3.1
docker compose exec ollama ollama pull mxbai-embed-large
```

`gh auth login` é pré-requisito real: o fluxo de issues, o hook `.claude/hooks/task-limit.sh` e a esteira de PR dependem dele. Sem auth o hook degrada em silêncio.

## Comandos

```bash
pnpm typecheck            # tsc --noEmit
pnpm typecheck:infra      # tsc do CDK (infra/tsconfig.json) — rode quando tocar infra/
pnpm lint                 # eslint (inclui a regra de fronteira de BC, ver abaixo)
pnpm test                 # vitest run
pnpm db:generate          # gera migração após editar um *.schema.ts
```

Um arquivo só, ou um teste só:

```bash
npx vitest run tests/bounded-contexts/orquestracao/interface/decisao-workflow-queue.handler.test.ts
npx vitest run -t "nome do teste"
```

**`pnpm test` quebra em máquina cujo path contém espaço** (ex.: `C:\Users\Allan Brito\...`) — o reporter `allure-vitest` falha com `Vitest failed to find the runner`. Contorne com `npx vitest run --reporter=default`; **não** altere `vitest.config.ts`. O CI roda em Linux e não é afetado.

19 arquivos de teste fazem `skipIf(!DATABASE_URL)` e pulam sem Postgres. Isso é esperado localmente — no CI eles rodam de verdade. Um "skip" local não é prova; para provar comportamento de banco, suba o Postgres ou use o CI como evidência.

Se o Postgres subir mas a autenticação falhar via TCP, é volume nomeado antigo com credencial divergente: `docker compose down -v` e suba de novo.

## Arquitetura

Backend serverless em Node 24 + TypeScript strict, Domain-Driven Design, comunicação **exclusivamente por eventos de domínio** (EventBridge → SQS → handler).

### Bounded Contexts

`src/bounded-contexts/<bc>/` com quatro camadas fixas: `domain/` (aggregates, value-objects, events, gateways, repositories, errors), `application/use-cases/`, `infrastructure/` (persistence, gateways concretos, ACLs, observability), `interface/` (http, events).

Os cinco BCs em produção: `ingestao-identificacao` (001), `extracao` (002), `validacao` (003), `busca-indexacao` (004), `orquestracao` (005). `acompanhamento` (007) existe mas está em estágio inicial. Fora deles: `src/shared-kernel/` (tenant, database), `src/platform/`, `src/interface/shared/` (middlewares transversais), `src/composition/` (composition roots), `src/dev/` (runner local).

### Import entre BCs é proibido por lint

`eslint-rules/no-cross-bounded-context-import.mjs` bloqueia import direto entre Bounded Contexts. **Única exceção autorizada: `src/shared-kernel/tenant/`.** Para atravessar fronteira, use Domain Event ou uma Anti-Corruption Layer explícita — o padrão do repo é um `*.acl.ts` na `infrastructure/` do BC consumidor, que traduz payload bruto em VO e rejeita shape inválido.

### Contrato de evento de domínio

Todo evento publicado por qualquer BC carrega `tenantId: string` **obrigatório** e `schemaVersion: 2` (`<bc>/domain/events/domain-event.ts`). Retrofit multi-tenant concluído nos 5 BCs; não regrida isso. Os repositórios estendem `DrizzleTenantScopedRepositoryBase` (RLS + tenant-scoping estrutural) — exceto dados de **configuração**, que a convenção #4 de `specs/007-isolamento-multitenant-dados/plan.md` escopa explicitamente a "dado de orçamento".

### Seleção de gateway de IA

Cada porta de IA tem duas implementações — `Bedrock*Gateway` e `Ollama*Gateway` — e a escolha vive no composition root via `NEXO_AGENTE_IA=local|bedrock` (ADR-009). Nunca por `if` espalhado no domínio nem por fork de BC.

`exigirAgenteIaBedrockEmProducao()` (`src/composition/aws-clients.production.ts`) aborta o cold start se produção não tiver `NEXO_AGENTE_IA=bedrock`. Handlers de produção chamam esse guard **antes** de qualquer `selecionarAgente*`.

**Restrição dura de embedding**: `indice-orcamento.schema.ts` fixa `vector('embedding', { dimensions: 1024 })`. O modelo local precisa emitir exatamente 1024 — `mxbai-embed-large` serve, `nomic-embed-text` (768) não. `OllamaEmbeddingACL` falha explícito se a dimensão divergir; nunca truncar nem fazer padding.

### Autenticação e autorização

`src/interface/shared/tenant-context.middleware.ts` faz **um único** `verify()` do JWT Cognito e popula `request.tenantContext.tenantId` e `request.papeis` (da claim `cognito:groups`) do mesmo payload. Não adicione uma segunda verificação — ADR-007 já registra a dupla verificação existente como trade-off aceito, e ADR-010 descartou explicitamente a alternativa de checar papel dentro de cada middleware local.

`criarExigenciaPapel(papeis)` (`src/interface/shared/role-guard.middleware.ts`) é o guard de autorização: consome só `request.papeis`, devolve 403 Problem Details, e é **fail-closed** quando `request.papeis` é `undefined`. Papéis: `comprador-responsavel`, `compliance-admin`.

**`tenantId` e papel MUST NUNCA vir de body, query ou header.** Única fonte é a claim verificada. Rotas gated compõem `[autenticação, ..., criarExigenciaPapel(...)]` em `preHandler`, com o guard **sempre por último** — ver `orquestracao/interface/http/decisao-humana.controller.ts` e `validacao/interface/http/faixa-preco-categoria.controller.ts`. `RotaOpts.preHandler` aceita array só em `orquestracao` e `validacao`.

### Migrações Drizzle

`drizzle/meta/_journal.json` é ponto de serialização: o Drizzle Kit numera migrações sequencialmente, e duas geradas em branches paralelas e mergeadas fora de ordem corrompem o journal. Rode `pnpm db:generate` sempre contra `main` atualizado, uma PR de schema por vez. Fluxo: edite o `*.schema.ts` dentro do BC → re-exporte em `drizzle/schema.ts` se for schema novo → gere.

### Execução local cobre menos do que parece

`src/dev/local.ts` sobe as rotas de Ingestão e **dois** pollers (`classificador-queue`, `extrator-queue`) — o encadeamento local para em 002. Bedrock não existe no LocalStack, então classificador/extrator são stubs determinísticos controlados por `NEXO_LOCAL_CONFIANCA` e `NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO`. LocalStack não aplica IAM — nada local prova que as roles de produção têm `events:PutEvents`. Só `.txt`, `.md` e `.csv` atravessam o fluxo (MarkItDown ainda não existe).

## Fluxo de trabalho do repositório

Spec-Driven Development: `specs/<NNN>-<slug>/` guarda `spec.md`, `plan.md`, `tasks.md`, `evidence/` e `qa/`. Cada task vira issue no GitHub com label `spec-NNN` e label de estado (`ready` → `in-progress` → `done`, ou `blocked`).

Antes de tocar qualquer issue, invoque a skill `claim-issue` — ela resolve corrida entre agentes rodando em worktrees diferentes. Nunca comece sem claim confirmado.

Esteira de fechamento: implementar → abrir PR (**nunca como draft**, draft não mergeia) → CI verde → `backend-reviewer` → `qa` → merge squash com as duas aprovações. Marque a task em `tasks.md` e commite a evidência de QA **dentro do mesmo PR**.

Agentes versionados em `.claude/agents/`: `dev-back-end`, `backend-reviewer`, `qa`, `arquiteto-back`, `devops`, `gerente-produto`. Decisão de arquitetura não é do dev — se um requisito exigir um mecanismo que não existe em artefato aprovado, **pare e reporte** em vez de inventar; foi assim que o ADR-010 nasceu.

Commits seguem Conventional Commits com escopo: `feat(validacao):`, `fix(infra):`, `docs(003):`, `docs(arch):`.

Paralelismo entre agentes: a exclusividade é por pasta de Bounded Context. Dois agentes em BCs distintos não colidem; dois no mesmo BC, ou tocando `src/interface/shared/`, `drizzle/`, `package.json` ou uma stack IaC compartilhada, precisam ser serializados. `docs/plano-paralelismo-issues.md` detalha as trilhas.

## Documentos de referência

- `README.md` — setup completo, contrato HTTP, tabela de variáveis de ambiente
- `.specify/memory/constitution.md` — princípios NON-NEGOTIABLE (rastreabilidade, desacoplamento por eventos, dado bruto imutável, exceção nunca silenciosa)
- `docs/architecture-diagrams/adr-*.html` — ADR-004 (IAM `events:PutEvents`), ADR-008 (retrofit `tenantId`), ADR-009 (composition root e seleção de gateway de IA), ADR-010 (verificação de papel via grupos Cognito)
- `docs/plano-finalizacao.md` — estado por caso de uso, prioridade por issue e ordem de execução. Confirme no board antes de agir: o documento envelhece rápido.
