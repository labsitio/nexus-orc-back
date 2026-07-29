# Implementation Plan: Indexação e Busca Semântica de Orçamentos (Agente de Indexação)

**Branch**: `004-indexacao-busca-semantica-orcamentos` | **Date**: 2026-07-29 | **Spec**: `specs/004-indexacao-busca-semantica-orcamentos/spec.md`

**Input**: Feature specification from `/specs/004-indexacao-busca-semantica-orcamentos/spec.md` (status: clarified, versão 2)

**Nota de convenção**: este plano herda, sem redefinir, as convenções vinculantes estabelecidas em `specs/001-ingestao-classificacao-orcamentos/plan.md`, `specs/002-extracao-dados-orcamento/plan.md` e `specs/003-validacao-consistencia-orcamentos/plan.md` (nomenclatura de Bounded Context, convenção de Domain Event `<Agregado><ParticípioPassado>`, bus único `nexo-dominio-bus`, layout `src/bounded-contexts/<slug>/{domain,application,infrastructure,interface}`, `OrcamentoId` gerado só pelo Gateway de Ingestão, ADR-001 Drizzle da spec 001, ADR-003 da spec 002 "padrão replicado, nunca componente físico compartilhado entre BCs"). Todo desvio dessas convenções é registrado explicitamente como ADR nesta spec.

## Summary

Requisito primário: orçamento marcado "validado" (spec 003) tem seu conteúdo e itens extraídos transformados em representação vetorial (embedding) que habilita busca em linguagem natural via API, combinando critérios estruturados (categoria, faixa de preço, período) com similaridade semântica — sem nunca reinterpretar/alterar valor estruturado já validado, sem nunca omitir um orçamento validado do índice por critério de relevância de negócio, e sem nunca bloquear o pipeline principal em caso de falha técnica de indexação (enriquecimento assíncrono, Princípio II).

Abordagem técnica: novo Bounded Context **Busca & Indexação**, com agregado raiz próprio (`IndiceOrcamento`) — nunca reaproveita os agregados de Ingestão/Extração/Validação. Comunicação de entrada exclusivamente via assinatura dos eventos `OrcamentoValidado` e `OrcamentoValidadoComRessalva` (relação Customer/Supplier, Busca & Indexação é customer de Validação — spec declara dependência exclusiva de `validacao-consistencia-orcamentos`). Embeddings gerados via Bedrock (Amazon Titan Text Embeddings V2), persistidos em Aurora Serverless v2 Postgres com extensão `pgvector` (ADR-001) — sem introduzir um novo serviço gerenciado de busca vetorial (OpenSearch Serverless/Bedrock Knowledge Bases), por coerência com Princípio VI (serverless-first/custo sob demanda) e por já existir a mesma instância Aurora usada pelos demais BCs. Busca em linguagem natural combina filtros determinísticos (SQL) com similaridade vetorial (pgvector), nunca delega a decisão de "quais orçamentos existem" à IA — a IA só traduz a consulta em critérios e gera o vetor de consulta.

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 (mesma baseline das specs 001–003 — Ricardo MUST reconfirmar LTS vigente no momento real da implementação).

**Primary Dependencies**: Zod 4.4.x (validação de borda); AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`); Fastify (Interface, mesmo adaptador Lambda das specs 001–003); Drizzle ORM (ADR-001 da spec 001, herdado) + `pgvector` extension no Aurora (habilitada via migração, ver ADR-001 desta spec); driver Postgres com suporte a tipo `vector` (Drizzle suporta coluna `vector` via `drizzle-orm/pg-core` a partir das versões que expõem o tipo customizado — Ricardo MUST confirmar a versão exata do pacote `drizzle-orm` no momento da implementação em npmjs.com/package/drizzle-orm, pois suporte nativo ao tipo `vector` pode exigir `customType`). **Sem MarkItDown nesta spec** — Busca & Indexação opera sobre dados já estruturados e validados (payload do evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva`), nunca sobre o documento bruto; nenhuma conversão de documento é necessária aqui.

**Storage**: Aurora Serverless v2 Postgres (mesma instância física dos demais BCs, schema/tabelas próprias deste BC) para estado atual + histórico append-only do agregado `IndiceOrcamento`, incluindo coluna `vector` (pgvector v0.8.0+, índice HNSW) para o embedding — ver ADR-001. Busca & Indexação **não lê** o bucket `nexo-orcamentos-raw` nem qualquer tabela de outro BC diretamente — opera exclusivamente sobre o payload estruturado dos eventos upstream, reforçando que cada BC tem seu próprio modelo (convenção #2 da spec 001).

**Testing**: Vitest (unit Domain/Application sem mocks de rede — regras de invariante do agregado e de composição do `ConteudoIndexavel` são testáveis puramente; mocks de gateway de IA/embeddings apenas na camada Application); testes de contrato para os 2 endpoints REST próprios; testes de integração local contra LocalStack para SQS/EventBridge e contra Postgres com `pgvector` (execução cabe a Ricardo/CI).

**Target Platform**: AWS Lambda atrás de API Gateway (endpoint de busca e de status); consumidor SQS para o caso de uso assíncrono de indexação; EventBridge custom bus `nexo-dominio-bus` (mesmo bus das specs 001–003).

**Project Type**: Web service (pipeline de eventos assíncrono + 2 endpoints síncronos), mesmo monorepo único das specs 001–003 (sem frontend, Additional Constraint de escopo backend).

**Performance Goals**: p95 ≤ 5 minutos entre "orçamento validado disponível" e "orçamento pesquisável" (sucesso ou marcação de falha técnica) — meta definida na spec, não medida ainda. Consulta de busca: sem meta de latência declarada na spec — Ricardo MUST medir p95 de busca (interpretação de consulta via Bedrock + busca híbrida pgvector) antes de comprometer SLA de API, registrado como risco remanescente.

**Constraints**: chamada síncrona a Bedrock para (a) gerar embedding do conteúdo indexável e (b) interpretar a consulta em linguagem natural em critérios estruturados — mesma consideração de cold start das specs 001–003, porém aqui a chamada (a) é assíncrona (dentro do consumidor SQS, fora do caminho crítico de UI) e a chamada (b) é síncrona (dentro do endpoint de busca, latência percebida pelo usuário) — dimensionar Provisioned Concurrency para a Lambda de busca se p95 real ultrapassar meta de UX aceitável (a definir com produto, não coberto pela spec); busca vetorial em pgvector com índice HNSW é O(log n) aproximado, mas cresce em custo de manutenção de índice com volume de escrita — monitorar tempo de reindexação/build de índice conforme volume real (Fase 01/02, sem dado de volume ainda).

**Scale/Scope**: 1 Bounded Context (Busca & Indexação), 1 agregado raiz, 2 agentes de IA (Gerador de Embeddings + Interpretador de Consulta — nenhum dos dois é "agente adicional explícito" de tratamento de exceção do Princípio IV; ver Additional Constraint check abaixo), 1 fila de indexação com retry técnico (sem fila de revisão humana de negócio, ver ADR-002), 2 eventos de entrada assinados (`OrcamentoValidado`, `OrcamentoValidadoComRessalva`).

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Tabela `indices_orcamento_historico` append-only grava cada tentativa de indexação (sucesso/falha), modelo de embedding usado e timestamp; reconstruível por `orcamentoId`; `OrcamentoIndexado` e `FalhaIndexacaoDetectada` tornam a etapa "indexado/disponível" visível na trilha do Princípio I | PASS |
| II. Desacoplamento por eventos | Busca & Indexação só entra em ação via assinatura de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (EventBridge); nunca chama diretamente componente interno da Validação; falha de indexação nunca bloqueia o avanço do orçamento no pipeline principal (ele permanece "validado", disponível por outras formas de consulta) — exatamente o comportamento exigido pela spec | PASS |
| III. Dado bruto imutável | Não aplicável a escrita de bruto (BC não toca S3); embedding é uma nova representação derivada, em tabela própria, vinculada por referência, nunca sobrescrevendo dado de Validação/Extração | PASS |
| IV. Exceção nunca é silenciosa | `FalhaIndexacaoDetectada` publicado a cada falha técnica, com motivo; nunca autoaprova por tempo/volume/exaustão de tentativas — status permanece `FALHA_INDEXACAO` até nova tentativa (automática via redrive ou operacional); histórico nunca sobrescrito. **Nota de interpretação de escopo**: diferente de 001–003, esta spec não introduz Agente Revisor nem fila de revisão humana de negócio — ver ADR-002, que justifica por que a natureza da exceção aqui é técnica/operacional (indisponibilidade de serviço de embeddings), não um julgamento de negócio que um humano ou uma segunda IA precisasse arbitrar | PASS |
| V. IA generativa como motor de entendimento | Gerador de Embeddings e Interpretador de Consulta são 100% Bedrock; nenhuma regra fixa por fornecedor/categoria; a decisão de "quais orçamentos existem e passam nos filtros determinísticos" nunca é decidida pela IA — IA só traduz consulta em critério e gera vetor (ver ADR abaixo e seção Application) | PASS |
| VI. Serverless-first | Toda a stack é Lambda/managed (API Gateway, EventBridge, SQS, Aurora Serverless v2 + pgvector); nenhum servidor fixo ocioso introduzido; decisão explícita de **não** introduzir OpenSearch Serverless ou Bedrock Knowledge Bases como serviço adicional, preferindo a capacidade já paga/elástica do Aurora existente — ver ADR-001 | PASS |
| VII. Segurança e LGPD desde o desenho | Ver seção Segurança; dado comercial sensível (preço, itens, fornecedor) permanece protegido por least-privilege IAM, criptografia em repouso (Aurora KMS) e trânsito (TLS); autorização de quem pode ver o resultado de uma busca é responsabilidade explícita do consumidor externo (conforme a própria spec), registrada como risco remanescente para Fase 03 multi-tenant | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec é Fase 02, depende apenas de Validação (003, também Fase 02) — coerente com o roadmap (briefing lista "indexação e busca semântica" na Fase 02 · Inteligência); não depende de Orquestrador completo (005) ou Multi-tenant (007), ambos fora do escopo desta spec | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Papel "Indexação (busca semântica)" é um dos 5 papéis fixos já previstos pela constituição — Agente Gerador de Embeddings mapeado diretamente a esse papel. **Ponto de atenção, não bloqueante**: o Agente Interpretador de Consulta (Bedrock, tradução de linguagem natural em critérios estruturados) não é literalmente "geração de embeddings", mas é a mesma capacidade de "Busca: consulta em linguagem natural" descrita no papel deste agente pela documentação macro (`docs/apresentacao-time.html`) — modelado como capacidade interna do mesmo papel fixo "Indexação", análogo à nota já registrada na spec 003 sobre o Categorizador de Item dentro do papel "Validador" | PASS, com nota |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; qualquer interface visual de busca é consumidor externo, fora de escopo, conforme a própria spec | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Não aplicável — esta spec não converte documento bruto | N/A |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida pelo desenho de agregado/eventos abaixo — gate permanece PASS. Pontos de atenção não-bloqueantes (ver "Riscos remanescentes" no Relatório Final):
1. o payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` publicado pela spec 003 (conforme `plan.md` daquela spec) **não inclui** os itens/condições comerciais extraídos — apenas confirmação de que as regras passaram — mas esta spec precisa desse conteúdo para gerar o `ConteudoIndexavel`/embedding; ver ADR-003 (decisão de enriquecer o payload upstream, coordenação necessária com o owner da spec 003, mesmo padrão de risco já registrado nas transições 001→002 e 002→003);
2. ausência de meta de latência declarada para o endpoint de busca (só há meta para o tempo até indexação disponível) — registrado como risco remanescente, não bloqueia o desenho.

## Bounded Context e Context Map (recorte desta spec)

```text
[BC: Validação] --(evento)--> OrcamentoValidado / OrcamentoValidadoComRessalva --(assina)--> [BC: Busca & Indexação]
                                                                                                        |
                                                                              [Agente Gerador de Embeddings — Bedrock]
                                                                                                        |
                                          (sucesso) OrcamentoIndexado                (falha técnica) FalhaIndexacaoDetectada
                                                                                                        |
                                                                                                        v
                                                                    [Fila de retry técnico — própria da Busca & Indexação]
                                                                                                        |
                                                                              (nova tentativa automática via redrive/backoff)
                                                                                                        v
                                                                                          OrcamentoIndexado (retentativa bem-sucedida)

[Consumidor externo de frontend/API] --(consulta em linguagem natural)--> POST /v1/orcamentos/busca
                                                                                    |
                                                                  [Agente Interpretador de Consulta — Bedrock]
                                                                                    |
                                                          (critérios estruturados + vetor de consulta)
                                                                                    |
                                                              [busca híbrida: filtro SQL determinístico + similaridade pgvector]
                                                                                    |
                                                                    lista de orçamentos ordenada por relevância

Consumidores externos (fora deste BC, apenas via evento/API — nunca chamada direta):
  - BC Acompanhamento / consumidor de frontend externo: assina OrcamentoIndexado/FalhaIndexacaoDetectada + consulta GET /orcamentos/{id}/indexacao/status + usa POST /v1/orcamentos/busca.
```

Relação entre contextos: **Customer/Supplier** — Validação é upstream (supplier) de Busca & Indexação. Busca & Indexação nunca altera o modelo de dado da Validação, apenas consome seus eventos. Diferente das transições 001→002→003 (onde o BC seguinte também lia/derivava de dado bruto ou repetia validações), Busca & Indexação é puramente um enriquecimento — nenhum BC downstream depende de Busca & Indexação para decisão de negócio (nenhuma spec futura declarada assina `OrcamentoIndexado` como pré-requisito bloqueante, coerente com Princípio VIII e com a própria natureza de "enriquecimento assíncrono" da spec).

**Anti-Corruption Layer obrigatória**: entre o Domain deste contexto e (a) o payload do evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (`OrcamentoValidadoEventACL`, que traduz o shape do evento upstream — após enriquecimento via ADR-003 — para os VOs locais deste BC, nunca importando tipos de domínio da Validação), (b) a resposta do Bedrock para geração de embedding (`BedrockEmbeddingACL`) e (c) a resposta do Bedrock para interpretação de consulta (`BedrockInterpretacaoConsultaACL`). Nenhuma dessas respostas cruza para dentro do Domain sem passar por um tradutor explícito.

## Domain — Agregados, VOs, Domain Events

### Agregado raiz: `IndiceOrcamento` (escopo: Busca & Indexação)

- **Identidade**: `orcamentoId` (mesmo valor de `OrcamentoId`, UUID v7, gerado exclusivamente pela Ingestão — Busca & Indexação reutiliza o valor como referência/identidade correlata do seu próprio agregado 1:1; VO `OrcamentoId` redefinido localmente neste BC, mesmo padrão de duplicação aceitável já usado nas specs 002/003).
- **Atributos**: `conteudoIndexavel` (VO `ConteudoIndexavel`, texto derivado/formatado a partir dos itens/condições/fornecedor recebidos no payload upstream — nunca reinterpreta valor estruturado, apenas concatena/formata para servir de insumo ao embedding), `status` (VO `StatusIndexacao`: PENDENTE | INDEXADO | FALHA_INDEXACAO), `embedding` (VO `Embedding`, opcional até indexação bem-sucedida), `origemValidacao` (VO `OrigemValidacao`: `VALIDADO` | `VALIDADO_COM_RESSALVA`, preservado para nunca omitir do índice um orçamento que chegou por qualquer uma das duas vias — ver ADR-004), `historico` (lista imutável de `TentativaIndexacao`, append-only).
- **Invariantes** (aplicadas nos métodos do agregado, nunca na Application):
  - Só transita para `INDEXADO` quando `embedding` foi gerado com sucesso e persistido na mesma tentativa (`registrarTentativaIndexacao(resultado)`); nunca existe um estado "indexado parcialmente".
  - `registrarTentativaIndexacao(resultado)`: se a geração de embedding falhar (erro técnico do gateway), transita para `FALHA_INDEXACAO`, anexa `TentativaIndexacao` ao histórico, nunca apaga tentativas anteriores.
  - Uma nova chamada a `registrarTentativaIndexacao` a partir de `FALHA_INDEXACAO` é sempre uma transição válida (retry), diferente do padrão de 001/002 onde o Revisor só tenta uma vez — aqui não há limite estrutural de tentativas no Domain (o limite de retry é responsabilidade de infraestrutura — SQS `maxReceiveCount` + DLQ + alarme, ver Infrastructure), porque a exceção é técnica/reversível, não um julgamento de confiança que se esgota (ver ADR-002).
  - Nenhum método do agregado MUST aceitar um parâmetro de "excluir da indexação por relevância" — estruturalmente, a única forma de um orçamento nunca chegar a `INDEXADO` é uma falha técnica registrada em `historico` (reforça a "Ação proibida em termos de negócio" da spec: nunca omitir por critério de relevância).
  - Qualquer tentativa de sobrescrever `conteudoIndexavel` ou `origemValidacao` fora do construtor de criação lança erro de domínio (`OrigemValidacaoImutavelError`).

### Value Objects

- `OrcamentoId` — mesmo formato/validação das specs 001–003 (UUID v7), redefinido localmente.
- `ConteudoIndexavel` — texto estruturado (nunca opaco) derivado dos itens/condições/fornecedor: `{ resumoFornecedor, itensDescricao: string[], condicoesResumo, categoria(s) }` serializado em texto para o gateway de embedding; construtor valida não-vazio (um `ConteudoIndexavel` vazio é erro de domínio, não uma indexação "válida" de conteúdo nulo).
- `Embedding` — `{ vetor: number[], dimensao: number, modeloId: string, geradoEm: timestamp }`; construtor valida `vetor.length === dimensao`; VO "de dados" sem lógica de negócio adicional — a responsabilidade de decidir similaridade fica na Infrastructure/query, nunca no Domain (comparação vetorial não é regra de negócio, é uma operação de banco).
- `OrigemValidacao` — enum fechado `VALIDADO | VALIDADO_COM_RESSALVA`, rejeita qualquer outro valor.
- `Dinheiro` — mesmo shape das specs 001–003, redefinido localmente (usado no VO `CriterioBusca`, não no agregado `IndiceOrcamento`).
- `CriterioBusca` — `{ categoria (opcional), precoMinimo/precoMaximo (opcional, Dinheiro), periodoRecebimento (opcional, `{ inicio, fim }`), textoLivreResidual (o que não foi mapeado a um filtro estruturado, usado para o vetor de consulta) }` — produzido pelo `AgenteInterpretadorConsultaGateway`, nunca inventa filtro fora do catálogo de categorias conhecido (mesma disciplina do Categorizador de Item da spec 003).
- `ResultadoBusca` — `{ orcamentoId, scoreRelevancia (0–1, normalizado a partir da distância vetorial), trechoDestacado (opcional) }` — VO de apresentação de resultado, nunca decide inclusão/exclusão (isso é query, não regra de negócio).
- `TentativaIndexacao` — entrada de histórico imutável: `{ resultado: 'INDEXADO' | 'FALHA_TECNICA', motivoFalha (se houver), modeloEmbedding (se sucesso), timestamp }`.

### Domain Events (payload sempre com `schemaVersion: 1`, `orcamentoId`, `ocorreuEm`; `source: nexo.busca-indexacao`)

1. `OrcamentoIndexado` — publicado quando `IndiceOrcamento` transita para `INDEXADO` (primeira tentativa ou retentativa bem-sucedida). Payload: `orcamentoId`, `modeloEmbedding`, confirmação de disponibilidade para busca. Consumido por Acompanhamento (rastreabilidade, Princípio I) — nenhum consumidor de decisão de negócio declarado nas specs conhecidas.
2. `FalhaIndexacaoDetectada` — publicado quando `registrarTentativaIndexacao` resulta em falha técnica. Payload inclui `motivoFalha` (texto legível, ex.: "serviço de embeddings indisponível", nunca "falhou" genérico) e `tentativaNumero`. Este é o evento de exceção explícito exigido pelo critério de aceite da spec ("toda falha de indexação gera evento de exceção rastreável"); consumido por Acompanhamento para exibir "validado, indexação pendente/com falha temporária" — nunca "orçamento com problema", pois a falha é técnica e não afeta o status de negócio do orçamento (que permanece "validado").

Nota: diferente das specs 001–003, não existe aqui um evento interno-only de "baixa confiança" — a exceção desta spec (`FalhaIndexacaoDetectada`) é diretamente pública desde a primeira falha, porque não há uma segunda camada de IA/humano a acionar internamente antes de tornar a falha visível (ver ADR-002); ela é, ao mesmo tempo, o evento de exceção e o sinal de "aguardando retry".

## Application — Casos de uso

- `IndexarOrcamento(orcamentoId, payloadOrcamentoValidado)` — consumidor dos eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (via SQS). Traduz o payload via `OrcamentoValidadoEventACL` (produz `ConteudoIndexavel` + `OrigemValidacao`), cria (ou recupera, em caso de retry) o agregado `IndiceOrcamento`, invoca `AgenteEmbeddingGateway`, aplica `registrarTentativaIndexacao`, persiste (upsert idempotente por `orcamentoId`), publica `OrcamentoIndexado` ou `FalhaIndexacaoDetectada`.
- `BuscarOrcamentos(consultaLinguagemNatural, filtrosExplicitos, paginacao)` — caso de uso síncrono acionado pelo endpoint REST de busca. Invoca `AgenteInterpretadorConsultaGateway` para obter `CriterioBusca` (mescla com filtros explícitos já estruturados enviados na requisição, quando presentes — filtro explícito nunca é sobrescrito pela interpretação da IA, apenas complementado); gera o vetor de consulta via o mesmo `AgenteEmbeddingGateway` sobre `textoLivreResidual`; executa busca híbrida via `IndiceOrcamentoRepository.buscarPorCriterioEVetor(...)` (filtro SQL determinístico AND similaridade vetorial pgvector, ordenado por distância); mapeia para `ResultadoBusca[]`. Nunca escreve.
- `ConsultarStatusIndexacao(orcamentoId)` — query, retorna status atual + histórico completo (nunca escreve).

Todos os casos de uso publicam evento via a mesma interface `EventPublisher` (implementada na Infra sobre EventBridge, instância própria deste BC apontando para o mesmo bus `nexo-dominio-bus`) — nunca chamam SDK AWS diretamente. `AgenteEmbeddingGateway` e `AgenteInterpretadorConsultaGateway` são interfaces definidas no Domain/Application, implementadas na Infrastructure — dependency inversion padrão do projeto.

## Infrastructure

- `BedrockEmbeddingGateway` — implementa `AgenteEmbeddingGateway` usando Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`, saída de 1024 dimensões — configurável para 256/512 se avaliação futura de custo/performance justificar, ver ADR-001; validado em [docs.aws.amazon.com/bedrock/.../model-card-amazon-titan-text-embeddings-v2](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-titan-text-embeddings-v2.html) em 2026-07-29 — Ricardo MUST reconfirmar o model ID vigente no console Bedrock da região de deploy antes da implementação, pois a disponibilidade de modelo é regional e pode mudar); `BedrockEmbeddingACL` próprio, mesma disciplina de ACL das specs 001–003.
- `BedrockInterpretadorConsultaGateway` — implementa `AgenteInterpretadorConsultaGateway`; usa saída estruturada (tool-use/JSON Schema) restrita ao catálogo de categorias conhecido, nunca texto livre interpretado como filtro; `BedrockInterpretacaoConsultaACL` próprio.
- `DrizzlePgvectorIndiceOrcamentoRepository` — traduz linha↔agregado sobre Aurora Serverless v2 Postgres; tabela `indices_orcamento` (estado atual, `conteudo_indexavel` em JSONB, `embedding` em coluna `vector(1024)` via extensão `pgvector`, índice HNSW para busca aproximada — ADR-001) e `indices_orcamento_historico` (append-only, nunca UPDATE/DELETE, apenas INSERT). Método `buscarPorCriterioEVetor` combina `WHERE` determinístico (categoria/preço/período, quando o payload upstream expõe esses campos estruturados) com `ORDER BY embedding <=> :vetorConsulta LIMIT :n` (operador de distância cosseno do pgvector).
- Migração Drizzle Kit: `CREATE EXTENSION IF NOT EXISTS vector;` + criação da coluna `vector(1024)` + índice HNSW — primeira spec do projeto a requerer extensão Postgres além do padrão, registrado como nota operacional para o script de provisionamento do Aurora (habilitar a extensão é uma etapa de infraestrutura, não de aplicação).
- `EventBridgePublisher` — implementa `EventPublisher`, publica no bus `nexo-dominio-bus` (mesma instância física, wiring próprio deste BC).
- Fila SQS: `indexador-queue` (único consumidor assíncrono desta spec), com DLQ própria + `maxReceiveCount` configurado para permitir N retentativas automáticas com backoff antes de mover para DLQ + alarme CloudWatch em mensagem na DLQ (Princípio IV — exceção de infraestrutura também nunca silenciosa; DLQ com alarme substitui aqui a fila de revisão humana de negócio das specs 001–003, ver ADR-002).
- IAM: uma role por Lambda (`IndexarOrcamentoLambdaRole`, `BuscarOrcamentosLambdaRole`, `ConsultaStatusIndexacaoLambdaRole`), least privilege — ex.: `IndexarOrcamentoLambdaRole` tem `bedrock:InvokeModel` restrito ao ARN do modelo de embedding aprovado, acesso de escrita apenas às tabelas `indices_orcamento`/`indices_orcamento_historico`, nenhuma permissão sobre `nexo-orcamentos-raw` nem sobre tabelas de outros BCs; `BuscarOrcamentosLambdaRole` tem `bedrock:InvokeModel` restrito aos dois modelos (embedding + interpretação de consulta) e apenas leitura em `indices_orcamento`.

## Interface

- Consumidor SQS (`indexador-queue`) acionado por regra EventBridge roteando `OrcamentoValidado` e `OrcamentoValidadoComRessalva` (`source: nexo.validacao`) → fila deste BC.
- `POST /v1/orcamentos/busca` — endpoint de busca (body: `{ consulta: string (linguagem natural, opcional se filtros explícitos bastarem), categoria?, precoMinimo?, precoMaximo?, periodoInicio?, periodoFim?, pagina, tamanhoPagina }`); operação de leitura sem efeito colateral (idempotente/segura), documentada como tal apesar do verbo POST (padrão comum para APIs de busca com corpo estruturado, evita limite de tamanho/encoding de querystring); retorna `ResultadoBusca[]` ordenado por relevância + metadados de paginação. Contrato Problem Details (RFC 7807) para erro.
- `GET /v1/orcamentos/{orcamentoId}/indexacao/status` — retorna status + histórico. Contrato Problem Details para erros.
- Todos os endpoints validam entrada via Zod na borda; nenhuma regra de negócio nos controllers — apenas mapeamento request↔Application.
- Autenticação: Cognito (JWT), mesmo esquema das specs 001–003 — autentica quem pode chamar a API, mas **não** implementa autorização por visibilidade de orçamento (ver Segurança e Riscos remanescentes — a própria spec delega isso a um consumidor externo).

## Segurança (riscos específicos desta spec)

- **Autorização de visibilidade de resultado de busca não é responsabilidade desta spec (declarado explicitamente pela própria spec)**: esta API autentica (Cognito JWT) mas não filtra resultado por permissão de negócio sobre orçamentos individuais — risco remanescente relevante para Fase 03 (multi-tenant), registrado explicitamente para não ser esquecido quando isolamento por rede varejista for implementado; até então, qualquer usuário autenticado do sistema pode, em tese, buscar qualquer orçamento validado — aceitável apenas enquanto o produto for single-tenant (Fase 01/02), nunca aceitável sem revisão quando Fase 03 chegar.
- **Prompt injection via consulta de usuário**: a consulta em linguagem natural, embora originada de um usuário interno (gestor de compras) e não de um documento de fornecedor, ainda é entrada de texto livre processada por um LLM (`AgenteInterpretadorConsultaGateway`) — mesma disciplina de bloco delimitado de conteúdo + saída estruturada validada por ACL das specs 001–003, para que a consulta nunca seja interpretada como instrução de sistema.
- **Prompt injection via conteúdo de item extraído (indireto)**: o `ConteudoIndexavel` usado para gerar embedding deriva de texto que originalmente veio de documento de fornecedor (já filtrado por ACLs de Extração/Validação antes de chegar aqui) — risco residual baixo porque o modelo de embedding apenas codifica o texto em um vetor (não executa instruções como um modelo de chat faria), mas o texto ainda é tratado como entrada não confiável na composição do prompt de geração de embedding, por disciplina consistente com as specs anteriores.
- **Dado comercial sensível em vetores**: embeddings codificam semanticamente preço/itens/fornecedor — criptografia em repouso (Aurora KMS), least privilege IAM, sem exposição cross-tenant (mesma preparação para Fase 03 das specs anteriores).
- **Nenhuma leitura de dado bruto nem de outro schema de BC**: reforça Princípio III/convenção #2 por design — nenhuma role IAM deste BC tem qualquer permissão sobre o bucket `nexo-orcamentos-raw` ou sobre tabelas de outros BCs.

## Project Structure

### Documentation (this feature)

```text
specs/004-indexacao-busca-semantica-orcamentos/
├── spec.md               # já existente, clarified (versão 2)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — mesma convenção monorepo único, por Bounded Context, estabelecida na spec 001

```text
src/
└── bounded-contexts/
    └── busca-indexacao/
        ├── domain/
        │   ├── indice-orcamento.aggregate.ts
        │   ├── value-objects/ (orcamento-id, conteudo-indexavel, embedding, origem-validacao, dinheiro, criterio-busca, resultado-busca, tentativa-indexacao)
        │   ├── events/ (orcamento-indexado, falha-indexacao-detectada)
        │   ├── repositories/ (indice-orcamento.repository.ts — interface)
        │   └── gateways/ (agente-embedding.gateway.ts, agente-interpretador-consulta.gateway.ts, orcamento-validado-event.acl.ts — interfaces)
        ├── application/
        │   └── use-cases/ (indexar-orcamento, buscar-orcamentos, consultar-status-indexacao)
        ├── infrastructure/
        │   ├── persistence/ (drizzle-pgvector-indice-orcamento.repository.ts, schema/)
        │   ├── aws/ (eventbridge.publisher.ts)
        │   └── bedrock/ (bedrock-embedding.gateway.ts, bedrock-interpretador-consulta.gateway.ts, acl/)
        └── interface/
            ├── http/ (controllers REST + Zod schemas)
            └── events/ (handlers Lambda consumidores de SQS)

tests/
└── bounded-contexts/busca-indexacao/
    ├── domain/ (unit, sem mocks de rede)
    ├── application/ (unit, mocks de gateway/repositório)
    └── contract/ (contratos REST)
```

**Structure Decision**: mesma convenção das specs 001–003 — novo subdiretório `src/bounded-contexts/busca-indexacao/` isolado, sem import direto de código de `validacao/`, `extracao/` ou `ingestao-identificacao/`; toda comunicação de entrada via evento (`OrcamentoValidado`/`OrcamentoValidadoComRessalva`) consumido por SQS.

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável. Dois desvios de padrão intencionais estão justificados via ADR-002 (ausência de fila de revisão humana de negócio) e ADR-004 (assinatura de dois eventos upstream em vez de um) — nenhum é uma violação de princípio.*

## ADRs desta spec

### ADR-001 — Armazenamento e busca vetorial: Aurora Serverless v2 + pgvector, não OpenSearch Serverless nem Bedrock Knowledge Bases

**Contexto**: o agregado `IndiceOrcamento` precisa persistir embeddings e servir consultas de similaridade vetorial combinadas com filtros estruturados (categoria, preço, período).

**Problema**: qual armazenamento/motor de busca vetorial usar sem introduzir um serviço gerenciado adicional fora da stack já paga (Aurora Serverless v2), quando a constituição (Princípio VI) exige preferência por capacidade elástica sob demanda já existente sobre novo componente de infraestrutura.

**Alternativas consideradas**: (a) Amazon OpenSearch Serverless com motor de vetores (k-NN); (b) Amazon Bedrock Knowledge Bases (RAG totalmente gerenciado, abstrai o vector store); (c) Aurora Serverless v2 Postgres + extensão `pgvector`.

**Vantagens (opção c, escolhida)**: reutiliza a mesma instância Aurora Serverless v2 já provisionada e paga pelos demais BCs (nenhum novo componente de infraestrutura ocioso, Princípio VI); permite busca híbrida (filtro SQL determinístico + `ORDER BY <=> `) em uma única query, sem sincronizar dois sistemas (Postgres para estado + serviço de busca separado); pgvector v0.8.0+ com índice HNSW já é suportado nativamente pelo Aurora PostgreSQL-Compatible Edition (confirmado em [aws.amazon.com/about-aws/whats-new/2025/04/pgvector-0-8-0-aurora-postgresql](https://aws.amazon.com/about-aws/whats-new/2025/04/pgvector-0-8-0-aurora-postgresql), verificado em 2026-07-29), incluindo suporte a scale-to-zero para workloads vetoriais nas versões de engine mais recentes; menor superfície de custo e operação para o volume ainda não dimensionado da Fase 02.

**Desvantagens**: pgvector com HNSW é aproximado e seu custo de manutenção de índice cresce com volume de escrita — para volumes muito altos (não esperados na Fase 02), um motor de busca vetorial dedicado (OpenSearch) escalaria melhor; Bedrock Knowledge Bases teria menor código de integração (RAG gerenciado), mas introduziria um serviço adicional cobrado por uso e menos controle sobre a composição exata da busca híbrida com filtros de negócio específicos do domínio (categoria/preço/período).

**Decisão**: Aurora Serverless v2 Postgres + `pgvector` (índice HNSW, distância cosseno) para armazenamento e busca vetorial nesta spec.

**Trade-offs**: aceita precisão aproximada (HNSW) e reavaliação futura de motor dedicado se o volume real da Fase 03 exigir, em troca de zero novo componente de infraestrutura na Fase 02 e busca híbrida em uma única query — trade-off aceitável dado Princípio VI e a ausência de dado de volume real que justifique otimização prematura.

**Impactos futuros**: se o volume de orçamentos indexados na Fase 03 (multi-tenant, escala) degradar a latência de busca a ponto de violar SLA medido, esta decisão MUST ser revisitada com ADR próprio, avaliando migração para OpenSearch Serverless — não uma migração especulativa antes de medição real.

### ADR-002 — Falha de indexação é exceção técnica com retry automático + alarme operacional, não fila de revisão humana de negócio

**Contexto**: as specs 001–003 tratam toda exceção de negócio (baixa confiança de classificação, campo não extraído, inconsistência de validação) com uma fila de escalonamento assíncrona para decisão humana explícita (Princípio IV(a)) ou uma camada de Agente Revisor de IA antes disso (Princípio IV(b)). Esta spec precisa decidir o mecanismo de resolução para "falha ao gerar/persistir embedding".

**Problema**: replicar o padrão de fila de revisão humana/Agente Revisor por consistência estrutural com 001–003, ou tratar a falha de indexação como uma categoria de exceção qualitativamente diferente.

**Alternativas consideradas**: (a) replicar o padrão: Agente Revisor de Indexação + fila de escalonamento humana; (b) tratar como exceção técnica/operacional: retry automático com backoff (SQS `maxReceiveCount`) + DLQ + alarme CloudWatch, sem envolvimento humano nem de uma segunda IA.

**Vantagens (opção b, escolhida)**: a causa mais provável de falha de indexação (indisponibilidade momentânea do serviço de embeddings, throttling, timeout de rede) não é um julgamento de negócio que um humano ou uma segunda passada de IA resolveria de forma diferente — é uma condição transiente que se resolve por retentativa. Diferente de um CNPJ malformado (spec 003, ADR-001) ou de um campo verdadeiramente ausente no documento (spec 002), aqui não há "decisão" a ser tomada — há apenas repetir a mesma operação determinística (gerar embedding do mesmo `ConteudoIndexavel`) até ela funcionar. Introduzir uma fila de revisão humana para "o serviço de embeddings estava fora do ar" adicionaria trabalho manual sem função de negócio real. O Princípio IV exige que a exceção nunca seja silenciosa e nunca autoaprove — ambos satisfeitos por `FalhaIndexacaoDetectada` (evento explícito, rastreável) + DLQ com alarme (visível operacionalmente, nunca "resolve-se por conta própria" sem sinal).

**Desvantagens**: se a causa real de uma falha específica não for transiente (ex.: `ConteudoIndexavel` malformado de forma persistente, texto que sempre excede o limite de tokens do modelo de embedding), o retry automático nunca resolve e o orçamento permanece indefinidamente em `FALHA_INDEXACAO` sem escalonamento humano nativo — mitigado por: alarme CloudWatch na DLQ (visível à operação, que pode investigar e disparar reprocessamento manual), e pelo fato de a spec explicitamente aceitar que este orçamento "permanece validado e disponível pelas demais formas de consulta" enquanto isso (não é um bloqueio de negócio).

**Decisão**: retry automático via SQS (backoff/`maxReceiveCount`) + DLQ própria + alarme CloudWatch; sem `AgenteRevisorIndexacaoGateway` nem fila de revisão humana de negócio. Válido pelo mesmo racional já usado no ADR-001 da spec 003 (Princípio IV não exige uniformemente as duas vias para toda exceção — a natureza da exceção determina o mecanismo proporcional).

**Trade-offs**: menos consistência estrutural com 001–003, em troca de não introduzir um componente (revisão humana) sem função real para uma classe de falha predominantemente transiente — mesmo trade-off já aceito e documentado no ADR-001 da spec 003.

**Impactos futuros**: se a operação observar, na prática, uma taxa sustentada de falhas não-transientes em `FalhaIndexacaoDetectada` (ex.: `ConteudoIndexavel` sistematicamente grande demais para o modelo), a introdução de um mecanismo de correção/truncamento determinístico (não uma fila humana) MUST ser avaliada por ADR próprio nesta spec.

### ADR-003 — Payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` precisa ser enriquecido com itens e condições comerciais (coordenação com spec 003)

**Contexto**: conforme o `plan.md` da spec 003, o payload atual de `OrcamentoValidado` inclui apenas `orcamentoId` e confirmação de que as regras passaram — não inclui os itens/condições comerciais extraídos. Esta spec (004) declara dependência exclusiva de `validacao-consistencia-orcamentos` (front matter do `spec.md`, `depende_de: [validacao-consistencia-orcamentos]`) e precisa desse conteúdo estruturado para montar `ConteudoIndexavel` e gerar o embedding.

**Problema**: (a) Busca & Indexação assina também os eventos de Extração (`OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`) além dos de Validação, correlacionando os dois por `orcamentoId`, para obter os itens; ou (b) o payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` é enriquecido pela spec 003 para incluir os itens/condições comerciais (que a Validação já possui internamente, copiados via sua própria ACL a partir do evento de Extração), evitando uma segunda assinatura cross-BC não declarada pela spec.

**Alternativas consideradas**: (a) assinatura adicional a eventos de Extração; (b) enriquecimento do payload de Validação.

**Vantagens (opção b, escolhida)**: respeita a dependência única declarada explicitamente no `spec.md` desta feature (`depende_de: [validacao-consistencia-orcamentos]`, sem menção a Extração) — assinar um segundo BC não declarado pela spec seria uma decisão de arquitetura que contradiz o escopo de dependência já definido pelo PM/produto; mantém o princípio "cada evento carrega o que o consumidor direto precisa", já usado quando a spec 002 exigiu que `OrcamentoClassificado` (spec 001) incluísse `referenciaBruta`; a Validação já possui os dados (cópia imutável em `dadosExtraidos`, conforme seu próprio `plan.md`) — expô-los no payload de saída é apenas espelhar dado já tratado, não uma nova responsabilidade de negócio para aquele BC.

**Desvantagens**: aumenta o tamanho do payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (mesmo risco de tamanho de payload do EventBridge já registrado na spec 002 para `OrcamentoExtraido`); acopla — em termos de contrato de dado, não de chamada síncrona — a spec 003 a um requisito de uma spec futura (004), exigindo revisão do plano/schema já aprovado da spec 003.

**Decisão**: o payload de `OrcamentoValidado` e `OrcamentoValidadoComRessalva` MUST ser enriquecido (spec 003) para incluir `itens` e `condicoesComerciais` (mesmo shape estrutural já usado internamente por `DadosExtraidosParaValidacao`), permitindo que `OrcamentoValidadoEventACL` (spec 004) traduza isso para `ConteudoIndexavel` sem qualquer assinatura adicional a eventos de Extração. Esta é uma dependência de coordenação registrada como risco remanescente (ver Relatório Final), não uma violação de princípio — mesmo padrão de risco cross-spec já registrado nas transições 001→002 e 002→003.

**Trade-offs**: payload maior no evento de Validação em troca de manter o grafo de dependência de Bounded Context exatamente como declarado pela spec (Validação → Busca & Indexação, sem aresta extra Extração → Busca & Indexação) — trade-off aceitável e alinhado ao Princípio II (nenhum componente MUST chamar/depender diretamente de um BC não declarado em sua própria especificação).

**Impactos futuros**: se o payload crescer a ponto de aproximar o limite de 256KB do EventBridge (risco já sinalizado na spec 002), a solução é migrar para "payload por referência" (ex.: apontar para um registro em Aurora do próprio BC Validação, lido via API/gateway explícito), nunca voltar a decisão de assinar diretamente eventos de Extração sem atualizar o `depende_de` desta spec.

### ADR-004 — Busca & Indexação assina tanto `OrcamentoValidado` quanto `OrcamentoValidadoComRessalva`

**Contexto**: a spec 003 publica dois eventos terminais de sucesso de negócio: `OrcamentoValidado` (todas as regras passaram) e `OrcamentoValidadoComRessalva` (humano aceitou explicitamente uma inconsistência remanescente). A spec 004 descreve seu gatilho apenas como "orçamento marcado como validado (spec 003)", sem detalhar qual dos dois eventos.

**Problema**: assinar apenas `OrcamentoValidado` deixaria todo orçamento `VALIDADO_COM_RESSALVA` permanentemente fora do índice de busca — o que contradiz diretamente a "Ação proibida em termos de negócio" da própria spec 004 ("nunca omitir um orçamento validado do índice por qualquer critério que não seja falha técnica").

**Alternativas consideradas**: (a) assinar apenas `OrcamentoValidado`; (b) assinar `OrcamentoValidado` e `OrcamentoValidadoComRessalva`, ambos tratados como gatilho de indexação.

**Vantagens (opção b, escolhida)**: `VALIDADO_COM_RESSALVA` é, para efeito de disponibilidade de negócio, um orçamento que o gestor de compras já pode considerar/usar (é aceite explícito, terminal, não é uma falha) — mesmo padrão já reconhecido pela spec 003 (é análogo a `OrcamentoExtraidoComPendenciaConfirmada` na spec 002, que a própria spec 003 já decidiu tratar como elegível para suas próprias regras, não como "menos válido"). Excluir esses orçamentos da busca seria uma decisão de negócio implícita de "relevância" que a spec proíbe explicitamente.

**Desvantagens**: nenhuma desvantagem de negócio identificada; overhead técnico mínimo (uma regra de roteamento EventBridge adicional, um campo `origemValidacao` no agregado).

**Decisão**: o consumidor SQS deste BC é acionado por ambos os eventos; `OrigemValidacao` é preservado no agregado `IndiceOrcamento` e pode ser exposto em `ResultadoBusca` (ex.: para o consumidor externo sinalizar visualmente "validado com ressalva" no resultado, decisão de UI fora de escopo deste BC).

**Trade-offs**: nenhum trade-off relevante — decisão de baixo risco e diretamente exigida pelo próprio texto da spec.

**Impactos futuros**: qualquer evento terminal de sucesso de negócio futuro que a spec 003 venha a introduzir (ex.: um terceiro desfecho) MUST ser avaliado quanto à mesma regra — só é legítimo excluir um orçamento do índice por falha técnica, nunca por qual via de sucesso ele percorreu.
