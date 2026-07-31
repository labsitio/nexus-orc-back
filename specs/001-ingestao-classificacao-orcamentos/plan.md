# Implementation Plan: Pipeline de Ingestão e Classificação de Orçamentos

**Branch**: `001-ingestao-classificacao-orcamentos` | **Date**: 2026-07-29 | **Spec**: `specs/001-ingestao-classificacao-orcamentos/spec.md`

**Input**: Feature specification from `/specs/001-ingestao-classificacao-orcamentos/spec.md` (status: clarified, versão 4)

**Nota de convenção**: esta é a primeira spec arquitetada do projeto. Toda nomenclatura de Bounded Context, convenção de Domain Event e layout de pastas definidos aqui são a base que as specs 002–009 MUST respeitar, salvo ADR explícito de desvio.

## Summary

Requisito primário: 4 canais de ingestão (portal web, API REST, SFTP, app mobile) convergem para um único Gateway de Ingestão que grava o orçamento bruto de forma imutável, gera identificador canônico, e publica evento de domínio que dispara classificação automática de fornecedor/formato via IA generativa (Bedrock), com escalonamento direto de baixa confiança para uma fila de revisão humana assíncrona, sem nunca autoaprovar silenciosamente e sem nunca bloquear o pipeline de outros documentos.

Abordagem técnica: arquitetura orientada a eventos 100% serverless na AWS (API Gateway + Lambda + EventBridge + SQS + S3 + Aurora Serverless v2 Postgres), com DDD tático aplicado ao Bounded Context "Ingestão & Identificação" — um agregado raiz (`Orcamento`, escopo deste contexto), Value Objects para os conceitos de canal/confiança/resultado, e Domain Events como único mecanismo de acoplamento entre Gateway → Classificador → Escalonamento humano, conforme Princípio II da constituição.

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, sobre Node.js 24 (LTS ativa a partir de 2026; Node 22 permanece em manutenção). Node 24 é a escolha recomendada por ser a LTS corrente no início da implementação (2026-07) — Ricardo MUST reconfirmar a LTS vigente em nodejs.org/en/about/previous-releases no momento real do `npm init`, pois a linha LTS pode mudar antes da implementação começar.

**Primary Dependencies**: Zod 4.4.x (validação de borda, contratos OpenAPI derivados dos schemas); AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`); Fastify (camada Interface, handlers Lambda via `@fastify/aws-lambda` ou adaptador equivalente — a confirmar em `research.md`/decisão de Ricardo, não bloqueia este plano); MarkItDown (Python, invocado via Lambda Layer ou container — usado aqui apenas para produzir uma representação textual leve do documento bruto como insumo do prompt do Classificador, não para extração estruturada completa, que é escopo da spec 002); Drizzle ORM (Aurora Serverless v2 Postgres) — preferido a Prisma por menor overhead em cold start Lambda (ADR-001).

**Storage**: Amazon S3 (bucket `nexo-orcamentos-raw`, versionado, políticas deny-overwrite/deny-delete) para o dado bruto imutável (Princípio III); Aurora Serverless v2 Postgres para estado atual + histórico append-only do agregado `Orcamento` deste contexto.

**Testing**: Vitest (unit para Domain/Application, sem mocks de rede no Domain); testes de contrato para endpoints REST; testes de integração local contra LocalStack para S3/SQS/EventBridge (execução cabe a Ricardo/CI, não a este agente).

**Target Platform**: AWS Lambda (Node.js 24 runtime managed) atrás de API Gateway; AWS Transfer Family (SFTP) com trigger S3→Lambda; EventBridge custom bus.

**Project Type**: Web service (API + pipeline de eventos assíncrono), monorepo único (sem frontend neste time, por Additional Constraint da constituição v1.2.0).

**Performance Goals**: p95 ≤ 5 minutos entre "orçamento recebido" e resultado de classificação disponível (Classificador ou marcação de escalonamento) — meta definida na spec, não medida ainda (produto novo).

**Constraints**: cold start Lambda é variável real de design para o Classificador (chamada síncrona a Bedrock pode levar segundos) — considerar Provisioned Concurrency se p95 real ultrapassar a meta após medição; MarkItDown roda fora do event loop de I/O do Lambda de conversão (é CPU-bound sobre parsing de documento) — isolar em Lambda dedicado com memória dimensionada, nunca dentro do handler síncrono do Gateway de Ingestão.

**Scale/Scope**: 1 Bounded Context (Ingestão & Identificação), 1 agregado raiz, 4 canais de entrada, 1 agente de IA (Classificador), 1 fila de escalonamento humano. Escala de volume não informada na spec — dimensionamento de concorrência SQS/Lambda a validar com Ricardo/produto antes de definir throughput de fila.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0 — PASS em todos os princípios, nenhuma exceção registrada.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Tabela `orcamento_historico` append-only grava origem, timestamp e agente de cada etapa; reconstruível por `OrcamentoId` sem depender de log efêmero | PASS |
| II. Desacoplamento por eventos | Gateway → Classificador → Escalonamento humano comunicam-se exclusivamente via EventBridge; nenhum componente chama implementação interna de outro; SQS por consumidor evita bloqueio entre documentos | PASS |
| III. Dado bruto imutável | S3 versionado + bucket policy deny-overwrite/deny-delete; cada etapa grava novo registro/versão, nunca sobrescreve o objeto raw | PASS |
| IV. Exceção nunca silenciosa | Cadeia Classificador → fila de escalonamento humano assíncrona implementa Princípio IV(b) explicitamente; o agente não pode reportar confiança artificial (ACL valida faixa 0–100 e exige `NivelConfianca` como VO, nunca número solto do LLM sem validação); fila nunca autoaprova por tempo/volume | PASS |
| V. IA generativa como motor de entendimento | Classificador é 100% Bedrock, sem regra fixa por fornecedor; heurística de negócio (limiar 80%) fica na camada de Application/Domain, não como substituto do entendimento de conteúdo | PASS |
| VI. Serverless-first | Toda a stack é Lambda/managed (API Gateway, EventBridge, SQS, S3, Aurora Serverless v2); nenhum servidor fixo ocioso introduzido | PASS |
| VII. Segurança e LGPD desde o desenho | Ver seção Segurança do Relatório Final; dado de contato de fornecedor tratado com least-privilege IAM, criptografia em repouso (SSE-KMS) e em trânsito (TLS), retenção via S3 lifecycle | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec não depende de Extração (002), Validação (003), Indexação (004), Orquestrador completo (005) ou Multi-tenant (007) — todos tratados como "Fora de escopo" já na própria spec | PASS |
| Additional Constraint — 4 canais fixos, gateway único | Todos os 4 canais convergem para o mesmo caso de uso `ReceberOrcamento` e o mesmo evento `OrcamentoRecebido` | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Apenas o Classificador (papel fixo) é usado nesta spec; o tratamento de exceção de baixa confiança é escalonamento humano direto, sem agente de IA adicional | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; Portal do Gestor tratado como consumidor externo do contrato de API/evento | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Conversão bruta do documento para texto usa MarkItDown open-source; nenhum uso de Textract nesta spec | PASS |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida pelo desenho de agregado/eventos abaixo — gate permanece PASS.

**Re-check pós T023/spec 002 (2026-07-31)**: ADR-003 (abaixo) enriquece o payload de `OrcamentoClassificado` com `referenciaBruta`, resolvendo dependência de contrato sinalizada como risco remanescente no `plan.md` da spec 002. Mudança aditiva sobre Value Object de evento já existente, sem alterar invariante do agregado `Orcamento` — gate permanece PASS, nenhuma violação nova.

## Convenções estabelecidas nesta spec (vinculantes para specs 002–009)

1. **Nomenclatura de Bounded Context**: nome estratégico do contexto vem do Context Map macro (candidatos: Ingestão & Identificação, Extração, Validação, Busca & Indexação, Orquestração, Acompanhamento). O nome da pasta `specs/00N-slug-tatico` é o nome tático da feature, não o nome do Bounded Context — uma spec pode ser um recorte parcial de um BC maior. Esta spec pertence ao BC **Ingestão & Identificação**.
2. **Cada Bounded Context tem seu próprio modelo de "Orçamento"** — nunca um agregado global compartilhado entre contextos (ver system prompt do arquiteto). Neste contexto, `Orcamento` é uma referência de ingestão + resultado de classificação; NÃO contém itens, preços ou condições comerciais (isso pertence ao contexto de Extração, spec 002, com seu próprio agregado).
3. **Convenção de nome de Domain Event**: `<Agregado><ParticípioPassado>`, em português, um evento por transição real de estado do pipeline (nunca um evento genérico "OrcamentoAtualizado"). `detail-type` do EventBridge = nome do evento; `source` = `nexo.ingestao-identificacao`; payload sempre inclui `schemaVersion` (inteiro, começa em 1) e `orcamentoId`.
4. **Bus de eventos**: um único EventBridge custom bus `nexo-dominio-bus` compartilhado por todos os Bounded Contexts do produto (não um bus por contexto) — roteamento por regra/`detail-type`, não por bus separado, para manter um único ponto de auditoria de todos os eventos de domínio (reforça Princípio I).
5. **Layout de código por Bounded Context** (monorepo único): `src/bounded-contexts/<slug-do-bc>/{domain,application,infrastructure,interface}`. Código nunca compartilhado por import direto entre contextos — comunicação sempre via evento ou, quando síncrona e inevitável, via um cliente HTTP/SDK explícito tratado como Anti-Corruption Layer.
6. **Identificador canônico**: `OrcamentoId` é UUID v7 (ordenável por tempo, facilita índice/paginação em Aurora), gerado exclusivamente no Gateway de Ingestão deste contexto. Qualquer referência externa (ex.: número de cotação do ERP do fornecedor) é armazenada como metadado (`referenciaExterna`), nunca como identidade.
7. **Evolução de payload de evento já publicado**: adicionar um campo a um evento existente é mudança aditiva/compatível (nenhum consumidor existente quebra ao ignorar campo novo) e NÃO exige incrementar `schemaVersion` — reservar o incremento de `schemaVersion` para mudança que remova, renomeie ou altere semântica de campo existente (ver ADR-003).

## Bounded Context e Context Map (recorte desta spec)

```text
[Fornecedor] --(4 canais)--> [Gateway de Ingestão]  }
                                     |                } BC: Ingestão & Identificação
                              OrcamentoRecebido        } (agregado Orcamento, escopo local)
                                     v                }
                          [Agente Classificador]
                                     |
                        (>=80%) OrcamentoClassificado
                                     |
                                     v          (<80%) OrcamentoEscalonadoParaRevisaoHumana
                                     +--------------------------> [Fila de escalonamento assíncrona]
                                                                           |
                                                       (confirmação humana explícita, via API)
                                                                           v
                                                       OrcamentoReclassificadoPorRevisaoHumana

Consumidores externos (fora deste BC, apenas via evento/API — nunca chamada direta):
  - BC Extração (spec 002): assina OrcamentoClassificado para iniciar extração de itens (payload inclui `referenciaBruta`, ver ADR-003 — Extração nunca chama a Ingestão para obter esse ponteiro).
  - BC Acompanhamento / consumidor de frontend externo: assina todos os eventos + consulta GET /orcamentos/{id}/status.
```

Relação entre contextos: **Customer/Supplier** — Ingestão & Identificação é upstream (supplier) de Extração e de Acompanhamento; nenhum destes contextos MUST alterar o modelo de dado de Ingestão diretamente, apenas consumir seus eventos/API.

**Anti-Corruption Layer obrigatória**: entre o Domain deste contexto e (a) a resposta bruta do Bedrock (Classificador) e (b) a saída do MarkItDown. Nenhuma dessas respostas cruza para dentro do Domain sem passar por um tradutor explícito (`BedrockClassificacaoACL`, `MarkItDownConversaoACL`) que produz Value Objects validados — nunca o JSON/texto bruto do fornecedor ou do modelo.

## Domain — Agregados, VOs, Domain Events

### Agregado raiz: `Orcamento` (escopo: Ingestão & Identificação)

- **Identidade**: `OrcamentoId` (UUID v7).
- **Atributos**: `canal` (VO `Canal`: PORTAL_WEB | API_REST | SFTP | APP_MOBILE), `recebidoEm` (timestamp), `referenciaBruta` (VO `ReferenciaS3`: bucket+key+versionId, imutável), `referenciaExterna` (opcional, string livre, nunca identidade), `status` (VO `StatusOrcamento`: RECEBIDO | CLASSIFICADO | PENDENTE_REVISAO_HUMANA), `resultadoAtual` (VO `ResultadoClassificacao`, opcional até haver decisão com confiança suficiente), `historico` (lista imutável de `TentativaClassificacao`, append-only).
- **Invariantes** (aplicadas nos métodos do agregado, nunca na Application):
  - Só transita para `CLASSIFICADO` se `resultadoAtual.nivelConfianca >= LIMIAR_CONFIANCA (80)`.
  - `registrarTentativaClassificador(resultado)`: se confiança < 80, transita diretamente para `PENDENTE_REVISAO_HUMANA`, nunca para `CLASSIFICADO` (não há reprocessamento automático por IA — o Agente Revisor foi removido na versão 5 da spec).
  - `registrarConfirmacaoHumana(resultado)`: só é uma transição válida a partir de `PENDENTE_REVISAO_HUMANA`; nunca apaga `historico`, apenas anexa.
  - Qualquer tentativa de sobrescrever `referenciaBruta` após criação lança erro de domínio (`ReferenciaBrutaImutavelError`).

### Value Objects

- `OrcamentoId` — UUID v7, valida formato.
- `Canal` — enum fechado, rejeita qualquer valor fora dos 4 canais fixos.
- `NivelConfianca` — inteiro 0–100, lança erro de domínio fora da faixa; nunca aceita `number` primitivo sem essa validação em nenhum ponto do sistema.
- `ResultadoClassificacao` — `{ fornecedorIdentificado, formatoIdentificado, nivelConfianca: NivelConfianca, agenteOrigem: 'CLASSIFICADOR' | 'HUMANO' }`.
- `TentativaClassificacao` — entrada de histórico imutável: `{ agente, resultado ou motivoInsucesso, timestamp }`.
- `ReferenciaS3` — `{ bucket, key, versionId }`, garante que toda leitura de bruto referencia uma versão específica e imutável.
- `ReferenciaFornecedorAutodeclarada` — VO opcional, explicitamente marcado como "nunca base suficiente isolada" via type system (não é aceito como parâmetro de nenhum construtor de `ResultadoClassificacao` com confiança implícita).

### Domain Events (payload sempre com `schemaVersion: 1`, `orcamentoId`, `ocorreuEm`)

1. `OrcamentoRecebido` — publicado pelo caso de uso `ReceberOrcamento`. Payload: canal, referenciaBruta (ponteiro, não o arquivo), referenciaExterna opcional.
2. `OrcamentoClassificado` — publicado quando o Classificador atinge confiança ≥ 80% (`agenteOrigem: 'CLASSIFICADOR'`). Payload: `resultado` (VO `ResultadoClassificacao`) + `referenciaBruta` (VO `ReferenciaS3`, cópia do ponteiro do agregado — ADR-003). Consumido pelo BC Extração (spec 002), que lê o arquivo bruto usando esse ponteiro sem chamada síncrona de volta à Ingestão.
3. `OrcamentoEscalonadoParaRevisaoHumana` — publicado quando o Classificador fica < 80%. Consumido pelo Acompanhamento/consumidor externo para exibir "pendente" e alimentar a fila de escalonamento humano.
4. `OrcamentoReclassificadoPorRevisaoHumana` — publicado após confirmação humana explícita via API; reaproveita o mesmo shape de `OrcamentoClassificado` com `agenteOrigem: 'HUMANO'` mais um evento próprio para auditoria da correção manual.

Nota: `OrcamentoClassificado` é o único evento que a Extração (002) precisa assinar; specs futuras MUST assinar apenas os eventos de saída documentados no Context Map acima, nunca eventos internos de transição intermediária.

## Application — Casos de uso

- `ReceberOrcamento(canal, arquivo, referenciaExternaOpcional)` — grava bruto no S3 (via `ArmazenamentoBrutoGateway`), cria agregado, persiste, publica `OrcamentoRecebido`. Idempotência: aceita `Idempotency-Key` opcional na borda REST; se repetida dentro de 24h, retorna o `OrcamentoId` já existente sem duplicar o registro (tabela `idempotency_keys` com TTL).
- `ClassificarOrcamento(orcamentoId)` — consumidor do evento `OrcamentoRecebido` (via SQS). Busca arquivo bruto, converte via `MarkItDownConversaoACL`, invoca `AgenteClassificadorGateway`, aplica `Orcamento.registrarTentativaClassificador`, persiste, publica `OrcamentoClassificado` (≥80%, payload inclui `orcamento.referenciaBruta` — ADR-003) ou `OrcamentoEscalonadoParaRevisaoHumana` (<80%).
- `ConfirmarRevisaoHumana(orcamentoId, resultadoConfirmado)` — caso de uso síncrono acionado pelo endpoint REST de confirmação. Valida que o agregado está em `PENDENTE_REVISAO_HUMANA`, aplica `registrarConfirmacaoHumana`, publica `OrcamentoReclassificadoPorRevisaoHumana`.
- `ConsultarStatusOrcamento(orcamentoId)` — query, retorna status atual + histórico completo (nunca escreve).

Todos os casos de uso publicam evento via interface `EventPublisher` (implementada na Infra sobre EventBridge) — nunca chamam SDK AWS diretamente.

## Infrastructure

- `S3ArmazenamentoBrutoGateway` — implementa `ArmazenamentoBrutoGateway`; bucket `nexo-orcamentos-raw`, versionamento + Object Lock em modo governance (ou bucket policy deny `s3:DeleteObject`/`s3:PutObject` sobre chave existente), SSE-KMS.
- `BedrockClassificadorGateway` — implementa o gateway do agente Classificador, com seu `ACL` de parsing de resposta (structured output/tool-use do Bedrock, nunca parsing de texto livre por regex).
- `MarkItDownConversaoACL` — invoca MarkItDown (processo isolado/Lambda Layer, CPU-bound, timeout e memória dimensionados) para gerar texto leve do documento; sanitiza o texto antes de compor o prompt do Classificador (ver Segurança).
- `EventBridgePublisher` — implementa `EventPublisher`, publica no bus `nexo-dominio-bus`.
- `DrizzleOrcamentoRepository` — traduz linha↔agregado sobre Aurora Serverless v2 Postgres; tabelas `orcamentos` (estado atual) e `orcamentos_historico` (append-only, nunca UPDATE/DELETE, apenas INSERT).
- Filas SQS por consumidor: `classificador-queue`, com DLQ própria + alarme CloudWatch em mensagem na DLQ (Princípio IV — exceção de infraestrutura também nunca silenciosa).
- IAM: uma role por Lambda (`ReceberOrcamentoLambdaRole`, `ClassificadorLambdaRole`, `ConfirmarRevisaoHumanaLambdaRole`, `ConsultaStatusLambdaRole`), least privilege — ex.: `ClassificadorLambdaRole` tem `bedrock:InvokeModel` restrito ao ARN do(s) modelo(s) aprovado(s), `s3:GetObject` restrito ao prefixo do bucket raw, sem `s3:DeleteObject` em nenhuma role.

## Interface

- `POST /v1/orcamentos/upload-url` — gera URL S3 presigned de PUT (canal API REST/portal/app mobile: upload direto ao S3, evita limite de payload do API Gateway/Lambda proxy). Retorna `orcamentoId` provisório + URL.
- `POST /v1/orcamentos/{orcamentoId}/confirmar-upload` — confirma que o upload terminou, dispara `ReceberOrcamento` de fato (ponto real de publicação de `OrcamentoRecebido`). Suporta `Idempotency-Key`.
- Trigger S3 (canal SFTP via AWS Transfer Family): objeto novo no prefixo `sftp-incoming/` aciona Lambda que chama `ReceberOrcamento(canal=SFTP, ...)` diretamente (sem upload-url, pois o arquivo já está no S3 via SFTP).
- `GET /v1/orcamentos/{orcamentoId}/status` — retorna status + histórico. Contrato Problem Details (RFC 7807) para erros.
- `POST /v1/orcamentos/{orcamentoId}/revisao-humana` — confirmação humana explícita (body: fornecedor/formato confirmados). Só aceito quando status é `PENDENTE_REVISAO_HUMANA`; caso contrário, 409 Problem Details.
- Todos os endpoints validam entrada via Zod na borda; nenhuma regra de negócio nos controllers — apenas mapeamento request↔Application.
- Autenticação: Cognito (JWT) para os endpoints REST usados por portal/API/app; SFTP autentica via AWS Transfer Family (chave SSH/usuário próprio), sem tocar Cognito.

## Segurança (riscos específicos desta spec)

- **Prompt injection via documento de fornecedor**: o texto convertido pelo MarkItDown é entrada não confiável. Prompt do Classificador MUST isolar esse texto em um bloco delimitado de "conteúdo do documento", nunca concatenado como instrução de sistema; resposta do Bedrock MUST usar saída estruturada (tool-use/JSON Schema) validada pelo ACL — texto livre do modelo nunca é interpretado como comando.
- **Dado bruto imutável e criptografado**: SSE-KMS no bucket raw, chave dedicada, rotação gerenciada.
- **LGPD**: orçamento pode conter dado de contato do fornecedor (não dado pessoal de consumidor final) — retenção via lifecycle policy do S3 (categoria "orçamento", política a parametrizar; SLA de retenção fica pendente de decisão de produto/compliance, registrar como risco remanescente).
- **Least privilege**: ver seção Infrastructure/IAM acima — sem role compartilhada ampla entre os 5 Lambdas deste contexto.

## Project Structure

### Documentation (this feature)

```text
specs/001-ingestao-classificacao-orcamentos/
├── spec.md               # já existente, clarificado (versão 4)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — convenção monorepo único, por Bounded Context

```text
src/
└── bounded-contexts/
    └── ingestao-identificacao/
        ├── domain/
        │   ├── orcamento.aggregate.ts
        │   ├── value-objects/ (orcamento-id, canal, nivel-confianca, resultado-classificacao, referencia-s3, tentativa-classificacao)
        │   ├── events/ (orcamento-recebido, orcamento-classificado, orcamento-escalonado-revisao-humana, orcamento-reclassificado-revisao-humana)
        │   ├── repositories/ (orcamento.repository.ts — interface)
        │   └── gateways/ (agente-classificador.gateway.ts, armazenamento-bruto.gateway.ts, markitdown-conversao.acl.ts — interfaces)
        ├── application/
        │   └── use-cases/ (receber-orcamento, classificar-orcamento, confirmar-revisao-humana, consultar-status-orcamento)
        ├── infrastructure/
        │   ├── persistence/ (drizzle-orcamento.repository.ts, schema/)
        │   ├── aws/ (s3-armazenamento-bruto.gateway.ts, eventbridge.publisher.ts)
        │   ├── bedrock/ (bedrock-classificador.gateway.ts, acl/)
        │   └── markitdown/ (markitdown-conversao.acl.ts)
        └── interface/
            ├── http/ (controllers REST + Zod schemas)
            └── events/ (handlers Lambda consumidores de SQS)

tests/
└── bounded-contexts/ingestao-identificacao/
    ├── domain/ (unit, sem mocks de rede)
    ├── application/ (unit, mocks de gateway/repositório)
    └── contract/ (contratos REST)
```

**Structure Decision**: monorepo único (sem workspace de frontend, por Additional Constraint de escopo backend). Estrutura por Bounded Context estabelecida aqui é a convenção para specs 002–009 (cada uma cria seu próprio subdiretório em `src/bounded-contexts/<slug>/`).

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável.*

## ADRs desta spec

### ADR-001 — ORM: Drizzle em vez de Prisma

**Contexto**: repositório precisa traduzir linha↔agregado sobre Aurora Serverless v2 Postgres, executado em Lambda.

**Problema**: qual ORM/query builder usar sem comprometer cold start e sem vazar modelo relacional para o Domain.

**Alternativas consideradas**: Prisma Client; Drizzle ORM; SQL puro via `pg`/RDS Data API.

**Vantagens (Drizzle)**: bundle menor e sem binário de engine nativo (menor cold start que Prisma, que carrega query engine binária); tipagem gerada a partir do schema TS, sem etapa de geração de client separada; API mais próxima de SQL, facilita repositório expor linguagem de domínio sem esconder demais a query.

**Desvantagens**: ecossistema de migração/tooling menos maduro que Prisma; menos abstração "automágica" (exige mais SQL explícito no repositório).

**Decisão**: Drizzle ORM + Drizzle Kit para migrações.

**Trade-offs**: mais código explícito no repositório, em troca de cold start menor — trade-off aceitável dado Princípio VI (serverless-first) e a meta de p95 de 5 minutos que já inclui latência de Lambda.

**Impactos futuros**: specs 002–009 que também persistam em Aurora MUST usar Drizzle pela mesma razão, salvo ADR de revisão.

### ADR-002 — Upload via presigned URL em vez de multipart direto no API Gateway

**Contexto**: canais portal web/API REST/app mobile precisam enviar arquivo de orçamento (PDF, planilha, imagem), potencialmente maior que o limite prático de payload de integração proxy do API Gateway/Lambda.

**Alternativas consideradas**: multipart direto no endpoint REST (Lambda proxy integration); presigned URL de PUT direto ao S3 seguido de endpoint de confirmação.

**Vantagens (presigned URL)**: sem limite de tamanho de payload de Lambda; upload não consome tempo de execução de Lambda (custo); desacopla o canal do processamento subsequente.

**Desvantagens**: fluxo em duas chamadas (gerar URL, depois confirmar) — mais complexo para o cliente da API; requer o endpoint de confirmação ser a fonte real de disparo de `OrcamentoRecebido`, não o upload em si (upload sem confirmação nunca dispara pipeline — risco de "orfão" no S3 sem registro, mitigado por lifecycle rule de expiração de objetos não confirmados em prefixo temporário).

**Decisão**: presigned URL de PUT + endpoint de confirmação para os 3 canais que fazem upload via API; canal SFTP não usa esse fluxo (o arquivo já chega ao S3 via Transfer Family, trigger direto).

**Trade-offs**: latência adicional de uma chamada extra, aceitável frente à meta de 5 minutos p95 (dominada pela classificação via Bedrock, não pelo upload).

**Impactos futuros**: qualquer canal novo de upload (Additional Constraint da constituição) MUST seguir o mesmo padrão de duas etapas, nunca introduzir upload multipart direto como exceção.

### ADR-003 — `OrcamentoClassificado` passa a incluir `referenciaBruta` no payload (correção retroativa aditiva)

**Contexto**: durante a implementação de T023 (spec 002, handler consumidor de `extrator-queue`), o dev back-end identificou contradição real entre `specs/002-extracao-dados-orcamento/plan.md` (que já assumia, desde a Constitution Check re-check da própria spec 002, a necessidade de `referenciaBruta` no payload de `OrcamentoClassificado`) e o evento efetivamente implementado/mergeado nesta spec (T0xx, PR já fechado), cujo `OrcamentoClassificadoPayload` carrega apenas `resultado` (fornecedor/formato/confiança), sem nenhum ponteiro S3. O caso de uso `ExtrairDadosOrcamento` (spec 002, já mergeado) exige `referenciaBrutaS3` como parâmetro explícito de entrada — sem esse campo no evento, o handler T023 não tem de onde obter o dado sem violar Princípio II (Desacoplamento por eventos).

**Problema**: como o BC Extração obtém a referência S3 do documento bruto (propriedade da Ingestão) para poder lê-lo, dado que o evento upstream já publicado não carrega esse campo.

**Alternativas consideradas**:
(a) Enriquecer o payload de `OrcamentoClassificado` com `referenciaBruta` (VO `ReferenciaS3`, já existente no agregado `Orcamento` — `orcamento.referenciaBruta` — e já copiado para o payload de `OrcamentoRecebido`), mudança aditiva ao Value Object de evento e ao caso de uso `ClassificarOrcamento` que o publica.
(b) Extração consulta o schema/tabela `orcamentos` da Ingestão diretamente (leitura cross-schema no mesmo Aurora).
(c) Versionar o evento para `schemaVersion: 2`, com migração de consumidor.

**Vantagens (a)**: dado já existe no agregado `Orcamento` no momento da publicação do evento (`orcamento.referenciaBruta`, populado desde `ReceberOrcamento`) — nenhuma nova fonte de dado, nenhuma nova invariante, nenhuma nova dependência; preserva Princípio II (nenhuma leitura direta de outro BC); mudança estritamente aditiva de um campo a mais no payload — nenhum consumidor existente quebra ao ignorá-lo (nenhum consumidor real de `OrcamentoClassificado` está em produção hoje além do handler T023 sendo construído); menor diff possível (2 arquivos: o evento e a linha que o instancia em `classificar-orcamento.ts`).

**Desvantagens (a)**: exige tocar código já mergeado de uma spec com todas as issues fechadas — mitigado por ser mudança aditiva/compatível, sem alterar nenhuma invariante do agregado `Orcamento` nem o shape de nenhum campo existente.

**Por que (b) foi descartada**: violaria diretamente o Princípio II ("nunca chama diretamente componente interno da Ingestão") e a convenção 5 desta spec (código nunca compartilhado por import/consulta direta entre contextos) — schema de outro BC não é contrato público, é detalhe de implementação; qualquer mudança de coluna/tabela na Ingestão quebraria silenciosamente a Extração sem nenhum contrato versionado entre as duas.

**Por que (c) foi descartada**: bump de `schemaVersion` é justificado para mudança que remove/renomeia campo ou altera semântica existente; aqui é adição pura, sem consumidor real de produção rodando contra o schema anterior — versionar geraria complexidade de migração de consumidor sem benefício real nesta fase pré-lançamento (YAGNI). Ver convenção 7 (acima) para o critério geral de quando `schemaVersion` deve subir.

**Decisão**: alternativa (a). `OrcamentoClassificadoPayload` passa a incluir `readonly referenciaBruta: ReferenciaS3Params` (mesmo shape de `{ bucket, key, versionId }` já usado em `OrcamentoRecebido`); `ClassificarOrcamento.executar` passa a construir o evento com `orcamento.referenciaBruta` (o dado já está carregado no agregado buscado no início do método, nenhuma leitura adicional). `schemaVersion` permanece `1` (mudança aditiva, não-quebra — ver convenção 7).

Escopo de execução: mudança cirúrgica de 2 arquivos (`orcamento-classificado.event.ts`, `classificar-orcamento.ts`), sem ambiguidade de requisito e sem alterar invariante de agregado — dispensa fluxo Spec Kit completo (exceção prevista no system prompt do arquiteto). Autorizado o próprio dev back-end da trilha de Extração (autor de T023) a implementá-la, mesmo fora do diretório padrão de sua trilha (`ingestao-identificacao/**`), justamente por ser aditiva/compatível e por ser o bloqueador direto de T023 — abrir PR separado, referenciando este ADR-003, escopo limitado exatamente a esses 2 arquivos (nenhuma outra mudança em `ingestao-identificacao/**`). Testes de contrato/unit do evento e do caso de uso desta spec MUST ser atualizados no mesmo PR para cobrir o novo campo.

**Trade-offs**: pequeno retrabalho em uma spec com issues já fechadas, em troca de manter o desacoplamento por eventos como único mecanismo de contrato entre BCs (Princípio II, NON-NEGOTIABLE) — trade-off aceitável, e menor que as alternativas descartadas.

**Impactos futuros**: qualquer spec futura (Validação, 003; Orquestração, 005) que precise de um ponteiro/atributo hoje ausente de um evento já publicado por outra spec MUST seguir o mesmo padrão: mudança aditiva ao payload do evento existente, nunca leitura cross-schema, nunca chamada síncrona cross-BC. `plan.md` da spec consumidora MUST registrar a dependência de contrato explicitamente na Constitution Check (como a spec 002 já fazia) para que a lacuna seja detectada antes da implementação, não durante.
