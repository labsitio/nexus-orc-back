# Implementation Plan: Otimização Contínua de Custo Operacional

**Branch**: `009-otimizacao-custo-operacional` | **Date**: 2026-07-29 | **Spec**: `specs/009-otimizacao-custo-operacional/spec.md`

**Input**: Feature specification from `/specs/009-otimizacao-custo-operacional/spec.md` (status: clarified, versão 1)

**Nota de convenção**: esta spec NÃO introduz um novo Bounded Context. É um mecanismo de infraestrutura transversal que se aplica sobre a arquitetura já estabelecida em `specs/001-ingestao-classificacao-orcamentos/plan.md` (única spec com plano técnico concreto até o momento) e que MUST ser adotado pelo mesmo padrão quando os planos das specs 002–005 forem escritos. Toda nomenclatura, convenção de Domain Event, bus único `nexo-dominio-bus`, layout `src/bounded-contexts/<slug>/{domain,application,infrastructure,interface}` e ORM Drizzle definidos em 001 são respeitados sem desvio.

## Summary

Requisito primário: três alavancas de redução de custo operacional — (1) cache de identificação para reaproveitar sinal de fornecedor/formato já conhecido, sem nunca pular a publicação do evento de classificação; (2) arquivamento automático por lifecycle do dado bruto/processado para armazenamento de custo mais baixo, sem perda de rastreabilidade nem exclusão; (3) isolamento de capacidade para processamento em lote de baixa prioridade, sem competir com o SLA do fluxo principal (p95 5 min).

Abordagem técnica: nenhuma das três alavancas introduz Bounded Context, agregado ou agente novo. São extensões aditivas e não-observáveis externamente sobre a Infrastructure (e, no caso do cache, uma extensão pontual da Application) do BC **Ingestão & Identificação** (spec 001) — hoje o único BC com plano técnico — mais uma convenção compartilhada a ser replicada nos BCs de Extração/Validação/Busca/Orquestração (specs 002–005) quando seus próprios planos forem escritos. Nenhuma garantia comportamental de 001–005 (Princípios I e III da constituição, em particular) é alterada.

## Technical Context

**Language/Version**: TypeScript 5.x `strict` sobre Node.js 24 — mesma base de 001, sem mudança.

**Primary Dependencies (novas nesta spec)**: `@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb` (cache de identificação); nenhuma dependência nova para lifecycle (configuração de bucket S3, não código de aplicação) nem para lote (configuração de fila/concorrência Lambda + EventBridge rule).

**Storage**: DynamoDB (tabela nova `nexo-cache-identificacao-fornecedor`, on-demand, TTL nativo) para o cache de identificação; nenhuma tabela Aurora nova — `orcamentos`/`orcamentos_historico` de 001 permanecem como estão. S3 (`nexo-orcamentos-raw` e buckets análogos das specs 002+ quando existirem) recebe configuração de Intelligent-Tiering, não uma tabela/storage novo.

**Testing**: Vitest para a lógica pura de assinatura estrutural/cache (Application, mocks de gateway); nenhum teste de infraestrutura cabe a este plano (execução de `speckit-implement`/CI é responsabilidade de Ricardo).

**Target Platform**: AWS gerenciado — DynamoDB on-demand, S3 Intelligent-Tiering, SQS + Lambda reserved concurrency, EventBridge rule adicional no mesmo bus `nexo-dominio-bus`.

**Project Type**: extensão de serviço web orientado a eventos já definido em 001 — sem novo tipo de projeto.

**Performance Goals**: fluxo padrão mantém a meta de p95 ≤ 5 min já estabelecida em 001; fluxo de lote de baixa prioridade explicitamente NÃO tem meta de tempo — critério de aceite é não competir por capacidade com o padrão (isolamento, não velocidade).

**Constraints**: cache é apenas sinal auxiliar — MUST NUNCA ser tratado como substituto da decisão do agente (Princípio V); falha de leitura/escrita no cache (throttle, indisponibilidade) MUST degradar para o caminho de custo total (cache miss), nunca bloquear ou falhar o pipeline; escrita no cache só ocorre a partir de um resultado com confiança ≥ 80% já confirmado (nunca a partir de um resultado de baixa confiança, para não "envenenar" o cache com sinal ruim); toda correção humana ou de Revisor que discorde do sinal cacheado MUST sobrescrever a entrada de cache, nunca deixar entrada obsoleta.

**Scale/Scope**: 1 extensão de Application (caso de uso `ClassificarOrcamento` de 001), 3 componentes de Infrastructure (tabela DynamoDB, regra de lifecycle S3, fila+regra de roteamento por prioridade), 0 Bounded Contexts novos, 0 agregados novos, 0 agentes de IA novos.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0 — PASS em todos os princípios, nenhuma exceção registrada.*

| Princípio / Constraint | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Cache não remove nenhuma etapa do histórico (`OrcamentoClassificado` sempre publicado); lifecycle S3 (Intelligent-Tiering com tiers de acesso instantâneo) não altera o identificador nem o `GetObject` — leitura permanece transparente; lote de baixa prioridade preserva o mesmo histórico append-only, apenas roteado por fila diferente | PASS |
| II. Desacoplamento por eventos | Nenhuma chamada direta introduzida; roteamento de prioridade é feito por regra EventBridge sobre um campo adicional do payload (`prioridade`), não por chamada síncrona entre componentes | PASS |
| III. Dado bruto imutável | Intelligent-Tiering muda classe de armazenamento, nunca sobrescreve/apaga objeto versionado; Object Lock/deny-overwrite de 001 permanece intacto | PASS |
| IV. Exceção nunca silenciosa | Falha de cache degrada para caminho completo (nunca falha silenciosa de negócio); fila de lote tem DLQ + alarme própria, mesmo padrão de 001 | PASS |
| V. IA generativa como motor de entendimento | Cache é sinal de contexto adicional ao prompt do Classificador, nunca decide por regra fixa nem substitui a avaliação do agente — decisão explícita já registrada nas Assunções da própria spec 009 | PASS |
| VI. Serverless-first | DynamoDB on-demand, S3 Intelligent-Tiering (serviço gerenciado, sem servidor fixo), Lambda reserved concurrency (não é capacidade reservada de servidor, é um teto de concorrência serverless) — nenhum componente de capacidade fixa ociosa introduzido | PASS |
| VII. Segurança e LGPD | Cache armazena apenas assinatura estrutural + resultado de classificação (fornecedor/formato), não o documento bruto; TTL limita retenção; role IAM dedicada least-privilege para a nova tabela; ver seção Segurança | PASS |
| VIII. Roadmap em 3 fases | Spec já declarada `fase_roadmap: Fase 03` e `depende_de: [ingestao-classificacao-orcamentos]` (Fase 01) — sequenciamento respeitado; realização completa nas specs 002–005 fica pendente até que seus próprios planos existam (registrado como risco remanescente, não bloqueio) | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Nenhum agente novo introduzido; cache não é absorvido silenciosamente na responsabilidade do Classificador — é um sinal de entrada explícito, o agente continua sendo o único a decidir/reportar confiança | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI; gatilho de reprocessamento em lote é uma invocação operacional interna (Lambda), não uma tela | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Assinatura estrutural do cache reaproveita a saída já produzida pelo `MarkItDownConversaoACL` de 001 — nenhuma chamada nova a MarkItDown ou a serviço pago | PASS |

**Re-check pós desenho detalhado**: nenhuma violação introduzida — gate permanece PASS.

## Bounded Context e Context Map (recorte desta spec)

Nenhum Bounded Context novo. Esta spec adiciona três mecanismos de Infrastructure (e uma pequena extensão de Application) *dentro* do BC Ingestão & Identificação (para o cache) e estabelece duas convenções de infraestrutura compartilhada (lifecycle S3, roteamento por prioridade) que se aplicam a qualquer BC do produto com armazenamento S3/fila de evento — a serem adotadas nos planos de 002–005 quando escritos, sem exigir edição retroativa deste plano.

```text
BC Ingestão & Identificação (spec 001) — extensão desta spec:

[OrcamentoRecebido] --> [ClassificarOrcamento use case]
                              |
                    1. calcula AssinaturaEstrutural (a partir do texto já convertido por MarkItDown)
                    2. consulta CacheIdentificacaoGateway.buscar(assinatura)  -- miss = degrada, nunca falha
                              |
                    3. invoca AgenteClassificadorGateway (com sinal de cache como contexto, se houver hit)
                              |
                    4. publica OrcamentoClassificado | OrcamentoBaixaConfiancaDetectada  (SEM MUDANÇA — 001 inalterado)
                              |
                    5. se confiança final >= 80%: CacheIdentificacaoGateway.registrar(assinatura, resultado)
                       (sobrescreve, nunca acumula sinal antigo incorreto)

Convenção compartilhada (todos os BCs, presente e futuros):
  - Todo bucket S3 de artefato de pipeline (raw ou processado) MUST ter Intelligent-Tiering
    ativado por padrão desde a criação do bucket.
  - Todo consumidor SQS de evento de domínio que precisar suportar reprocessamento em lote
    MUST expor uma fila companheira "-lote" com concorrência reservada baixa e própria DLQ,
    roteada por uma regra EventBridge sobre o campo opcional `prioridade` do envelope do evento.
```

Relação com 001: esta spec é uma extensão aditiva do mesmo BC, não uma nova relação Customer/Supplier — não há novo consumidor externo, nenhum contrato de evento existente muda de forma incompatível (o campo `prioridade` é opcional, ausência = comportamento padrão atual, retrocompatível).

## Domain — extensão (BC Ingestão & Identificação)

Nenhuma mudança de agregado, invariante ou Domain Event existente de 001. Adições:

- **VO `AssinaturaEstrutural`**: string opaca (hash determinístico), calculada por uma função pura a partir da saída já sanitizada do `MarkItDownConversaoACL` (ex.: normalização de estrutura de cabeçalhos/layout) mais o `Canal`. Nunca deriva de dado ainda não classificado como fornecedor confirmado — é uma heurística de agrupamento, não uma identidade de fornecedor. Detalhe exato do algoritmo de hashing é decisão de implementação (Ricardo), fora do escopo arquitetural deste plano.
- **VO `SinalCacheIdentificacao`** (opcional): `{ assinatura: AssinaturaEstrutural, resultadoAnterior: ResultadoClassificacao, ultimaConfirmacaoEm: timestamp }`. Passado como contexto adicional ao `AgenteClassificadorGateway`, nunca como parâmetro que decide `nivelConfianca` por conta própria — o agente permanece a única fonte de verdade da confiança reportada (reforça Princípio V).
- Nenhum Domain Event novo. Envelope de evento existente (`schemaVersion`, `orcamentoId`, `ocorreuEm`) recebe um campo adicional opcional `prioridade: 'PADRAO' | 'LOTE_BAIXA_PRIORIDADE'` (default implícito `PADRAO` quando ausente) — convenção de envelope compartilhada entre BCs, não um evento novo.

## Application — extensão de caso de uso existente

- `ClassificarOrcamento(orcamentoId)` (de 001) passa a, antes de invocar `AgenteClassificadorGateway`: (1) calcular `AssinaturaEstrutural`; (2) consultar `CacheIdentificacaoGateway.buscar` — em caso de erro/timeout, capturar e seguir como cache-miss, nunca propagar a falha como erro de caso de uso; (3) se houver hit, repassar `SinalCacheIdentificacao` como contexto adicional ao gateway do agente (permitindo, por exemplo, roteamento para um modelo Bedrock mais barato/rápido quando há alta confiança prévia — decisão de custo, nunca de correção); (4) após persistir o resultado, se confiança final ≥ 80%, chamar `CacheIdentificacaoGateway.registrar` (upsert, sobrescreve qualquer entrada anterior daquela assinatura). Nenhuma outra etapa do caso de uso original muda; a publicação de `OrcamentoClassificado`/`OrcamentoBaixaConfiancaDetectada` continua idêntica a 001.
- Novo caso de uso interno/operacional `ReprocessarEmLote(orcamentoIds[], motivo)` — não exposto por API pública (ver Interface); reemite, para cada `orcamentoId`, o evento/comando equivalente ao já existente no pipeline (ex.: um sinal de "reclassificar" ou "reextrair", dependendo do BC de destino) com `prioridade: 'LOTE_BAIXA_PRIORIDADE'` no envelope. A decisão de qual BC/evento reemitir por execução é parâmetro de invocação, não uma regra fixa desta spec (consistente com "Fora de escopo": critério de baixa prioridade é operacional).

## Infrastructure

- **Cache**: tabela DynamoDB `nexo-cache-identificacao-fornecedor` (partition key `assinaturaEstrutural`), modo on-demand (sem capacidade provisionada), atributo TTL nativo (expira sinais não confirmados há muito tempo, evita cache "eterno" desalinhado com a realidade do fornecedor). `DynamoCacheIdentificacaoGateway` implementa a interface `CacheIdentificacaoGateway` definida no Domain/Application de 001+009. Role IAM dedicada (`ClassificadorLambdaRole` de 001 ganha `dynamodb:GetItem`/`PutItem` restrito ao ARN desta tabela — nenhuma outra permissão nova).
- **Lifecycle**: configuração de bucket S3 (`nexo-orcamentos-raw` hoje; qualquer bucket de artefato de BC futuro) com **S3 Intelligent-Tiering** habilitado, incluindo os tiers de arquivamento de acesso instantâneo (Archive Instant Access), sem regra de dias fixos configurada nesta spec (a própria spec deixa o período como parâmetro não fixado — Intelligent-Tiering resolve isso nativamente ao mover objetos entre tiers com base no padrão real de acesso, sem intervenção manual e sem exigir um número arbitrário de dias). Versionamento e Object Lock/deny-overwrite de 001 permanecem sem alteração — a transição de tier NUNCA afeta a política de imutabilidade.
- **Lote de baixa prioridade**: para cada fila SQS existente hoje em 001 (`classificador-queue`, `revisor-queue`) e para as filas equivalentes que specs 002–005 criarem, um par companheiro `<nome>-lote` com concorrência reservada Lambda baixa (valor exato a calibrar operacionalmente, não fixado aqui) e DLQ própria + alarme CloudWatch (mesmo padrão do Princípio IV já usado em 001). Regra EventBridge adicional no bus `nexo-dominio-bus`: eventos com `detail.prioridade == 'LOTE_BAIXA_PRIORIDADE'` roteiam para a fila `-lote` correspondente; ausência do campo (ou `PADRAO`) mantém o roteamento atual para a fila padrão — nenhuma regra existente de 001 precisa ser reescrita, apenas uma regra adicional.
- Nenhuma mudança em `S3ArmazenamentoBrutoGateway`, `BedrockClassificadorGateway`/`BedrockRevisorGateway`, `EventBridgePublisher` ou `DrizzleOrcamentoRepository` de 001 além da injeção do novo `CacheIdentificacaoGateway` no caso de uso.

## Interface

- Nenhum endpoint público novo. `ReprocessarEmLote` é invocado como Lambda interna (via `aws lambda invoke` direto por ops, ou EventBridge Scheduled Rule para reprocessamentos recorrentes conhecidos) — decisão deliberada de não expor um endpoint REST de reprocessamento em massa: reduz superfície de ataque (nenhum persona da spec — `gestor-de-compras` — é o operador desta capacidade; é ferramenta operacional interna, não produto voltado a persona) e evita overengineering de autenticação/autorização para um caso de uso de baixa frequência. Se o produto decidir, no futuro, expor reprocessamento em lote como capacidade self-service para uma persona, isso é uma nova spec de comportamento (Product), não uma extensão silenciosa desta.
- `GET /v1/orcamentos/{orcamentoId}/status` (de 001) não muda de contrato — o histórico continua expondo as mesmas tentativas; o campo `prioridade` do envelope de evento é um detalhe de transporte interno (EventBridge), não um campo exposto na resposta de status a menos que Ricardo decida incluí-lo como metadado informativo (não obrigatório por esta spec).

## Segurança (riscos específicos desta spec)

- **Envenenamento de cache**: um resultado de classificação incorreto nunca é gravado no cache (escrita só ocorre com confiança ≥ 80% já confirmada pelo pipeline existente); qualquer correção humana ou de Revisor subsequente sobrescreve a entrada — mitigado por invariante de Application, não apenas por convenção.
- **Cache como vetor de bypass de governança**: mitigado pela decisão de produto já registrada na spec (cache nunca pula a etapa de classificação; é sinal de contexto, nunca decisão) — reforçado aqui como constraint de Application, não apenas de intenção.
- **Least privilege**: nova permissão DynamoDB restrita ao ARN da tabela de cache, adicionada apenas à role já existente do Classificador — nenhuma role nova, nenhuma permissão de exclusão (`dynamodb:DeleteItem` não concedida; TTL nativo do DynamoDB expira itens sem necessidade de permissão de delete explícita no código da aplicação).
- **LGPD**: cache armazena fornecedor/formato + confiança, não dado pessoal de contato nem o documento bruto — superfície de dado sensível não aumenta em relação a 001. Intelligent-Tiering não altera criptografia em repouso (SSE-KMS de 001 permanece ativo em qualquer tier).
- **Reprocessamento em lote sem endpoint público**: reduz superfície de exposição — apenas identidade IAM interna (ops/Ricardo) pode invocar a Lambda, least-privilege aplicado à role dessa Lambda (sem acesso amplo, apenas aos gateways necessários para reemitir o evento correspondente).

## Project Structure

### Documentation (this feature)

```text
specs/009-otimizacao-custo-operacional/
├── spec.md               # já existente, clarificado (versão 1)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — extensão do layout já estabelecido em 001

```text
src/
└── bounded-contexts/
    └── ingestao-identificacao/
        ├── domain/
        │   ├── value-objects/ (+ assinatura-estrutural.ts, sinal-cache-identificacao.ts)
        │   └── gateways/ (+ cache-identificacao.gateway.ts — interface)
        ├── application/
        │   └── use-cases/
        │       ├── classificar-orcamento.ts        # MODIFICADO (extensão de 001, sem mudança de contrato externo)
        │       └── reprocessar-em-lote.ts           # NOVO
        └── infrastructure/
            ├── aws/
            │   └── dynamo-cache-identificacao.gateway.ts   # NOVO
            └── eventbridge/
                └── envelope-prioridade.ts                   # NOVO (utilitário de convenção compartilhada)

tests/
└── bounded-contexts/ingestao-identificacao/
    ├── application/ (unit: classificar-orcamento com cache hit/miss/falha-degradada; reprocessar-em-lote)
    └── domain/ (unit: assinatura-estrutural determinística)

infra/ (ou equivalente CDK/Terraform já usado por Ricardo — fora do código de aplicação)
├── dynamodb/nexo-cache-identificacao-fornecedor.ts   # tabela + TTL
├── s3/lifecycle-intelligent-tiering.ts               # aplicado a todo bucket de artefato de pipeline
└── sqs/filas-lote.ts                                 # filas -lote + regra EventBridge por prioridade
```

**Structure Decision**: nenhuma nova pasta de Bounded Context — extensão in-place de `ingestao-identificacao` (já criado por 001) mais um diretório `infra/` transversal para configuração de conta/serviço gerenciado que não pertence a nenhum BC específico (bucket lifecycle e filas de lote são convenção de infraestrutura, não lógica de domínio).

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável.*

## ADRs desta spec

### ADR-009-000 — Nenhum Bounded Context dedicado para "otimização de custo"

**Contexto**: as três alavancas (cache, lifecycle, lote) poderiam, em tese, ser agrupadas em um BC "Plataforma/Custo" próprio.

**Problema**: onde modelar uma capacidade que é inteiramente transversal e não tem Ubiquitous Language de negócio própria (não existe "cache" ou "lifecycle" na linguagem do gestor de compras).

**Alternativas consideradas**: (a) novo BC "Otimização de Custo" com seu próprio agregado de política; (b) extensão in-place dos BCs existentes + convenção de infraestrutura compartilhada.

**Vantagens (b)**: sem agregado artificial sem invariante de negócio real; sem novo consumidor/produtor de evento; menor superfície para o Constitution Check; a spec de origem (009) já descreve as alavancas como comportamento de infraestrutura, não como conceito de domínio do gestor de compras.

**Desvantagens (b)**: a governança de "onde aplicar a convenção" fica documental (este plano + futuros plans de 002–005), não capturada em código de um único lugar.

**Decisão**: (b) — extensão in-place + convenções compartilhadas documentadas.

**Trade-offs**: exige que cada plano futuro (002–005) replique deliberadamente as duas convenções (Intelligent-Tiering, fila `-lote`); risco de esquecimento mitigado por citar este ADR nos próximos Constitution Checks.

**Impactos futuros**: specs 002–005 MUST referenciar este ADR ao desenhar seus próprios buckets/filas, salvo ADR de revisão.

### ADR-009-001 — DynamoDB on-demand para o cache de identificação (não ElastiCache, não tabela Aurora)

**Contexto**: precisa de um armazenamento chave→sinal de baixa latência para consulta a cada classificação.

**Alternativas consideradas**: Amazon ElastiCache (Redis); tabela nova em Aurora Serverless v2 (já em uso por 001); DynamoDB on-demand.

**Vantagens (DynamoDB)**: pay-per-request genuíno (sem nó/cluster ocioso — coerente com o próprio objetivo de redução de custo desta spec, ao contrário do ElastiCache, que exige nó mínimo permanente); TTL nativo sem job de limpeza; sem contenção com a carga transacional de `orcamentos`/`orcamentos_historico` no Aurora; sem VPC obrigatória (menor superfície de rede).

**Desvantagens**: mais um serviço gerenciado no inventário (custo de operação cognitiva, não financeiro); consistência eventual entre regiões não é relevante aqui (single-region), mas seria uma desvantagem em cenário multi-região futuro.

**Decisão**: DynamoDB on-demand, tabela `nexo-cache-identificacao-fornecedor`, TTL nativo.

**Trade-offs**: nenhuma transação forte com o agregado `Orcamento` (aceitável — o cache é um sinal auxiliar, nunca fonte de verdade; a fonte de verdade continua sendo `orcamentos_historico` no Aurora).

**Impactos futuros**: se um BC futuro precisar de um cache de sinal equivalente, mesma escolha por consistência, salvo ADR de revisão.

### ADR-009-002 — S3 Intelligent-Tiering em vez de regra de lifecycle com dias fixos

**Contexto**: spec deixa o período de retenção ativa como parâmetro não fixado, e exige "sem intervenção manual" e "continua consultável (ainda que com latência maior)", nunca exclusão.

**Alternativas consideradas**: (a) regra de lifecycle S3 clássica com transição após N dias fixos para S3 Glacier Flexible Retrieval/Deep Archive; (b) S3 Intelligent-Tiering (incluindo tiers de Archive Instant Access).

**Vantagens (b)**: adapta-se ao padrão real de acesso sem exigir escolher um número de dias arbitrário (resolve a própria lacuna que a spec deixou aberta, sem inventar um valor de negócio que ninguém validou); tiers de acesso instantâneo mantêm `GetObject` funcionando de forma transparente (latência maior, mas sem etapa de "restore" assíncrona) — atende literalmente "continua consultável, ainda que com latência de acesso maior"; nunca exclui.

**Desvantagens (b)**: custo de monitoramento por objeto do Intelligent-Tiering (pequena taxa por objeto monitorado) — irrelevante frente à economia de storage class para volumes que realmente ficam frios; menos controle fino do que uma regra de dia fixo, caso o produto queira, no futuro, uma política de retenção legal específica por categoria de documento (Princípio VII já prevê isso como retenção configurável — tratado como extensão futura, não conflito).

**Decisão**: habilitar S3 Intelligent-Tiering (com Archive Access e Archive Instant Access tiers) em todo bucket de artefato de pipeline, como configuração padrão desde a criação do bucket.

**Trade-offs**: Glacier Flexible/Deep Archive (retrieval em minutos/horas) foi descartado como padrão porque violaria "continua consultável" sem introduzir um fluxo de restore assíncrono — não descartado como opção futura de exceção justificada por escrito (ex.: categoria de documento com retenção legal de longuíssimo prazo e tolerância a latência de horas), seguindo o mesmo padrão de exceção do Princípio VI.

**Impactos futuros**: specs 002–005 que criem bucket S3 próprio MUST habilitar Intelligent-Tiering por padrão (ver ADR-009-000), salvo ADR de exceção.

### ADR-009-003 — Isolamento de lote por fila companheira + concorrência reservada Lambda, roteada por campo de prioridade no envelope do evento

**Contexto**: cargas de baixa prioridade (reprocessamento em massa) não devem competir com o SLA de p95 5 min do fluxo principal.

**Alternativas consideradas**: (a) mesma fila, atraso artificial via `DelaySeconds`/reordenação manual; (b) serviço de lote dedicado (AWS Batch/Step Functions) totalmente separado da arquitetura de eventos de 001; (c) fila SQS companheira `-lote` por consumidor existente + concorrência reservada Lambda baixa + roteamento por campo `prioridade` no envelope via regra EventBridge.

**Vantagens (c)**: reaproveita 100% da infraestrutura e do código de domínio/agente já existente de 001 (nenhuma duplicação de lógica de classificação/revisão); isolamento de capacidade é garantido nativamente pela concorrência reservada por função Lambda (backpressure AWS-nativo, sem código de throttling customizado); mudança aditiva no envelope do evento (campo opcional), sem quebrar contrato existente.

**Desvantagens**: mais uma fila + alarme por consumidor a manter; calibração do valor de concorrência reservada é operacional, não decidida por este plano.

**Decisão**: (c).

**Trade-offs**: exige que o Constitution Check de cada spec futura confirme que sua(s) fila(s) de consumidor seguem o mesmo par padrão/lote, ver ADR-009-000.

**Impactos futuros**: specs 002–005 que introduzam consumidor SQS próprio MUST prover a fila `-lote` companheira desde o desenho inicial, salvo ADR de exceção; nenhum serviço de lote externo (AWS Batch, Step Functions dedicado) é introduzido por esta decisão — reavaliar apenas se o volume de reprocessamento em lote crescer a ponto de a concorrência reservada Lambda se mostrar insuficiente (medição real, não especulação).
