# Implementation Plan: Extração de Dados do Orçamento (Agente Extrator)

**Branch**: `002-extracao-dados-orcamento` | **Date**: 2026-07-29 | **Spec**: `specs/002-extracao-dados-orcamento/spec.md`

**Input**: Feature specification from `/specs/002-extracao-dados-orcamento/spec.md` (status: clarified, versão 2)

**Nota de convenção**: este plano herda, sem redefinir, as convenções vinculantes estabelecidas em `specs/001-ingestao-classificacao-orcamentos/plan.md` (nomenclatura de Bounded Context, convenção de Domain Event, bus único `nexo-dominio-bus`, layout de pastas por BC, `OrcamentoId` gerado só pelo Gateway de Ingestão, ADR-001 Drizzle). Todo desvio dessas convenções é registrado explicitamente como ADR nesta spec.

## Summary

Requisito primário: orçamento já classificado (evento `OrcamentoClassificado`, confiança ≥ 80%) tem seus itens, preços e condições comerciais extraídos e estruturados por um Agente Extrator (Bedrock), nunca inventando valor quando a confiança é insuficiente — campo não extraído aciona o mesmo padrão de exceção da spec 001 (Revisor de IA → fila de escalonamento humana), reaproveitado como padrão de governança, não como componente físico compartilhado entre Bounded Contexts.

Abordagem técnica: novo Bounded Context **Extração**, com agregado raiz próprio (`ExtracaoOrcamento`) — nunca reaproveita o agregado `Orcamento` da Ingestão. Comunicação de entrada exclusivamente via assinatura do evento `OrcamentoClassificado` (relação Customer/Supplier, Extração é customer de Ingestão). Conversão de documento bruto via MarkItDown (própria instância deste BC, Additional Constraint de custo da constituição v1.2.0), interpretação semântica via Bedrock. Persistência Aurora Serverless v2 + Drizzle (ADR-001, herdado).

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 (mesma baseline da spec 001 — Ricardo MUST reconfirmar LTS vigente no momento real da implementação).

**Primary Dependencies**: Zod 4.4.x (validação de borda); AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`); Fastify (Interface, mesmo adaptador Lambda da spec 001); MarkItDown (Python, Lambda Layer/container isolado — instância própria deste BC, conversão completa do documento para texto/markdown estruturável, distinta da conversão leve usada pelo Classificador na spec 001); Drizzle ORM (ADR-001 herdado).

**Storage**: leitura (read-only) do bucket `nexo-orcamentos-raw` (S3, propriedade da Ingestão) via referência de ponteiro recebida no payload do evento `OrcamentoClassificado` — Extração nunca escreve nesse bucket. Aurora Serverless v2 Postgres para estado atual + histórico append-only do agregado `ExtracaoOrcamento` (schema/tabelas próprias deste BC, nunca compartilhadas com o schema da Ingestão).

**Testing**: Vitest (unit Domain/Application sem mocks de rede); testes de contrato para os 2 endpoints REST próprios; testes de integração local contra LocalStack para SQS/EventBridge/S3 (execução cabe a Ricardo/CI).

**Target Platform**: AWS Lambda atrás de API Gateway (endpoint de confirmação humana e de status); consumidores SQS para os casos de uso assíncronos; EventBridge custom bus `nexo-dominio-bus` (mesmo bus da spec 001, roteamento por regra/`detail-type`).

**Project Type**: Web service (pipeline de eventos assíncrono + 2 endpoints síncronos), mesmo monorepo único da spec 001 (sem frontend, Additional Constraint de escopo backend).

**Performance Goals**: p95 ≤ 5 minutos entre "orçamento classificado disponível" e "resultado de extração disponível" (sucesso ou marcação de exceção) — meta definida na spec, não medida ainda.

**Constraints**: MarkItDown é CPU-bound (parsing de documento potencialmente maior/mais complexo que o uso leve da spec 001, pois aqui a conversão precisa ser estruturável o suficiente para extração completa de itens) — isolar em Lambda dedicado, nunca no handler síncrono; cold start do `AgenteExtratorGateway`/`AgenteRevisorExtracaoGateway` (chamada síncrona Bedrock) é variável real de design, mesma consideração da spec 001; payload do evento `OrcamentoExtraido` pode crescer com número de itens do orçamento — monitorar contra o limite de 256KB do EventBridge (risco registrado abaixo, não crítico para volume esperado de Fase 01).

**Scale/Scope**: 1 Bounded Context (Extração), 1 agregado raiz, 2 agentes de IA (Extrator + Revisor de Extração — este último é "agente adicional explícito" já autorizado pela constituição, análogo ao Revisor da spec 001, não uma reabertura de papel fixo), 1 fila de escalonamento humana própria deste BC.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0 — PASS em todos os princípios, nenhuma exceção registrada.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Tabela `extracoes_orcamento_historico` append-only grava agente, timestamp e resultado/motivo de insucesso de cada tentativa; reconstruível por `orcamentoId` (referência à identidade canônica da Ingestão) | PASS |
| II. Desacoplamento por eventos | Extração só entra em ação via assinatura de `OrcamentoClassificado` (EventBridge); nunca chama diretamente componente interno da Ingestão; nunca reabre chamada síncrona ao Revisor/fila de escalonamento da Ingestão — implementa seu próprio par Revisor+fila (ADR-002) | PASS |
| III. Dado bruto imutável | Extração é read-only sobre `nexo-orcamentos-raw`; nunca escreve, nunca sobrescreve; resultado de extração é uma nova representação em tabela própria, vinculada por referência, nunca substituindo o bruto ou o resultado de classificação | PASS |
| IV. Exceção nunca silenciosa | Campo obrigatório com confiança insuficiente NUNCA é preenchido com valor inventado (invariante de domínio, ver `CampoExtraido<T>`); aciona Agente Revisor de Extração → fila de escalonamento assíncrona própria; nenhuma fila autoaprova por tempo/volume; histórico de tentativas nunca sobrescrito | PASS |
| V. IA generativa como motor de entendimento | Extrator e Revisor de Extração são 100% Bedrock; regra determinística existe só na invariante de "nunca inventar valor", não como substituto de entendimento de conteúdo | PASS |
| VI. Serverless-first | Toda a stack é Lambda/managed (API Gateway, EventBridge, SQS, Aurora Serverless v2); MarkItDown roda em Lambda Layer/container, sem servidor fixo ocioso | PASS |
| VII. Segurança e LGPD desde o desenho | Ver seção Segurança; dado comercial sensível (preço, condições) tratado com least-privilege IAM, criptografia em repouso (KMS) e trânsito (TLS); LGPD: nenhum novo dado pessoal introduzido além do já tratado na spec 001 | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec (Fase 01) depende apenas de Ingestão (001, também Fase 01); não depende de Validação (003), Indexação (004), Orquestrador completo (005) ou Multi-tenant (007), todos Fase 02/03 | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Agente Extrator mapeado ao papel fixo "Extrator (dados estruturados)"; Agente Revisor de Extração é agente adicional explícito, mesmo padrão já autorizado pela constituição para tratamento de exceção (Princípio IV) | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; correção manual de campo tratada como consumidor externo de frontend, fora de escopo | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Conversão bruta usa MarkItDown (instância própria deste BC); serviço pago só como exceção justificada por escrito (não usada nesta spec) | PASS |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida pelo desenho de agregado/eventos abaixo — gate permanece PASS. Ponto de atenção não-bloqueante: dependência de contrato entre specs — `OrcamentoClassificado` (evento publicado pela spec 001) precisa incluir a `referenciaBruta` (ponteiro S3) no payload para a Extração poder ler o arquivo sem chamada síncrona cross-BC; a spec 001/plan.md atual não detalha explicitamente esse campo no payload de `OrcamentoClassificado` — registrado como risco remanescente e dependência de coordenação com o plano da spec 001 (ver "Riscos remanescentes" no relatório final), não uma violação de princípio.

## Bounded Context e Context Map (recorte desta spec)

```text
[BC: Ingestão & Identificação] --(evento)--> OrcamentoClassificado --(assina)--> [BC: Extração]
                                                                                        |
                                                                          [Agente Extrator (Bedrock)]
                                                                                        |
                                     (todos campos obrigatórios OK) OrcamentoExtraido
                                                        |
                          (1+ campo obrigatório sem confiança) ExtracaoComCamposNaoExtraidosDetectada
                                                        |
                                                        v
                                        [Agente Revisor de Extração (Bedrock)]
                                                        |
                          (resolve) OrcamentoExtraido        (não resolve) ExtracaoEscalonadaParaRevisaoHumana
                                                                                        |
                                                                    [Fila de escalonamento assíncrona — própria da Extração]
                                                                                        |
                                                                (confirmação humana explícita, via API própria)
                                                                                        v
                                                    OrcamentoExtraido (humano forneceu valor)
                                                    OU OrcamentoExtraidoComPendenciaConfirmada (humano confirma indisponibilidade)

Consumidores externos (fora deste BC, apenas via evento/API — nunca chamada direta):
  - BC Validação (spec 003, Fase 02): assina OrcamentoExtraido e OrcamentoExtraidoComPendenciaConfirmada.
  - BC Acompanhamento / consumidor de frontend externo: assina todos os eventos + consulta GET /orcamentos/{id}/extracao/status.
```

Relação entre contextos: **Customer/Supplier** — Ingestão & Identificação é upstream (supplier) de Extração; Extração é upstream de Validação. Extração nunca altera o modelo de dado da Ingestão, apenas consome seu evento e lê (read-only) o arquivo bruto referenciado.

**Anti-Corruption Layer obrigatória**: entre o Domain deste contexto e (a) a resposta bruta do Bedrock (Extrator/Revisor de Extração) e (b) a saída do MarkItDown. Nenhuma dessas respostas cruza para dentro do Domain sem passar por um tradutor explícito (`BedrockExtracaoACL`, `MarkItDownConversaoExtracaoACL`) que produz Value Objects validados — nunca o JSON/texto bruto do modelo ou do documento do fornecedor.

## Domain — Agregados, VOs, Domain Events

### Agregado raiz: `ExtracaoOrcamento` (escopo: Extração)

- **Identidade**: `orcamentoId` (mesmo valor de `OrcamentoId`, UUID v7, gerado exclusivamente pela Ingestão — Extração reutiliza o valor como referência/identidade correlata do seu próprio agregado 1:1, nunca gera um novo identificador para o mesmo orçamento real; VO `OrcamentoId` redefinido localmente neste BC, sem import cruzado do código da Ingestão, por convenção de layout da spec 001).
- **Atributos**: `referenciaClassificacao` (VO `ReferenciaClassificacao`: `{ fornecedorIdentificado, formatoIdentificado, agenteOrigem }`, copiado do payload do evento `OrcamentoClassificado` no momento da criação, imutável depois), `referenciaBrutaS3` (VO `ReferenciaS3`, copiado do mesmo payload, read-only), `status` (VO `StatusExtracao`: PENDENTE | EXTRAIDO | EM_REVISAO_AUTOMATICA | PENDENTE_REVISAO_HUMANA | EXTRAIDO_COM_PENDENCIA_CONFIRMADA), `itens` (lista de VO `ItemOrcamento`), `condicoesComerciais` (VO `CondicoesComerciais`), `historico` (lista imutável de `TentativaExtracao`, append-only).
- **Invariantes** (aplicadas nos métodos do agregado, nunca na Application):
  - Nenhum campo de `ItemOrcamento` ou `CondicoesComerciais` MUST aceitar valor com `confianca` insuficiente marcado como `extraido: true` — construtor de `CampoExtraido<T>` força `valor: null` quando `extraido: false`; é estruturalmente impossível "inventar" um valor (Ação proibida crítica da spec).
  - Só transita para `EXTRAIDO` quando todos os campos obrigatórios de todos os itens (sku/descrição, quantidade, preço unitário) e de `CondicoesComerciais` (pagamento, validade, entrega) têm `extraido: true` com confiança suficiente.
  - `registrarTentativaExtrator(resultado)`: qualquer campo obrigatório sem confiança suficiente transita o agregado para `EM_REVISAO_AUTOMATICA`, nunca para `EXTRAIDO` parcial silencioso.
  - `registrarTentativaRevisorExtracao(resultado)`: mesma regra do Revisor da spec 001 — só uma tentativa; se ainda houver campo obrigatório sem confiança suficiente, transita para `PENDENTE_REVISAO_HUMANA`, nunca reabre uma segunda tentativa automática.
  - `registrarConfirmacaoHumana(camposConfirmados)`: só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`; se humano fornece valor real para todos os campos pendentes → `EXTRAIDO`; se humano confirma explicitamente que 1+ campo não está disponível no documento → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA` (terminal, não é falha, é decisão humana definitiva); nunca reabre campo já extraído com sucesso; nunca apaga `historico`, apenas anexa.
  - Qualquer tentativa de sobrescrever `referenciaBrutaS3` ou `referenciaClassificacao` após criação lança erro de domínio (`ReferenciaImutavelError`).

### Value Objects

- `OrcamentoId` — mesmo formato/validação da spec 001 (UUID v7), redefinido localmente neste BC (VO simples, duplicação aceitável — não é lógica de negócio compartilhada, é apenas o formato de um identificador).
- `NivelConfianca` — inteiro 0–100, mesma regra da spec 001 (redefinido localmente, mesmo racional).
- `CampoExtraido<T>` — `{ valor: T | null, confianca: NivelConfianca, extraido: boolean, agenteOrigem: 'EXTRATOR' | 'REVISOR' | 'HUMANO' }`; construtor MUST garantir `extraido === false ⟺ valor === null`.
- `Dinheiro` — valor monetário com moeda, nunca `number` primitivo solto (conforme padrão de VO do system prompt).
- `Quantidade` — inteiro/decimal positivo, valida faixa mínima.
- `DescricaoProduto` — `{ sku (opcional), descricao }`, valida não-vazio quando `extraido: true`.
- `ItemOrcamento` — `{ descricao: CampoExtraido<DescricaoProduto>, quantidade: CampoExtraido<Quantidade>, precoUnitario: CampoExtraido<Dinheiro> }`.
- `PeriodoValidade` — data/prazo de validade da proposta, nunca `string` solta.
- `CondicoesComerciais` — `{ condicoesPagamento: CampoExtraido<string>, prazoValidade: CampoExtraido<PeriodoValidade>, condicoesEntrega: CampoExtraido<string> }`.
- `ReferenciaClassificacao` — `{ fornecedorIdentificado, formatoIdentificado, agenteOrigem }`, cópia imutável do payload do evento upstream.
- `ReferenciaS3` — mesmo shape da spec 001 (`bucket`, `key`, `versionId`), redefinido localmente, read-only aqui.
- `TentativaExtracao` — entrada de histórico imutável: `{ agente, resultado ou motivoInsucesso, timestamp }`.

### Domain Events (payload sempre com `schemaVersion: 1`, `orcamentoId`, `ocorreuEm`; `source: nexo.extracao`)

1. `OrcamentoExtraido` — publicado quando `ExtracaoOrcamento` transita para `EXTRAIDO` (Extrator, Revisor de Extração, ou confirmação humana com valor real — campo `agenteOrigem` por item no payload distingue). Payload: `itens`, `condicoesComerciais` (estrutura completa — ver risco de tamanho de payload no Technical Context). Consumido pelo futuro BC Validação (003) e por Acompanhamento.
2. `ExtracaoComCamposNaoExtraidosDetectada` — publicado internamente pelo caso de uso de extração quando o Extrator não atinge confiança suficiente em 1+ campo obrigatório; único gatilho para acionar o Revisor de Extração (nunca chamada direta). Evento interno, não é contrato externo estável.
3. `ExtracaoEscalonadaParaRevisaoHumana` — publicado quando o Revisor de Extração também não resolve 1+ campo obrigatório. Consumido pelo Acompanhamento/consumidor externo para exibir "pendente".
4. `OrcamentoExtraidoComPendenciaConfirmada` — publicado quando humano confirma explicitamente que 1+ campo obrigatório não está disponível no documento (decisão definitiva, não é falha silenciosa — Princípio IV satisfeito por decisão humana explícita e auditável). Payload inclui os mesmos campos de `OrcamentoExtraido`, com os campos pendentes explicitamente `extraido: false` e `agenteOrigem: 'HUMANO'` na decisão de confirmação (não no valor, que permanece null).

Nota: `OrcamentoExtraido` e `OrcamentoExtraidoComPendenciaConfirmada` são os dois únicos eventos de saída estáveis que a Validação (003) precisa assinar — `ExtracaoComCamposNaoExtraidosDetectada` é detalhe de implementação interno, mesmo padrão já estabelecido pela spec 001 para `OrcamentoBaixaConfiancaDetectada`.

## Application — Casos de uso

- `ExtrairDadosOrcamento(orcamentoId, referenciaClassificacao, referenciaBrutaS3)` — consumidor do evento `OrcamentoClassificado` (via SQS). Cria o agregado `ExtracaoOrcamento` (primeira tentativa) ou recupera existente, lê arquivo bruto (read-only) via `LeituraBrutaGateway`, converte via `MarkItDownConversaoExtracaoACL`, invoca `AgenteExtratorGateway` com o texto convertido + contexto de classificação (fornecedor/formato) para melhorar o prompt, aplica `ExtracaoOrcamento.registrarTentativaExtrator`, persiste, publica `OrcamentoExtraido` ou `ExtracaoComCamposNaoExtraidosDetectada`.
- `RevisarExtracaoComIA(orcamentoId)` — consumidor de `ExtracaoComCamposNaoExtraidosDetectada`. Mesmo fluxo com `AgenteRevisorExtracaoGateway` + contexto adicional (campos já extraídos com sucesso, para focar só no que falta). Publica `OrcamentoExtraido` ou `ExtracaoEscalonadaParaRevisaoHumana`.
- `ConfirmarRevisaoHumanaExtracao(orcamentoId, camposConfirmados)` — caso de uso síncrono acionado pelo endpoint REST de confirmação. Valida que o agregado está em `PENDENTE_REVISAO_HUMANA`, aplica `registrarConfirmacaoHumana`, publica `OrcamentoExtraido` (se todos os campos pendentes receberam valor real) ou `OrcamentoExtraidoComPendenciaConfirmada` (se 1+ campo foi confirmado como indisponível).
- `ConsultarStatusExtracao(orcamentoId)` — query, retorna status atual + itens + condições comerciais + histórico completo (nunca escreve).

Todos os casos de uso publicam evento via a mesma interface `EventPublisher` (implementada na Infra sobre EventBridge, instância própria deste BC apontando para o mesmo bus `nexo-dominio-bus`) — nunca chamam SDK AWS diretamente.

## Infrastructure

- `LeituraBrutaGateway` — implementação read-only de leitura do bucket `nexo-orcamentos-raw` (propriedade da Ingestão); IAM restrito a `s3:GetObject`, nunca `PutObject`/`DeleteObject`.
- `BedrockExtratorGateway` / `BedrockRevisorExtracaoGateway` — implementam os dois gateways de agente; cada um com seu `ACL` de parsing de resposta (structured output/tool-use do Bedrock, nunca parsing de texto livre por regex).
- `MarkItDownConversaoExtracaoACL` — invoca MarkItDown (processo isolado/Lambda Layer, CPU-bound, timeout e memória dimensionados para conversão completa, não a versão leve da spec 001) para gerar texto/markdown estruturável; sanitiza o texto antes de compor o prompt do Extrator (ver Segurança).
- `EventBridgePublisher` — implementa `EventPublisher`, publica no bus `nexo-dominio-bus` (mesma instância física, wiring próprio deste BC).
- `DrizzleExtracaoOrcamentoRepository` — traduz linha↔agregado sobre Aurora Serverless v2 Postgres; tabelas `extracoes_orcamento` (estado atual, `itens`/`condicoes_comerciais` em coluna JSONB — ADR-003) e `extracoes_orcamento_historico` (append-only, nunca UPDATE/DELETE, apenas INSERT).
- Filas SQS por consumidor: `extrator-queue`, `revisor-extracao-queue`, cada uma com DLQ própria + alarme CloudWatch em mensagem na DLQ (Princípio IV — exceção de infraestrutura também nunca silenciosa).
- IAM: uma role por Lambda (`ExtratorLambdaRole`, `RevisorExtracaoLambdaRole`, `ConfirmarRevisaoHumanaExtracaoLambdaRole`, `ConsultaStatusExtracaoLambdaRole`), least privilege — ex.: `ExtratorLambdaRole` tem `bedrock:InvokeModel` restrito ao ARN do modelo aprovado e `s3:GetObject` restrito ao prefixo do bucket raw da Ingestão, sem nenhuma permissão de escrita nesse bucket.

## Interface

- Consumidor SQS (`extrator-queue`) acionado por regra EventBridge roteando `OrcamentoClassificado` → fila deste BC.
- Consumidor SQS (`revisor-extracao-queue`) acionado por regra EventBridge roteando `ExtracaoComCamposNaoExtraidosDetectada` (interno) → fila deste BC.
- `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana` — confirmação humana explícita (body: campos confirmados, cada um com valor real OU marcação explícita "indisponível no documento"). Só aceito quando status é `PENDENTE_REVISAO_HUMANA`; caso contrário, 409 Problem Details (RFC 7807).
- `GET /v1/orcamentos/{orcamentoId}/extracao/status` — retorna status + itens + condições comerciais + histórico. Contrato Problem Details para erros.
- Todos os endpoints validam entrada via Zod na borda; nenhuma regra de negócio nos controllers — apenas mapeamento request↔Application.
- Autenticação: Cognito (JWT), mesmo esquema da spec 001.

## Segurança (riscos específicos desta spec)

- **Prompt injection via documento de fornecedor**: mesmo risco da spec 001, reforçado aqui porque o texto convertido para extração completa é maior/mais rico. Prompt do Extrator/Revisor de Extração MUST isolar o texto convertido em bloco delimitado de "conteúdo do documento", nunca concatenado como instrução de sistema; resposta do Bedrock MUST usar saída estruturada (tool-use/JSON Schema) validada pelo ACL.
- **Dado comercial sensível (preço, condições de pagamento)**: não é dado pessoal (LGPD não se aplica diretamente ao preço em si), mas é dado comercial sensível — least privilege IAM, criptografia em repouso (Aurora KMS) e trânsito (TLS), sem exposição cross-tenant (preparação para Fase 03 multi-tenant, sem implementar isolamento completo agora, conforme Additional Constraint da constituição).
- **Read-only sobre dado bruto da Ingestão**: reforça Princípio III por design — nenhuma role IAM deste BC tem permissão de escrita no bucket `nexo-orcamentos-raw`.
- **Nunca inventar valor financeiro**: mitigado estruturalmente pelo VO `CampoExtraido<T>` (Domain, não apenas convenção de código) — ver Constitution Check Princípio IV.

## Project Structure

### Documentation (this feature)

```text
specs/002-extracao-dados-orcamento/
├── spec.md               # já existente, clarified (versão 2)
├── plan.md               # este arquivo
└── tasks.md               # gerado por /speckit-tasks
```

### Source Code (repository root) — mesma convenção monorepo único, por Bounded Context, estabelecida na spec 001

```text
src/
└── bounded-contexts/
    └── extracao/
        ├── domain/
        │   ├── extracao-orcamento.aggregate.ts
        │   ├── value-objects/ (orcamento-id, nivel-confianca, campo-extraido, dinheiro, quantidade, descricao-produto, item-orcamento, periodo-validade, condicoes-comerciais, referencia-classificacao, referencia-s3, tentativa-extracao)
        │   ├── events/ (orcamento-extraido, extracao-campos-nao-extraidos-detectada, extracao-escalonada-revisao-humana, orcamento-extraido-pendencia-confirmada)
        │   ├── repositories/ (extracao-orcamento.repository.ts — interface)
        │   └── gateways/ (agente-extrator.gateway.ts, agente-revisor-extracao.gateway.ts, leitura-bruta.gateway.ts, markitdown-conversao-extracao.acl.ts — interfaces)
        ├── application/
        │   └── use-cases/ (extrair-dados-orcamento, revisar-extracao-com-ia, confirmar-revisao-humana-extracao, consultar-status-extracao)
        ├── infrastructure/
        │   ├── persistence/ (drizzle-extracao-orcamento.repository.ts, schema/)
        │   ├── aws/ (s3-leitura-bruta.gateway.ts, eventbridge.publisher.ts)
        │   ├── bedrock/ (bedrock-extrator.gateway.ts, bedrock-revisor-extracao.gateway.ts, acl/)
        │   └── markitdown/ (markitdown-conversao-extracao.acl.ts)
        └── interface/
            ├── http/ (controllers REST + Zod schemas)
            └── events/ (handlers Lambda consumidores de SQS)

tests/
└── bounded-contexts/extracao/
    ├── domain/ (unit, sem mocks de rede)
    ├── application/ (unit, mocks de gateway/repositório)
    └── contract/ (contratos REST)
```

**Structure Decision**: mesma convenção da spec 001 — novo subdiretório `src/bounded-contexts/extracao/` isolado, sem import direto de código de `ingestao-identificacao/`; toda comunicação de entrada via evento (`OrcamentoClassificado`) consumido por SQS.

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável.*

## ADRs desta spec

### ADR-002 — MarkItDown roda em instância própria por Bounded Context, não como serviço de conversão compartilhado

**Contexto**: a spec 001 já usa MarkItDown (versão leve, para prompt do Classificador). Esta spec (002) precisa de uma conversão mais completa/estruturável do mesmo documento bruto para alimentar o Extrator.

**Problema**: centralizar a conversão MarkItDown em um serviço compartilhado entre BCs (chamado tanto pela Ingestão quanto pela Extração) vs. cada BC invocar sua própria instância.

**Alternativas consideradas**: (a) serviço de conversão MarkItDown centralizado, chamado via API síncrona por ambos os BCs; (b) cada BC invoca sua própria instância de MarkItDown (Lambda Layer/container próprio).

**Vantagens (própria instância por BC)**: preserva Princípio II (desacoplamento por eventos, nunca chamada direta síncrona entre implementações internas de BCs distintos); preserva autonomia de deploy de cada BC (convenção de layout da spec 001); cada BC pode ajustar parâmetros de conversão (leve vs. completa) sem afetar o outro.

**Desvantagens**: duplica a dependência MarkItDown (mesma biblioteca, dois pontos de invocação/config Lambda Layer) — overhead operacional pequeno, sem duplicação de lógica de negócio.

**Decisão**: cada Bounded Context que precisa converter documento bruto roda sua própria instância de MarkItDown, com parametrização própria (leve para Classificador na spec 001, completa/estruturável para Extrator nesta spec). Nenhum serviço de conversão compartilhado entre BCs.

**Trade-offs**: pequena duplicação de infraestrutura leve em troca de zero acoplamento síncrono cross-BC — trade-off aceitável dado Princípio II ser NON-NEGOTIABLE.

**Impactos futuros**: qualquer spec futura que precise converter o mesmo documento bruto (ex.: um agente de auditoria) MUST seguir o mesmo padrão — própria instância, nunca chamada síncrona a um "serviço de conversão" de outro BC.

### ADR-003 — Governança de exceção da Extração é padrão reaproveitado, não componente físico compartilhado com a Ingestão

**Contexto**: a spec 002 (`Perguntas resolvidas`) declara reaproveitar "sem redefinir" o mecanismo de exceção já estabelecido na spec 001 (Agente Revisor + fila de escalonamento assíncrona).

**Problema**: "reaproveitar o mecanismo" pode significar (a) a Extração chama o Revisor e a fila de escalonamento físicos da Ingestão via alguma integração cross-BC, ou (b) a Extração implementa seu próprio Agente Revisor de Extração e sua própria fila de escalonamento, seguindo o mesmo padrão/desenho, mas como componentes de sua própria infraestrutura.

**Alternativas consideradas**: (a) componente físico compartilhado (Revisor/fila únicos, chamados por múltiplos BCs); (b) padrão replicado, componentes próprios por BC.

**Vantagens (padrão replicado, opção b)**: preserva "cada Bounded Context tem seu próprio modelo" (regra explícita do system prompt do arquiteto e da spec 001, convenção #2); preserva Princípio II — nenhuma dependência de disponibilidade síncrona cross-BC; preserva autonomia de deploy; a fila de escalonamento humana consolidada entre BCs (se o produto quiser uma única "caixa de entrada" para o gestor de compras) é responsabilidade de um read-model do BC Acompanhamento (spec futura), que agrega eventos de escalonamento de todos os BCs — nunca do próprio BC de origem compartilhar sua fila.

**Desvantagens**: replica estrutura de agente revisor + fila de escalonamento em cada BC que a constituição já autoriza como "agente adicional explícito" — múltiplas filas de infraestrutura, uma por BC, em vez de uma única. Sem consolidação nativa de UX cross-BC (mitigado pelo read-model futuro do Acompanhamento, fora de escopo desta spec).

**Decisão**: Extração implementa `AgenteRevisorExtracaoGateway` e sua própria fila de escalonamento assíncrona (`revisor-extracao-queue` + estado `PENDENTE_REVISAO_HUMANA` no próprio agregado `ExtracaoOrcamento`), seguindo o mesmo padrão de estados/transições da spec 001, sem nenhuma chamada cross-BC ao Revisor ou à fila da Ingestão.

**Trade-offs**: menos reuso físico de infraestrutura em troca de zero acoplamento entre BCs — trade-off aceitável e coerente com a decisão já tomada na spec 001 (convenção #2, "nunca um agregado global compartilhado").

**Impactos futuros**: specs 003–005 que também precisarem do padrão Revisor+escalonamento (ex.: Validação) MUST seguir o mesmo modelo — componente próprio por BC, nunca reuso físico cross-BC. Consolidação de visão única de "pendências de revisão humana" para o gestor de compras é responsabilidade do BC Acompanhamento via agregação de eventos, não deste padrão.

### ADR-004 — Itens e condições comerciais armazenados como JSONB, não em tabelas normalizadas (Fase 01)

**Contexto**: o agregado `ExtracaoOrcamento` tem uma lista de itens de tamanho variável e uma estrutura de condições comerciais, ambos precisando ser persistidos e recuperados por `orcamentoId`.

**Problema**: normalizar itens em tabela própria (`extracao_itens`, FK para `extracoes_orcamento`) vs. armazenar como coluna JSONB dentro da linha do agregado.

**Alternativas consideradas**: (a) tabela normalizada `extracao_itens`; (b) coluna JSONB `itens` + `condicoes_comerciais` na tabela `extracoes_orcamento`.

**Vantagens (JSONB)**: menos joins, menos código de repositório para o volume/consulta esperados na Fase 01 (leitura sempre por `orcamentoId` completo, nunca por consulta relacional entre itens de orçamentos diferentes nesta spec); simplicidade — evita normalização especulativa antes de haver demanda real de query relacional sobre itens (YAGNI).

**Desvantagens**: se uma spec futura (ex.: Busca & Indexação, 004, ou relatórios analíticos sobre itens) precisar de consulta relacional eficiente sobre itens individuais entre orçamentos, será necessário migrar para tabela normalizada.

**Decisão**: JSONB para Fase 01. Revisar quando/se uma spec futura declarar requisito real de consulta relacional sobre itens.

**Trade-offs**: simplicidade imediata em troca de possível migração futura — trade-off aceitável (menor complexidade agora, sem otimização prematura, conforme prioridade de Simplicidade sobre Performance/Escalabilidade não medida no system prompt do arquiteto).

**Impactos futuros**: se a spec de Busca & Indexação (004) precisar de índice relacional sobre itens, essa decisão MUST ser revisitada com ADR próprio naquela spec, nunca silenciosamente contornada por query JSONB complexa.
