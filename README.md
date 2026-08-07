# Nexo — Backend (`nexus-orc-back`)

Plataforma de **ingestão, entendimento e processamento automático de orçamentos** de fornecedores para redes varejistas. Este repositório é o **backend exclusivo** do produto: API, pipeline de eventos, agentes de IA e dados — **nunca interface visual** (qualquer frontend é consumidor externo do contrato de API/evento/dado).

> **Estado atual (2026-08-06)**: implementação em curso sob Spec-Driven Development. Há código de produção real — 6 Bounded Contexts, 268 arquivos TypeScript (~17k linhas), 196 arquivos de teste, 21 migrações Drizzle, 24 stacks CDK. O pipeline **ainda não roda ponta a ponta**: 4 das 7 Lambdas de fila já são implantáveis, o restante tem handler + role IAM mas sem `NodejsFunction` que os amarre. Diagnóstico honesto e issue a issue em [`docs/plano-finalizacao.md`](docs/plano-finalizacao.md) e [`docs/estado-funcionalidades.md`](docs/estado-funcionalidades.md).

---

## Índice

- [O que o Nexo faz](#o-que-o-nexo-faz)
- [Princípios inegociáveis (constituição)](#princípios-inegociáveis-constituição)
- [Arquitetura](#arquitetura)
- [Contrato HTTP](#contrato-http)
- [Eventos de domínio](#eventos-de-domínio)
- [Stack técnica](#stack-técnica)
- [Início rápido](#início-rápido)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Banco de dados](#banco-de-dados)
- [Gateways de IA — Bedrock ou Ollama](#gateways-de-ia--bedrock-ou-ollama)
- [Testes e qualidade](#testes-e-qualidade)
- [Infraestrutura (CDK)](#infraestrutura-cdk)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Fluxo de trabalho (Spec-Driven Development)](#fluxo-de-trabalho-spec-driven-development)
- [Roadmap e lacunas conhecidas](#roadmap-e-lacunas-conhecidas)
- [Contribuindo](#contribuindo)

---

## O que o Nexo faz

Fornecedores enviam orçamentos em formatos variados (PDF, planilha, imagem, texto) por 4 canais: portal web, API REST, SFTP e app mobile. O pipeline:

1. **Recebe** o orçamento bruto e o grava de forma imutável (S3 versionado).
2. **Classifica** fornecedor e formato (IA generativa).
3. **Extrai** dados estruturados — itens, preços, condições comerciais.
4. **Valida** consistência (CNPJ, faixa de preço por categoria, prazo de validade — regras determinísticas).
5. **Indexa** para busca semântica em linguagem natural (embeddings + pgvector).
6. **Orquestra** a decisão de workflow: aprovar, encaminhar ao comprador, solicitar reenvio ou disparar integração externa.

Toda etapa é auditável ponta a ponta e nenhuma exceção é silenciosa: confiança baixa gera evento explícito e escala para revisão humana.

## Princípios inegociáveis (constituição)

Regras vinculantes de arquitetura — fonte de verdade em [`.specify/memory/constitution.md`](.specify/memory/constitution.md) (v1.2.0, ratificada em 2026-07-29):

| # | Princípio | Resumo |
|---|-----------|--------|
| I | **Rastreabilidade ponta a ponta** | Trilha auditável reconstruível por `OrcamentoId`, sem depender de log efêmero. |
| II | **Desacoplamento por eventos de domínio** | Componentes comunicam-se só por eventos no bus; nenhuma chamada direta entre implementações internas. |
| III | **Dado bruto imutável** | Orçamento original nunca sobrescrito; cada etapa grava nova versão com vínculo à origem. |
| IV | **Exceção nunca silenciosa** | Baixa confiança gera evento explícito e escala para revisão humana; nunca autoaprova. |
| V | **IA generativa é o motor de entendimento** | Classificação/extração por modelo, não por regra fixa por fornecedor. |
| VI | **Serverless-first / custo sob demanda** | Preferir managed elástico a capacidade fixa ociosa. |
| VII | **Segurança e LGPD desde o desenho** | Criptografia, menor privilégio, retenção e direito ao esquecimento na spec. |
| VIII | **Roadmap em 3 fases vinculante** | Sequenciamento de entregas é obrigatório. |

**Restrições adicionais**: 4 canais fixos por gateway único · 5 agentes de papel fixo · escopo exclusivamente backend · conversão de documento prefere open-source (MarkItDown) a serviço pago (Textract).

## Arquitetura

100% serverless na AWS, orientada a eventos, com **DDD tático** por Bounded Context. Diagrama completo (Mermaid) e legenda das integrações em [`docs/arquitetura-escopo-completo.md`](docs/arquitetura-escopo-completo.md).

### Bounded Contexts

Cada BC vive em `src/bounded-contexts/<slug>/{domain,application,infrastructure,interface}` e tem schema Postgres próprio.

| BC | Fase | Spec | Papel | Schema DB |
|----|------|------|-------|-----------|
| Ingestão & Identificação | 01 | 001 | Gateway único (4 canais) + Agente Classificador | `public` |
| Extração | 01 | 002 | Agente Extrator (itens + condições comerciais) | `extracao` |
| Validação | 02 | 003 | Regras determinísticas + Categorizador de item | `validacao` |
| Busca & Indexação | 02 | 004 | Embeddings + busca híbrida SQL/pgvector | `busca_indexacao` |
| Orquestração | 02 | 005 | Agente Orquestrador (decisão de workflow) | `orquestracao` |
| Acompanhamento | 03 | 007 | Read-model de auditoria (append-only) — **estágio inicial** | — |

**Plataforma transversal**: multi-tenancy via `TenantId` Shared Kernel + Row-Level Security (spec 007, retrofit **concluído** em 001–005), conformidade LGPD (`src/platform/conformidade`, spec 008), otimização de custo — cache de identificação + S3 Intelligent-Tiering (spec 009).

### Fluxo de eventos

Único mecanismo de acoplamento entre BCs: EventBridge custom bus **`nexo-dominio-bus`**. Cada consumidor tem sua própria fila SQS (com DLQ e alarme), alimentada por regra do bus.

```
POST /v1/orcamentos/upload-url ──► S3 (bruto, versionado)
                │
                └─► POST .../confirmar-upload ──► OrcamentoRecebido
                                                       │
                        ┌──────────────────────────────┤
                        ▼                              ▼
              classificador-queue          contexto-classificacao-queue (005)
                        │
                 OrcamentoClassificado
                        │
                        ▼
                 extrator-queue ──► OrcamentoExtraido
                        │                  │
                        │                  ├─► contexto-extracao-queue (005)
                        ▼                  │
                 validador-queue ◄─────────┘
                        │
                 OrcamentoValidado
                        │
             ┌──────────┴────────────┐
             ▼                       ▼
     indexador-queue (004)   decisao-workflow-queue (005)
             │                       │
      OrcamentoIndexado      Aprovado / EncaminhadoComprador /
                             ReenvioSolicitado / IntegracaoExterna
```

**Filas** (7): `classificador-queue`, `extrator-queue`, `validador-queue`, `indexador-queue`, `contexto-classificacao-queue`, `contexto-extracao-queue`, `decisao-workflow-queue`.

### Anti-Corruption Layer para IA

Todo acesso a modelo generativo passa por uma **ACL** (`*.acl.ts`) — texto/JSON bruto do modelo nunca cruza para o Domain. Mitigação de prompt injection por saída estruturada (JSON Schema / tool-use) + sanitização do conteúdo do documento antes do prompt (`sanitizar-conteudo-documento.ts`, `sanitizar-conteudo-extracao.ts`).

### Multi-tenant

Isolamento estrutural, não por convenção:

- `TenantId` é Value Object do Shared Kernel (`src/shared-kernel/tenant/tenant-id.vo.ts`).
- `tenant-context.middleware.ts` extrai o tenant do JWT Cognito e abre o contexto da requisição.
- Repositórios estendem `DrizzleTenantScopedRepositoryBase` — a cláusula de tenant não é opcional.
- **Row-Level Security** no Postgres (migrações `0013`, `0016`, `0020`) como segunda barreira.
- Todos os eventos de domínio de 001–005 carregam `tenantId` obrigatório e `schemaVersion: 2`.

## Contrato HTTP

Contrato completo em [`docs/openapi.yaml`](docs/openapi.yaml); guia de consumo pelo frontend em [`docs/api-contrato-frontend.md`](docs/api-contrato-frontend.md). Autenticação por JWT Cognito (`auth-cognito.middleware.ts`); erros no formato Problem Details (`src/interface/shared/problem-details.schema.ts`).

| Método | Rota | BC | Status |
|--------|------|----|--------|
| `POST` | `/v1/orcamentos/upload-url` | Ingestão | implementado |
| `POST` | `/v1/orcamentos/{orcamentoId}/confirmar-upload` | Ingestão | implementado |
| `GET` | `/v1/orcamentos/{orcamentoId}/status` | Ingestão | implementado |
| `POST` | `/v1/orcamentos/{orcamentoId}/revisao-humana` | Ingestão | implementado |
| `GET` | `/v1/orcamentos/{orcamentoId}/extracao/status` | Extração | implementado |
| `POST` | `/v1/orcamentos/{orcamentoId}/extracao/revisao-humana` | Extração | implementado |
| `GET` | `/v1/orcamentos/{orcamentoId}/validacao/status` | Validação | implementado |
| `POST` | `/v1/orcamentos/{orcamentoId}/validacao/decisao-humana` | Validação | implementado |
| `GET` | `/v1/orcamentos/{orcamentoId}/indexacao/status` | Busca & Indexação | implementado |
| `POST` | `/v1/orcamentos/busca` | Busca & Indexação | implementado |
| `GET` | `/v1/orcamentos/{orcamentoId}/workflow/status` | Orquestração | implementado |
| `POST` | `/v1/orcamentos/{orcamentoId}/workflow/decisao-humana` | Orquestração | **só no OpenAPI** |
| `GET`/`POST` | `/v1/configuracoes/faixas-preco-categoria` | Validação | **só no OpenAPI** (schema pronto, sem controller) |
| `GET` | `/v1/auditoria/orcamentos/export` | Acompanhamento | **só no OpenAPI** (schema pronto, sem controller) |
| `GET` | `/v1/orcamentos/{orcamentoId}` (visão consolidada) | — | **provisório, não implementado** |

## Eventos de domínio

| BC | Eventos publicados |
|----|--------------------|
| Ingestão | `OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoRevisaoHumana`, `OrcamentoReclassificadoRevisaoHumana` |
| Extração | `OrcamentoExtraido`, `OrcamentoExtraidoPendenciaConfirmada`, `ExtracaoEscalonadaRevisaoHumana` |
| Validação | `OrcamentoValidado`, `OrcamentoValidadoComRessalva`, `OrcamentoInconsistenciaDetectada` |
| Busca & Indexação | `OrcamentoIndexado`, `FalhaIndexacaoDetectada` |
| Orquestração | `OrcamentoAprovadoParaProcessamento`, `OrcamentoEncaminhadoParaComprador`, `OrcamentoReenvioSolicitado`, `DecisaoWorkflowEscalonadaParaComprador`, `IntegracaoExternaSolicitada` |
| Conformidade (008) | `SolicitacaoEsquecimentoRegistrada`, `SolicitacaoEsquecimentoConcluida`, `SolicitacaoEsquecimentoPrazoExcedido`, `DadoPessoalAnonimizadoNoContexto`, `RetencaoAplicadaNoContexto` |

Todos com envelope versionado (`schemaVersion`) e `tenantId`.

## Stack técnica

| Camada | Escolha |
|--------|---------|
| Linguagem | TypeScript 5.9 `strict`, ESM puro (`"type": "module"`, imports com `.js`) |
| Runtime | Node.js 24 LTS (`.nvmrc`) · AWS Lambda atrás de API Gateway · AWS Transfer Family (SFTP) |
| Gerenciador | pnpm 11.18 (`packageManager` fixo; workspace em `pnpm-workspace.yaml`) |
| HTTP | Fastify 5 |
| Validação de borda | Zod 4 |
| Eventos | EventBridge (bus único `nexo-dominio-bus`) · SQS (uma fila por consumidor + DLQ) |
| Dados | S3 versionado (bruto imutável) · Aurora Serverless v2 Postgres · pgvector · DynamoDB (cache) |
| ORM/migrações | Drizzle ORM + drizzle-kit |
| IA | Amazon Bedrock Runtime (`InvokeModel`/tool-use) · Titan Text Embeddings V2 · **alternativa local: Ollama** |
| Conversão de documento | MarkItDown (open-source, auto-hospedado) — Lambda Python **ainda não existe** |
| Auth | Cognito JWT (`aws-jwt-verify`) |
| Observabilidade | pino (log estruturado) · OpenTelemetry Node SDK (OTLP HTTP) |
| IaC | AWS CDK v2 (`infra/`) |
| Testes | Vitest 4 · coverage v8 · Allure · LocalStack para integração |

## Início rápido

### Pré-requisitos

- Node.js 24 (`nvm use` — o `.nvmrc` fixa a versão; o hook de pre-commit resolve o Node via nvm)
- pnpm 11 (`corepack enable`)
- Docker + Docker Compose

### Passos

```bash
nvm use
pnpm install

cp .env.example .env          # ajuste se precisar; os defaults já funcionam local

pnpm docker:up                # Postgres+pgvector, LocalStack (S3/EventBridge/SQS/SNS), Ollama
pnpm db:migrate               # aplica as 21 migrações Drizzle
pnpm dev:seed                 # cria bucket, bus, filas e regras no LocalStack
pnpm dev                      # sobe Fastify (:3000) + pollers das filas
```

Verificação rápida do que subiu:

```bash
curl -s http://localhost:4566/_localstack/health   # LocalStack
curl -s -X POST http://localhost:3000/v1/orcamentos/upload-url \
  -H 'content-type: application/json' \
  -d '{"nomeArquivo":"orcamento.txt","tamanhoBytes":128}'
```

### O que a execução local realmente cobre

`src/dev/local.ts` sobe as rotas de Ingestão e **dois** pollers (`classificador-queue`, `extrator-queue`), chamando **os mesmos handlers das Lambdas de produção**. Postgres, S3, EventBridge e SQS são reais (LocalStack). Limites declarados no próprio arquivo:

- **Bedrock** não existe no LocalStack community → classificador/extrator são stubs determinísticos (`NEXO_LOCAL_CONFIANCA` controla o ramo `CLASSIFICADO` vs. `PENDENTE_REVISAO_HUMANA`; `NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO=true` força o escalonamento de 002). Para IA local de verdade, use Ollama (abaixo).
- **MarkItDown** ainda não existe → só `.txt`, `.md` e `.csv` atravessam o fluxo local. PDF/XLSX falham **de propósito**: decodificar binário como UTF-8 produziria lixo que o classificador aceitaria em silêncio.
- **LocalStack não aplica IAM** — nada aqui prova que as roles de produção têm `events:PutEvents`.
- **003, 004 e 005 não têm wiring local** — o encadeamento local para em 002.

Sem docker: `pnpm docker:down` derruba tudo; `pnpm docker:logs` acompanha.

## Variáveis de ambiente

Referência completa e comentada em [`.env.example`](.env.example).

| Variável | Default | Para que serve |
|----------|---------|----------------|
| `DATABASE_URL` | `postgresql://nexo:nexo@localhost:5432/nexo` | Postgres local; em AWS aponta para Aurora via RDS Proxy |
| `POSTGRES_DB` / `_USER` / `_PASSWORD` / `_PORT` | `nexo` / `nexo` / `nexo` / `5432` | Credenciais do container local |
| `AWS_REGION` | `us-east-1` | Região dos clientes AWS SDK |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` | Lido nativamente pelo SDK v3 — os gateways de produção falam com o LocalStack sem trocar adaptador |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test` / `test` | Credenciais fake do LocalStack |
| `NEXO_BUCKET_RAW` | `nexo-orcamentos-raw` | Bucket do bruto imutável — **mesmo nome das stacks CDK** |
| `NEXO_EVENT_BUS` | `nexo-dominio-bus` | Bus de domínio — **mesmo nome das stacks CDK** |
| `PORT` | `3000` | Porta do Fastify local |
| `NEXO_AGENTE_IA` | `local` | `local` (heurística determinística / Ollama) ou `bedrock` — ver ADR-009 |
| `NEXO_LOCAL_CONFIANCA` | `90` | Confiança devolvida pelo classificador stub (`>=80` classifica, `<80` escala) |
| `NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO` | `false` | `true` deixa `condicoesPagamento` sem extrair, forçando o escalonamento de 002 |
| `OLLAMA_BASE_URL` / `OLLAMA_PORT` | `http://localhost:11434` / `11434` | Endpoint do Ollama |
| `OLLAMA_MODELO_CLASSIFICADOR` | `llama3.1` | Modelo de chat do classificador (#617) |
| `OLLAMA_MODELO_ORQUESTRADOR` | `llama3.1` | Modelo de chat do orquestrador (#621) |
| `OLLAMA_MODELO_EMBEDDING` | `mxbai-embed-large` | **Restrição dura**: o schema pgvector fixa 1024 dimensões — `nomic-embed-text` (768) **não serve** |

Os gateways Ollama de Extração (#619) e Embedding (#620) recebem `{ baseUrl, modelo }` pelo composition root e ainda **não têm variável de ambiente própria** — quem os monta passa o valor explicitamente.
| `LOG_LEVEL` | `info` | Nível do pino |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Coletor OpenTelemetry |

Divergir de `NEXO_BUCKET_RAW`/`NEXO_EVENT_BUS` em relação às stacks CDK invalida o teste local.

## Scripts

| Script | O que faz |
|--------|-----------|
| `pnpm dev` | Fastify + pollers das filas (fluxo 001→002 local) |
| `pnpm dev:seed` | Cria bucket, bus, filas e regras no LocalStack |
| `pnpm docker:up` / `:down` / `:logs` | Ciclo de vida do docker-compose |
| `pnpm db:generate` | Gera migração a partir das mudanças de schema Drizzle |
| `pnpm db:migrate` | Aplica migrações pendentes |
| `pnpm test` | Vitest (unit + integração + contrato), reporter Allure |
| `pnpm typecheck` | `tsc --noEmit` no código de aplicação |
| `pnpm typecheck:infra` | `tsc --noEmit` no CDK (`infra/tsconfig.json`) |
| `pnpm lint` / `lint:fix` | ESLint (inclui regras próprias em `eslint-rules/`) |
| `pnpm format` / `format:check` | Prettier |

Husky + lint-staged rodam `eslint --fix` e `prettier --write` no pre-commit.

## Banco de dados

- **Um schema Postgres por Bounded Context**: `public` (ingestão), `extracao`, `validacao`, `busca_indexacao`, `orquestracao`, `platform`.
- Schemas Drizzle ficam **dentro do BC** (`.../infrastructure/persistence/schema/*.schema.ts`) e são re-exportados por [`drizzle/schema.ts`](drizzle/schema.ts) — esse é o único ponto que o drizzle-kit lê.
- 21 migrações em `drizzle/`, incluindo: append-only em histórico (`0001`, `0006`), extensão pgvector (`0008`), RLS por tenant (`0013`, `0016`), retrofit de `tenantId` em 002/003/005 (`0017`–`0020`).
- Índice vetorial com **1024 dimensões** (Titan V2) — trocar o modelo de embedding exige migração.

Nova migração:

```bash
# 1. edite o *.schema.ts dentro do BC
# 2. re-exporte em drizzle/schema.ts se for schema novo
pnpm db:generate
pnpm db:migrate
```

## Gateways de IA — Bedrock ou Ollama

Cada agente tem duas implementações do mesmo port de domínio; a escolha é do composition root via `NEXO_AGENTE_IA` (contrato definido no ADR-009):

| Agente | Bedrock | Ollama (local, sem custo) |
|--------|---------|---------------------------|
| Classificador | `bedrock-classificador.gateway.ts` | `ollama-classificador.gateway.ts` |
| Extrator | `bedrock-extrator.gateway.ts` | `ollama-extrator.gateway.ts` |
| Embedding | `bedrock-embedding.gateway.ts` | `ollama-embedding.gateway.ts` |
| Orquestrador | `bedrock-orquestrador.gateway.ts` | `ollama-orquestrador.gateway.ts` |

Puxe os modelos antes do primeiro uso:

```bash
docker compose exec ollama ollama pull llama3.1
docker compose exec ollama ollama pull mxbai-embed-large
```

**O Ollama não prova**: fidelidade de classificação, calibração de confiança, resistência a prompt injection nem p95/custo. É ambiente de desenvolvimento. PoCs documentados em [`docs/poc-ollama-classificador.md`](docs/poc-ollama-classificador.md), [`poc-ollama-embedding.md`](docs/poc-ollama-embedding.md) e [`poc-ollama-orquestrador.md`](docs/poc-ollama-orquestrador.md).

## Testes e qualidade

196 arquivos de teste em `tests/`, espelhando a estrutura de `src/`:

```
tests/
├── bounded-contexts/<bc>/{domain,application,infrastructure,interface}/
├── composition/          # composition roots
├── interface/shared/     # middlewares, problem-details
├── platform/             # conformidade, value objects compartilhados
├── security/isolamento-multitenant/   # vazamento entre tenants
└── shared-kernel/tenant/
```

```bash
pnpm test                       # tudo
pnpm exec vitest run tests/bounded-contexts/extracao   # um BC
pnpm exec vitest --coverage     # cobertura v8 sobre src/**
```

Resultados Allure vão para `allure-results/` (`pnpm exec allure serve allure-results` para o relatório). Relatórios finais de QA por task ficam em `specs/00N-*/{qa,evidence}/`.

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) em todo PR e push na `main`, com Postgres+pgvector como service: lint → typecheck → typecheck infra → `cdk synth` → `db:migrate` → testes → `pnpm audit --audit-level=high`. Dois workflows extras verificam contrato de `AssumeRole` por conta e SCP de segregação de ambientes.

O vitest exclui `.claude/**` da varredura — worktrees de agente vivem dentro do repo e seriam varridas como se fossem código desta árvore.

## Infraestrutura (CDK)

24 stacks em `infra/lib/`, compostas em [`infra/bin/app.ts`](infra/bin/app.ts). Três famílias:

- **Base**: `IngestaoIdentificacaoStorageStack` (S3 versionado), `DominioEventBusStack` (EventBridge).
- **Fila** (`*-queue-stack.ts`): SQS + DLQ + alarme + regra de roteamento no bus — uma por consumidor.
- **Role** (`*-lambda-role-stack.ts`): IAM least-privilege por caso de uso.
- **Função** (`*-function-stack.ts`): `NodejsFunction` real amarrado à role e à fila. **Existem 4**: `IndexadorFunctionStack` (004) e `ContextoClassificacao`/`ContextoExtracao`/`DecisaoWorkflow` (005).

```bash
pnpm exec cdk synth --quiet     # smoke test (roda no CI)
pnpm exec cdk diff
pnpm exec cdk deploy <NomeDaStack>
```

Planejamento de contas/ambientes em [`docs/plano-infra-ambientes.md`](docs/plano-infra-ambientes.md); scripts de verificação de segregação em `infra/scripts/`.

## Estrutura do repositório

```
.
├── .github/workflows/          # CI + verificações de segregação de ambiente
├── .specify/
│   ├── memory/constitution.md  # constituição do projeto (fonte de verdade)
│   └── templates/              # templates spec/plan/tasks/checklist
├── docker/postgres/init/       # habilita pgvector no container local
├── docs/
│   ├── arquitetura-escopo-completo.md   # diagrama macro (Mermaid)
│   ├── openapi.yaml                     # contrato HTTP
│   ├── api-contrato-frontend.md         # guia de consumo pelo frontend
│   ├── estado-funcionalidades.md        # inventário de produto (pronto vs. falta)
│   ├── plano-finalizacao.md             # ordem de fechamento, issue a issue
│   ├── plano-infra-ambientes.md         # contas, ambientes, segregação
│   ├── poc-ollama-*.md                  # PoCs de IA local
│   └── architecture-diagrams/           # ADRs 004/008/009 em HTML
├── drizzle/                    # migrações SQL + schema.ts agregador
├── infra/                      # CDK (bin/app.ts + lib/*-stack.ts + scripts/)
├── specs/00N-slug/             # uma pasta por feature (Spec-Driven)
│   └── {spec,plan,tasks}.md + bugs/ + qa/ + evidence/ + diagrams/
├── src/
│   ├── bounded-contexts/<bc>/{domain,application,infrastructure,interface}/
│   ├── composition/            # composition roots (um por BC) + clientes AWS
│   ├── dev/                    # execução local (local.ts, seed-localstack.ts)
│   ├── interface/shared/       # auth Cognito, tenant context, problem-details
│   ├── platform/               # conformidade LGPD, VOs compartilhados
│   └── shared-kernel/          # TenantId, base de repositório tenant-scoped, db
├── tests/                      # espelha src/ + tests/security
└── .claude/{agents,skills}/    # subagentes e skills speckit-*
```

Convenções de nome dentro de um BC: `*.aggregate.ts`, `*.vo.ts`, `*.event.ts`, `*.gateway.ts` (port), `*.acl.ts` (Anti-Corruption Layer), `*.repository.ts`, `*.controller.ts`, `*.handler.ts` (consumidor de fila), `*.production.ts` (`export const handler` da Lambda).

## Fluxo de trabalho (Spec-Driven Development)

Toda feature nova (não CRUD trivial) segue o ciclo — especificação de comportamento e desenho de arquitetura são etapas **separadas e sequenciais**:

1. **`/speckit-specify`** → `spec.md` (comportamento, o *quê* — sem decidir stack)
2. **`/speckit-clarify`** → resolve ambiguidades da spec
3. **`/speckit-plan`** → `plan.md` (arquitetura, com gate obrigatório **Constitution Check**)
4. **`/speckit-tasks`** → `tasks.md` (tarefas ordenadas por dependência)
5. **`/speckit-taskstoissues`** → issues rastreáveis no GitHub
6. **`/speckit-implement`** → implementação a partir dos artefatos aprovados
7. **`/speckit-analyze`** / **`/speckit-converge`** → consistência entre artefatos e código

### Agentes do time (`.claude/agents/`)

| Agente | Responsabilidade |
|--------|------------------|
| `gerente-produto` | Refina briefing em `spec.md` (comportamento) |
| `arquiteto-back` | Desenha arquitetura DDD, produz `plan.md`/`tasks.md`/ADRs |
| `dev-back-end` | Implementa tasks `ready`; reserva issue via skill `claim-issue` |
| `backend-reviewer` | Revisa corretude, fronteiras DDD e infraestrutura |
| `qa` | Testes automatizados, Allure, cobertura, gate de qualidade |
| `devops` | CDK, CI/CD, ambientes, observabilidade |

Um PR só encerra com aprovação de `backend-reviewer` **e** `qa`. O QA nunca corrige código de produção — documenta o defeito e devolve ao `dev-back-end`.

Commits seguem convenção `[00N] Txxx: descrição (#issue)` ou Conventional Commits (`fix(infra): ...`) para mudanças transversais.

## Roadmap e lacunas conhecidas

**Fases** (sequenciamento vinculante pelo Princípio VIII):

- **Fase 01 · Fundação** — canais de ingestão, pipeline de eventos, Classificador, Extrator.
- **Fase 02 · Inteligência** — Validador, busca semântica, orquestração de workflow.
- **Fase 03 · Escala & Produto** — multi-tenant, hardening de segurança/LGPD, otimização de custo.

**Lacunas abertas** (detalhe e issues em [`docs/plano-finalizacao.md`](docs/plano-finalizacao.md)):

| Lacuna | Impacto |
|--------|---------|
| Sem `*-function-stack.ts` para 001/002/003 | `classificador-queue`, `extrator-queue` e `validador-queue` têm handler + role, mas não são implantáveis (#613, #614, #615/#616) |
| Lambda MarkItDown inexistente | PDF/XLSX/imagem não são convertidos em lugar nenhum (#588, #590) |
| `events:PutEvents` faltando em roles de 001/002 | Publicação de evento falharia mesmo com Lambda implantada (ADR-004, #576–#580) |
| `RegistrarDecisaoHumanaWorkflow` + controller | 005 não fecha o ciclo de escalonamento ao comprador (#248, #250) |
| Categorização de item por agente | Regra de faixa de preço de 003 ainda não é confiável (#149–#155) |
| BC Acompanhamento quase vazio | Exportação de auditoria de 007 sem domínio/persistência (#283–#301) |
| Modelo Bedrock do Orquestrador indefinido | Bloqueia 005 com Bedrock real; não afeta stubs/Ollama (#664) |
| 008 (LGPD) e 009 (custo) | Domínio isolado, sem consumidor no fluxo — 62 de 71 issues abertas |
| Pipeline local para em 002 | 003/004/005 sem wiring de execução local |

## Contribuindo

1. Leia a [constituição](.specify/memory/constitution.md) — ela prevalece sobre preferência individual de stack/design.
2. Nova feature começa por `spec.md`, nunca por código.
3. `plan.md` sem seção **Constitution Check** aprovada não avança para implementação.
4. Reserve a issue via skill `claim-issue` antes de começar a implementar.
5. `nvm use` antes de instalar/commitar — o pre-commit depende da versão do `.nvmrc`.
6. Antes de abrir PR: `pnpm lint && pnpm typecheck && pnpm typecheck:infra && pnpm test`.
7. Não promova stub de desenvolvimento (`src/dev/`) a adaptador de produção — quando o serviço real existir, o caminho é rodá-lo no LocalStack e usar o ACL de produção.

---

_Documentação macro adicional em [`docs/`](docs/) — briefing, apresentação executiva, arquitetura macro e diagramas de ADR em HTML._
