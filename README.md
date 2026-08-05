# Nexo — Backend (`nexus-orc-back`)

Plataforma de **ingestão, entendimento e processamento automático de orçamentos** de fornecedores para redes varejistas. Este repositório é o **backend exclusivo** do produto: API, pipeline de eventos, agentes de IA e dados — **nunca interface visual** (qualquer frontend é consumidor externo do contrato de API/evento/dado).

> **Estado atual**: fase de **especificação e arquitetura** (Spec-Driven Development). Ainda não há código de implementação — o repositório contém a constituição do projeto, specs de feature clarificadas, planos técnicos e o desenho de arquitetura macro. A implementação segue os artefatos em `specs/`.

---

## O que o Nexo faz

Fornecedores enviam orçamentos em formatos variados (PDF, planilha, imagem) por 4 canais. O pipeline:

1. **Recebe** o orçamento bruto e o grava de forma imutável.
2. **Classifica** fornecedor e formato (IA generativa).
3. **Extrai** dados estruturados (itens, condições comerciais).
4. **Valida** consistência (CNPJ, faixa de preço, prazo — regras determinísticas).
5. **Indexa** para busca semântica em linguagem natural.
6. **Orquestra** a decisão de workflow (aprovar, encaminhar ao comprador, reenviar, integrar a sistema externo).

Toda etapa é auditável ponta a ponta e nenhuma exceção é silenciosa.

## Princípios inegociáveis (constituição)

Regras vinculantes de arquitetura — fonte de verdade em [`.specify/memory/constitution.md`](.specify/memory/constitution.md) (v1.2.0):

| # | Princípio | Resumo |
|---|-----------|--------|
| I | **Rastreabilidade ponta a ponta** | Trilha auditável reconstruível por `OrcamentoId`, sem depender de log efêmero. |
| II | **Desacoplamento por eventos de domínio** | Componentes comunicam-se só por eventos no bus; nenhuma chamada direta entre implementações internas. |
| III | **Dado bruto imutável** | Orçamento original nunca sobrescrito; cada etapa grava nova versão. |
| IV | **Exceção nunca silenciosa** | Baixa confiança gera evento explícito e escala para revisão humana; nunca autoaprova. |
| V | **IA generativa é o motor de entendimento** | Classificação/extração via Bedrock, não regras fixas por fornecedor. |
| VI | **Serverless-first / custo sob demanda** | Preferir managed elástico a capacidade fixa ociosa. |
| VII | **Segurança e LGPD desde o desenho** | Criptografia, menor privilégio, retenção e direito ao esquecimento na spec. |
| VIII | **Roadmap em 3 fases vinculante** | Sequenciamento de entregas é obrigatório. |

**Restrições adicionais**: 4 canais fixos por gateway único · 5 agentes de papel fixo · multi-tenant é Fase 03 · escopo exclusivamente backend · conversão de documento prefere open-source (MarkItDown) a serviço pago (Textract).

## Arquitetura

Arquitetura 100% serverless na AWS, orientada a eventos, com **DDD tático** por Bounded Context. Diagrama completo (Mermaid) e legenda das integrações em [`docs/arquitetura-escopo-completo.md`](docs/arquitetura-escopo-completo.md).

**Bounded Contexts** (`src/bounded-contexts/<slug>/{domain,application,infrastructure,interface}`):

| BC | Fase | Spec | Papel |
|----|------|------|-------|
| Ingestão & Identificação | 01 | 001 | Gateway único + Agente Classificador |
| Extração | 01 | 002 | Agente Extrator (dados estruturados) |
| Validação | 02 | 003 | Regras determinísticas + Categorizador de item |
| Busca & Indexação | 02 | 004 | Embeddings + busca híbrida SQL/pgvector |
| Orquestração | 02 | 005 | Agente Orquestrador (decisão de workflow) |
| Acompanhamento | 03 | 007 | Read-model de auditoria (append-only) |

**Plataforma transversal (Fase 03)**: multi-tenancy via `TenantId` Shared Kernel + Row-Level Security (007), conformidade LGPD (008), otimização de custo — cache DynamoDB + S3 Intelligent-Tiering (009).

Único mecanismo de acoplamento entre BCs: EventBridge custom bus **`nexo-dominio-bus`**. Todo acesso a Bedrock passa por uma **Anti-Corruption Layer** — texto/JSON bruto do modelo nunca cruza para o Domain (mitigação de prompt injection via saída estruturada JSON Schema/tool-use).

## Stack técnica

- **Linguagem**: TypeScript 5.x `strict` · Node.js 24 LTS (`.nvmrc` na raiz — rode `nvm use` antes de instalar/commitar)
- **Runtime**: AWS Lambda atrás de API Gateway · AWS Transfer Family (SFTP)
- **Eventos/mensageria**: EventBridge (bus único) · SQS (uma fila por consumidor)
- **Dados**: S3 versionado (bruto imutável) · Aurora Serverless v2 Postgres (schema próprio por BC) · pgvector (busca) · DynamoDB (cache)
- **IA**: Amazon Bedrock Runtime (`InvokeModel`/tool-use) · Titan Text Embeddings V2
- **Conversão de documento**: MarkItDown (open-source, auto-hospedado)
- **Bibliotecas**: Zod (validação de borda) · Drizzle ORM · Fastify · AWS SDK v3
- **Testes**: Vitest · testes de contrato · integração local via LocalStack

## Estrutura do repositório

```
.
├── .specify/
│   ├── memory/constitution.md      # constituição do projeto (fonte de verdade)
│   └── templates/                  # templates spec/plan/tasks/checklist
├── docs/                           # arquitetura macro, briefing, apresentações
│   └── arquitetura-escopo-completo.md
├── specs/                          # uma pasta por feature (Spec-Driven)
│   └── 00N-slug/{spec,plan,tasks}.md
├── prompts/                        # prompts de criação dos agentes de IA
└── .claude/
    ├── agents/                     # subagentes (gerente-produto, arquiteto-back, ...)
    └── skills/                     # skills speckit-*
```

## Fluxo de trabalho (Spec-Driven Development)

Toda feature nova (não CRUD trivial) segue o ciclo — especificação de comportamento e desenho de arquitetura são etapas **separadas e sequenciais**:

1. **`/speckit-specify`** → `spec.md` (comportamento, o *quê* — sem decidir stack)
2. **`/speckit-clarify`** → resolve ambiguidades da spec
3. **`/speckit-plan`** → `plan.md` (arquitetura, com gate obrigatório **Constitution Check**)
4. **`/speckit-tasks`** → `tasks.md` (tarefas ordenadas por dependência)
5. **`/speckit-taskstoissues`** → issues rastreáveis no GitHub
6. **`/speckit-implement`** → implementação a partir dos artefatos aprovados

### Agentes do time (`.claude/agents/`)

| Agente | Responsabilidade |
|--------|------------------|
| `gerente-produto` | Refina briefing em `spec.md` (comportamento) |
| `arquiteto-back` | Desenha arquitetura DDD, produz `plan.md`/`tasks.md`/ADRs |
| `dev-back-end` | Implementa tasks `ready`; reserva issue via skill `claim-issue` |
| `backend-reviewer` | Revisa corretude, fronteiras DDD e infraestrutura |
| `qa` | Testes automatizados, Allure, cobertura, gate de qualidade |

Um PR só encerra com aprovação de `backend-reviewer` **e** `qa`.

## Roadmap (3 fases — sequenciamento vinculante)

- **Fase 01 · Fundação** — canais de ingestão, pipeline de eventos, Classificador, Extrator.
- **Fase 02 · Inteligência** — Validador, busca semântica, orquestração de workflow.
- **Fase 03 · Escala & Produto** — multi-tenant, hardening de segurança/LGPD, otimização de custo.

## Contribuindo

1. Leia a [constituição](.specify/memory/constitution.md) — ela prevalece sobre preferência individual de stack/design.
2. Nova feature começa por `spec.md`, nunca por código.
3. `plan.md` sem seção **Constitution Check** aprovada não avança para implementação.
4. Reserve a issue via skill `claim-issue` antes de começar a implementar.

---

_Documentação macro adicional em [`docs/`](docs/) (briefing, apresentação executiva, arquitetura macro)._
