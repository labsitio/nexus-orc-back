# Matriz de rastreabilidade — T012/T012b (agregado IndiceOrcamento)

| Requisito / critério (tasks.md T012) | Cenário | Teste | Resultado |
|---|---|---|---|
| Estado inicial PENDENTE, sem embedding, sem histórico | criação via `criar` | `inicia em PENDENTE, sem embedding, sem histórico` | PASS |
| Transição p/ INDEXADO só com embedding na mesma tentativa | sucesso com embedding | `transita para INDEXADO quando embedding é fornecido na mesma tentativa` | PASS |
| Invariante crítica: nunca INDEXADO sem embedding | força INDEXADO sem embedding | `nunca transita para INDEXADO sem embedding — erro de domínio, sem mutar estado` | PASS |
| Falha técnica transita para FALHA_INDEXACAO | falha registrada | `transita para FALHA_INDEXACAO em falha técnica e preserva histórico` | PASS |
| Retry sem limite estrutural no Domain | 2 falhas + sucesso | `permite retry sem limite estrutural após FALHA_INDEXACAO, mantendo tentativas anteriores no histórico` | PASS |
| Histórico append-only, nunca sobrescrito | encadeamento de 3 tentativas | mesmo teste acima (ordem preservada) | PASS |
| Histórico exposto é cópia defensiva (leitura) | mutação do array retornado | `historico exposto é cópia defensiva — não permite mutar o array interno` | PASS |
| `OrigemValidacaoImutavelError` ao sobrescrever `conteudoIndexavel` | set fora do construtor | `rejeita sobrescrever conteudoIndexavel fora do construtor` | PASS |
| `OrigemValidacaoImutavelError` ao sobrescrever `origemValidacao` | set fora do construtor | `rejeita sobrescrever origemValidacao fora do construtor` | PASS |
| Getters expõem valores definidos no construtor | leitura direta | `expõe conteudoIndexavel e origemValidacao definidos no construtor` | PASS (adicionado pelo QA) |
| Reidratação (`reconstituir`) de estado persistido válido (INDEXADO) | reconstituir com embedding | `reconstitui agregado já indexado a partir de estado persistido` | PASS |
| Reidratação rejeita dado inconsistente (INDEXADO sem embedding) | reconstituir sem embedding | `rejeita reidratar estado INDEXADO sem embedding — dado persistido inconsistente` | PASS |
| Reidratação de FALHA_INDEXACAO com histórico prévio, sem exigir embedding | reconstituir com histórico | `reconstitui agregado em FALHA_INDEXACAO com histórico prévio, sem exigir embedding` | PASS (adicionado pelo QA) |
| Reidratação faz cópia defensiva do histórico recebido | mutação do array de origem pós-reconstituir | `reconstitui com cópia defensiva do histórico — array de origem não afeta o agregado` | PASS (adicionado pelo QA) |
| (T012b, ADR-005) `tenantId` obrigatório na criação | `criar` sem `tenantId` | `rejeita criação sem tenantId — erro de domínio` | PASS |
| (T012b, ADR-005) `TenantIdImutavelError` ao sobrescrever `tenantId` pós-criação | set fora do construtor | `rejeita sobrescrever tenantId fora do construtor` | PASS |
| (T012b, ADR-005) getter expõe `tenantId` definido no construtor | leitura direta | `expõe tenantId definido no construtor` | PASS |

Cobertura de branch/statement/function do arquivo `indice-orcamento.aggregate.ts`: 100% após os 3 testes adicionados pelo QA em T012 (baseline do dev-back-end: 93.75% stmts/lines, 84.61% funcs, 100% branch — lacuna nos getters `conteudoIndexavel`/`origemValidacao` e no caminho `reconstituir` com `FALHA_INDEXACAO`); mantida em 100% (39/39 stmts, 8/8 branches) após o retrofit de T012b (3 novos testes cobrindo o novo campo `tenantId`, sem linha nova descoberta).

Fora do escopo desta task (cobertos por outras tasks/specs): `TentativaIndexacao.de` (VO, testado em `tentativa-indexacao.vo.test.ts`), persistência com `tenant_id`/RLS e `DrizzleTenantScopedRepositoryBase` (T015b/T016), ACL (T018), isolamento cross-tenant ponta a ponta (T027b).

**T021 (PR #543) — marcação de conclusão, sem código novo**: critério de T021 ("`registrarTentativaIndexacao` com falha técnica → transita para `FALHA_INDEXACAO`, histórico anexado, nenhum limite estrutural de tentativas") já integralmente coberto pelas linhas 8–10 acima (testes de T012/T012b, PRs #501/#532). QA reverificou nesta rodada: 16/16 testes do arquivo passando (`vitest run`), ausência de limite estrutural confirmada em código (`indice-orcamento.aggregate.ts`, comentário ADR-002: retry sem limite no Domain, limite é responsabilidade de infraestrutura). Nenhum arquivo de produção alterado nesta task.

## T013b (PR #533) — Domain Events `OrcamentoIndexado`/`FalhaIndexacaoDetectada`, `schemaVersion: 2` + `tenantId`

| Requisito / critério (tasks.md T013b, ADR-005 retrofit) | Cenário | Teste | Resultado |
|---|---|---|---|
| `schemaVersion` sobe para `2` em ambos os eventos | criação de cada evento | `schemaVersion 2, orcamentoId, tenantId e detailType "..." (ADR-005)` (describe.each) | PASS |
| `tenantId: string` obrigatório no envelope, propagado ao payload | criação de cada evento com `tenantId` | mesmo teste acima | PASS |
| `orcamentoId` e `detailType` preservados (contrato pré-existente, T013) | criação de cada evento | mesmo teste acima | PASS |
| `ocorreuEm` continua ISO-8601 válido | `new Date(evento.ocorreuEm)` | mesmo teste acima | PASS |
| `OrcamentoIndexado.modeloEmbedding` preservado (não afetado pelo retrofit) | criação com modelo de embedding | `carrega o modeloEmbedding usado na geração do vetor persistido` | PASS |
| `FalhaIndexacaoDetectada.motivoFalha`/`tentativaNumero` preservados | criação com motivo e tentativa | `carrega motivoFalha legível e o número da tentativa que falhou` | PASS |

Cobertura dos 3 arquivos alterados (`domain-event.ts`, `orcamento-indexado.event.ts`, `falha-indexacao-detectada.event.ts`), via `coverage-final.json`: 100% statements/branches/functions em ambos os `.event.ts` (8/8 e 7/7 stmts); `domain-event.ts` é somente `interface` (0 statement executável, nada a cobrir).

## T033 (PR #552) — `BedrockInterpretacaoConsultaACL` (ACL de tradução pura, sem chamada AWS/Bedrock real)

| Requisito / critério (tasks.md T033) | Cenário | Teste | Resultado |
|---|---|---|---|
| `ehInterpretacaoConsultaBruta` aceita shape mínimo válido | apenas `textoLivreResidual` string | `aceita shape com textoLivreResidual string` | PASS |
| Rejeita `textoLivreResidual` ausente/`null`/tipo incorreto | shape vazio, `null`, tipo numérico | `rejeita ausência de textoLivreResidual, null, ou tipo incorreto` | PASS |
| Rejeita `categoria` com tipo incorreto | `categoria: 42` | `rejeita categoria com tipo incorreto` | PASS |
| Rejeita `precoMinimo`/`precoMaximo` com campo aninhado de tipo incorreto | `moeda` numérica, `valorCentavos` string | `rejeita precoMinimo/precoMaximo com campo aninhado de tipo incorreto` | PASS |
| Rejeita `periodoRecebimento` com campo aninhado de tipo incorreto | `inicio`/`fim` com tipo incorreto | `rejeita periodoRecebimento com campo aninhado de tipo incorreto` | PASS |
| Rejeita `precoMinimo`/`precoMaximo`/`periodoRecebimento` quando o próprio campo não é objeto (string/null) | campo raiz não-objeto | `rejeita precoMinimo/precoMaximo quando o próprio campo não é um objeto` / `rejeita periodoRecebimento quando o próprio campo não é um objeto` | PASS (adicionado pelo QA) |
| Converte saída completa (categoria do catálogo + faixa de preço + período) em `CriterioBusca` válido | caso feliz completo | `converte saída estruturada com categoria pertencente ao catálogo em CriterioBusca válido` | PASS |
| Converte saída somente com texto livre (sem nenhum filtro estruturado) | shape mínimo | `converte saída sem nenhum filtro estruturado (apenas texto livre) em CriterioBusca válido` | PASS |
| **Núcleo do requisito**: rejeita (nunca corrige/aproxima) `categoria` fora do `catalogoCategorias` configurado | categoria inventada pelo modelo | `lança BedrockInterpretacaoConsultaACLInvalidaError quando categoria não pertence ao catálogo configurado` | PASS |
| Rejeita mesmo com grafia parecida a categoria válida (nunca aproxima) | `'Ferragens'` vs. catálogo `'ferragens'` | `nunca aceita categoria fora do catálogo mesmo com grafia parecida a uma categoria válida` | PASS |
| Propaga erro de domínio do VO em moeda divergente entre `precoMinimo`/`precoMaximo` | `BRL` vs. `USD` | `propaga erro de domínio quando precoMinimo/precoMaximo estruturado é inválido (ex.: moeda divergente)` | PASS |
| Propaga `CriterioBuscaInvalidoError` explícito em data inválida de `periodoRecebimento` (nunca exceção não controlada) | `inicio: 'data-invalida'` | `propaga erro de domínio quando periodoRecebimento estruturado tem data inválida` | PASS |

Cobertura de `bedrock-interpretacao-consulta.acl.ts`: baseline do dev-back-end (11 testes) já em 92.3% stmts/100% funcs/100% lines, 93.18% branch — gap de branch nas linhas 37/43 (`typeof valor !== 'object'` nos type guards `ehFaixaPrecoBruta`/`ehPeriodoRecebimentoBruto`), nunca exercitado com o campo raiz sendo não-objeto (ex.: `precoMinimo: 'gratis'`). QA adicionou 2 cenários (3 asserções) fechando essa lacuna: 100% statements/branches/functions/lines (13/13 testes). Nenhuma linha de produção alterada.

Fora do escopo desta task (cobertos por outra task): `BedrockInterpretadorConsultaGateway` (chamada Bedrock real, IAM) é T037/#197.

Nenhum consumidor de produção publica ou lê esses eventos ainda (`registrarTentativaIndexacao`/publicação fica para T029, ainda `[ ]`) — sem risco de quebra de contrato em código existente.

## T016 (PR #536) — `DrizzlePgvectorIndiceOrcamentoRepository`, retrofit ADR-005 (`DrizzleTenantScopedRepositoryBase`)

| Requisito / critério (tasks.md T016) | Cenário | Teste | Resultado |
|---|---|---|---|
| Tradução linha↔agregado (PENDENTE, sem embedding) | `upsert` inicial + `buscarPorOrcamentoId` | `upsert idempotente: PENDENTE inicial, depois INDEXADO com embedding e 1 entrada de histórico` | PASS |
| Tradução linha↔agregado (INDEXADO, embedding + modeloId reidratados do histórico) | mesmo teste, 2ª fase | idem | PASS |
| `buscarPorOrcamentoId` retorna `undefined` para id inexistente | busca de id nunca persistido | `buscarPorOrcamentoId retorna undefined para orcamentoId inexistente` | PASS |
| Falha técnica seguida de retry: histórico com 2 entradas, sem sobrescrever a 1ª | 2 tentativas via `upsert` | `falha técnica seguida de retry bem-sucedido produz 2 entradas de histórico, sem sobrescrever a primeira` | PASS |
| Re-upsert sem transição nova não duplica histórico | `upsert` 2x sem nova `registrarTentativaIndexacao` | `re-upsert do mesmo agregado sem transição nova não duplica histórico` | PASS |
| `upsert` concorrente (retry de handler Lambda) produz exatamente 1 entrada de histórico (lock `FOR UPDATE`) | 2 conexões, `Promise.all` | `duas chamadas concorrentes de upsert() para o mesmo orcamentoId (retry) produzem exatamente 1 entrada de histórico` | PASS |
| `upsert` rejeita agregado com `tenantId` divergente do `TenantContext` da instância (guard aplicativo, não RLS) | agregado Tenant B em repo construído com Tenant A | `upsert rejeita agregado com tenantId diferente do TenantContext da instância` | PASS |
| Coluna `tenant_id` persistida corretamente | leitura direta via SQL após `upsert` | `upsert persiste o tenantId correto na coluna tenant_id` | PASS |
| `buscarPorCriterioEVetor`: filtro determinístico por categoria (JSONB) + ordenação por distância vetorial + exclusão de itens não `INDEXADO` | 4 índices (próximo/distante/outra categoria/pendente) | `filtra por categoria (JSONB) e ordena por distância vetorial, ignorando itens não INDEXADOS` | PASS |
| `buscarPorCriterioEVetor` sem vetor de consulta aplica só o filtro determinístico | busca sem `vetorConsulta` | `sem vetor de consulta, aplica apenas o filtro determinístico (categoria + estado INDEXADO)` | PASS |
| Retrofit ADR-005: classe estende `DrizzleTenantScopedRepositoryBase`, usa `transacaoTenantScoped` em toda transação (`upsert`, `buscarPorOrcamentoId`, `buscarPorCriterioEVetor`) | inspeção de código + execução de todos os testes acima contra Postgres real com RLS ativa (T015b) | leitura de `drizzle-pgvector-indice-orcamento.repository.ts` (linhas 138–300) | PASS |
| Isolamento cross-tenant real (RLS, role sem `BYPASSRLS`) — fora do escopo direto de T016, mas pré-requisito já validado por T027b | Tenant A não vê linha de Tenant B mesmo sem `SET LOCAL` | `tests/security/isolamento-multitenant/busca-indexacao.test.ts` (4 testes) + `rls-enforcement-busca-indexacao.test.ts` (5 testes) | PASS (16/16, já validados em T015b/T027b; regressão confirmada nesta rodada) |

Cobertura de `drizzle-pgvector-indice-orcamento.repository.ts` isolando a suíte alvo: 98% statements, 88.46% branches, 100% functions, 98% lines — única linha não coberta é o guard defensivo de dado inconsistente em `embeddingDaLinha` (linha persistida com `embedding` mas sem `TentativaIndexacao` `INDEXADO` correspondente no histórico, estado que `upsert` desta própria classe nunca produz; equivalente ao padrão já aceito em `IndiceOrcamentoInconsistenteError` de `agregadoDaLinha`/`reconstituir`, T012). Lacuna classificada como "código inviável de testar sem inserir dado inconsistente diretamente via SQL bruto, contornando o próprio repositório" — risco residual aceitável, não bloqueia o gate.

`precoMinimo`/`precoMaximo`/`periodoRecebimento` de `CriterioBusca` permanecem fora do escopo de T016 (documentado no próprio arquivo de produção, JSDoc) — dependem do enriquecimento de payload da spec 003 (T006/T045), ainda bloqueado. Não é lacuna de T016; será risco residual de T037/T038 (US2).

## T017 (PR #537) — `EventBridgePublisher` implementando `EventPublisher` (instância própria do BC, bus `nexo-dominio-bus`)

| Requisito / critério (tasks.md T017) | Cenário | Teste | Resultado |
|---|---|---|---|
| Publica no bus informado, com `source` fixo `nexo.busca-indexacao` e `DetailType` = `detailType` do evento | envio bem-sucedido | `publica no bus informado com source fixo 'nexo.busca-indexacao' e detail-type do evento` | PASS |
| `Detail` serializado inclui payload do evento (`orcamentoId`, `tenantId`, ADR-005) | inspeção do `Detail` JSON enviado | mesmo teste acima | PASS |
| Falha reportada pelo EventBridge (`FailedEntryCount`) lança erro descritivo com `ErrorMessage` | `FailedEntryCount: 1` com `ErrorMessage: 'rate exceeded'` | `lança erro descritivo se o EventBridge reportar falha na entrada` | PASS |
| Fallback de mensagem quando `ErrorMessage` ausente | `FailedEntryCount: 1`, `Entries: [{}]` | `usa mensagem de fallback quando o EventBridge não informa ErrorMessage` | PASS |
| Instância própria do BC (não reutiliza client/config de outro BC) | leitura de código — classe própria, sem import cruzado de outro bounded-context | comparação byte-a-byte com `validacao/infrastructure/eventbridge.publisher.ts` (só difere `SOURCE` e comentários) | PASS |
| Contrato `EventPublisher` (domain) desacoplado do SDK AWS | leitura de código — `publicar(evento): Promise<void>`, sem tipo AWS no domain | `src/bounded-contexts/busca-indexacao/domain/gateways/event-publisher.ts` | PASS |

Cobertura de `eventbridge.publisher.ts` isolando a suíte alvo: 100% statements (7/7), 100% branches (4/4), 100% functions (2/2), 100% lines (7/7) — os 2 ramos do guard `FailedEntryCount` (com e sem `ErrorMessage`) e o caminho de sucesso estão cobertos.

Fora do escopo desta task (cobertas por tasks futuras): consumo do `EventPublisher` por caso de uso/handler e composition-root (wiring) — T018/T019; nenhuma implementação nesta PR depende deles.

## T022 (PR #545) — Unit test invariante "nunca omitir por relevância"

| Requisito / critério (tasks.md T022) | Cenário | Teste | Resultado |
|---|---|---|---|
| Nenhum método do agregado aceita parâmetro de exclusão de negócio (ex.: "excluído por relevância") | inspeção do conjunto de métodos públicos do prototype | `único método de transição de estado é registrarTentativaIndexacao — nenhum método de exclusão de negócio exposto` | PASS |
| Única via para não indexar é falha técnica registrada — qualquer `resultado` diferente de `INDEXADO` (incl. valor forjado de negócio) colapsa em `FALHA_TECNICA` | `resultado: 'EXCLUIDO_POR_RELEVANCIA'` com `motivoFalha` | `registrarTentativaIndexacao ignora qualquer valor de "resultado" além de INDEXADO e sempre normaliza para FALHA_TECNICA — não existe via de exclusão por relevância` | PASS |
| Mesmo com `resultado` forjado, `FALHA_TECNICA` sem `motivoFalha` continua rejeitado (nenhuma omissão silenciosa) | `resultado: 'EXCLUIDO_POR_RELEVANCIA'` sem `motivoFalha` | `registrarTentativaIndexacao rejeita FALHA_TECNICA sem motivoFalha — nenhuma omissão silenciosa, mesmo com resultado de negócio forjado` | PASS |

Nenhum arquivo de produção alterado nesta task — a invariante já existia no agregado (união fechada `RegistrarTentativaIndexacaoParams`, normalização hardcoded de qualquer `resultado` não-`INDEXADO` para `FALHA_TECNICA`); os 2 testes novos apenas comprovam explicitamente que não existe via estrutural para "excluir por relevância". `backend-reviewer` aprovou na 2ª rodada (achado MAJOR da 1ª rodada, sobre isolamento de causa em um dos testes, corrigido no commit 80a43f7).

Cobertura de `indice-orcamento.aggregate.ts` isolando a suíte alvo (19 testes do arquivo, incluindo os 2 novos de T022): 100% statements (39/39), 100% branches (8/8), 100% functions (16/16), 100% lines (39/39) — sem regressão em relação à baseline de T012b/T021.

## T028 (PR #550) — `BedrockEmbeddingGateway` + `BedrockEmbeddingACL` (Titan Text Embeddings V2)

| Requisito / critério (tasks.md T028, plan.md Infrastructure) | Cenário | Teste | Resultado |
|---|---|---|---|
| Gateway invoca Bedrock InvokeModel (não Converse/tool-use) com `inputText`/`dimensions=1024`/`normalize=true` e devolve VO `Embedding` | caso feliz, vetor de 1024 dimensões | `gerarEmbedding invoca o InvokeModel API com inputText/dimensions/normalize e devolve o VO Embedding` | PASS |
| Resposta sem corpo é tratada como erro explícito, nunca silenciosa | `resposta.body` ausente | `lança erro se a resposta não tiver corpo` | PASS |
| Shape de resposta inválido (sem campo `embedding` array de números) é rejeitado pelo type guard `ehEmbeddingBruto` | `{ mensagem: 'erro qualquer' }` | `lança erro se o corpo da resposta não contiver um vetor de embedding válido` | PASS |
| Dimensão do vetor devolvida pelo modelo diferente de 1024 é rejeitada por `BedrockEmbeddingACL` (`BedrockEmbeddingACLInvalidaError`) | vetor de 256 dimensões | `propaga BedrockEmbeddingACLInvalidaError quando a dimensão devolvida não bate com a esperada` | PASS |
| `ehEmbeddingBruto` aceita/rejeita shapes estruturais (nunca confia cegamente no shape do modelo) | objeto vazio, `null`, array com elemento não numérico | `ehEmbeddingBruto` (3 casos) | PASS |
| `BedrockEmbeddingACL.converter` produz `Embedding` válido (1024 dim, `modeloId`, `geradoEm`) a partir de bruto correto | vetor de 1024 dimensões | `converte embedding bruto de 1024 dimensões em VO Embedding válido` | PASS |

Assinatura de `BedrockEmbeddingGateway.gerarEmbedding` confere exatamente com a interface de domínio `AgenteEmbeddingGateway`. Cobertura (lida de `coverage-summary.json` por caminho absoluto — a tabela ASCII do terminal não exibe as linhas individuais destes 2 arquivos): `bedrock-embedding.acl.ts` 100%/100%/100%/100% (statements/branches/functions/lines); `bedrock-embedding.gateway.ts` 100%/100%/100%/100%.

**Lacuna não bloqueante identificada**: `JSON.parse` do corpo da resposta no gateway não está em `try/catch` (diferente do padrão já usado em `markitdown-conversao.acl.ts`/`markitdown-conversao-extracao.acl.ts`, specs 001/002, que traduzem JSON malformado em mensagem de erro legível) — um corpo malformado propagaria `SyntaxError` nativo em vez de erro no padrão do gateway. Nenhum teste cobre JSON sintaticamente inválido (distinto do caso já testado de "shape inválido"). Mesmo NIT já apontado pelo `backend-reviewer` como não bloqueante; QA concorda com a classificação e recomenda endereçar junto de T029. Nenhum defeito de produção aberto (BUG) para esta lacuna.

## T030 (PR #660) — Handler Lambda consumidor SQS de `indexador-queue`

| Requisito / critério (tasks.md T030, spec.md Princípios II/IV, ADR-008) | Cenário | Teste | Resultado |
|---|---|---|---|
| Traduz envelope via `OrcamentoValidadoEventACL` e invoca `IndexarOrcamento.executar(tenantId, detailType, payloadBruto)` para cada mensagem do lote | 2 mensagens válidas (`OrcamentoValidado`/`OrcamentoValidadoComRessalva`) | `invoca IndexarOrcamento.executar com tenantId (via ACL), detailType e o detail bruto, para cada mensagem` | PASS |
| Falha isolada por item nunca bloqueia as demais mensagens do lote (Princípio II) — `batchItemFailures` reporta só o item falho | 1 item cuja `executar` lança, 1 item saudável no mesmo lote | `reporta só o item falho (batch item failure) sem interromper o processamento das demais mensagens` | PASS |
| Mensagem sem envelope EventBridge válido (`detail-type` ausente/desconhecido) nunca lança — vira batch item failure | body sem `detail-type`, body com `detail-type` desconhecido, ambos no mesmo lote | `reporta falha (nunca lança) se o corpo não for um envelope EventBridge válido` | PASS |
| Body sintaticamente inválido (não-JSON) nunca lança — vira batch item failure | `body: 'não é json'` | `reporta falha se o corpo não for JSON válido` | PASS |
| `tenantId` ausente é rejeitado pela ACL, nunca inventado/inferido (ADR-008/#632) — vira batch item failure | envelope válido sem `tenantId` | `rejeita via ACL (batch item failure) quando tenantId está ausente no envelope` | PASS |
| Falha nunca é silenciosa (Princípio IV) — todo erro vira log estruturado correlacionado por `orcamentoId`/`tenantId`/`messageId` | mensagem processada com sucesso | `correlaciona todo log por orcamentoId, tenantId e messageId` | PASS |
| Log de erro mantém correlação por `messageId` mesmo quando `orcamentoId`/`tenantId` não foram extraídos (falha antes da tradução) | envelope inválido | `loga erro correlacionado por messageId mesmo sem orcamentoId/tenantId extraídos` | PASS |
| Idempotência sob redelivery at-least-once é responsabilidade do caso de uso (upsert por `orcamentoId`) — handler não duplica nem trata especialmente | reentrega do mesmo `orcamentoId` | `entrega duplicada (at-least-once) é idempotente por design do caso de uso` | PASS |
| Handler depende só da porta `OrcamentoValidadoEventACL` (domain), não da implementação concreta | ACL fake injetada | `usa o mock de resultado da ACL para chamar executar mesmo quando a tradução é injetada (fake)` | PASS |

Suítes executadas: `npx tsc --noEmit` (limpo), `npx eslint .` (limpo), `npx vitest run tests/bounded-contexts/busca-indexacao/` — 24 arquivos, 169 testes passando, 4 arquivos (23 testes) pulados por `describe.skipIf(!DATABASE_URL)` (integração real com Postgres, ambiente sem `DATABASE_URL` nesta sessão — não é falha, é a mesma limitação já registrada em T025/T029).

Cobertura de `indexador-queue.handler.ts` isolando a suíte alvo: 95.83% statements (23/24), 90.9% branches (10/11), 100% functions (4/4), 95.83% lines (23/24). Único ramo não coberto: `ehEventBridgeEnvelope` linha 47 (`typeof valor !== 'object' || valor === null` quando o JSON parseado é um primitivo/array/`null` no topo, ex. body `"42"` ou `"[]"`) — ramo defensivo cuja saída (batch item failure, mesmo log de erro) é idêntica à já exercitada pelo teste de "detail-type ausente/desconhecido"; risco residual classificado como **código inviável de ganho adicional** (mesmo comportamento observável, teste extra só duplicaria asserção). Não bloqueante.

Verificado por leitura de código: falha técnica do `AgenteEmbeddingGateway` (Bedrock indisponível/timeout) é tratada dentro de `IndexarOrcamento.executar` (T029, já aprovado) — publica `FalhaIndexacaoDetectada` e **não propaga** para o handler; portanto o `catch` deste handler só recebe erro de infraestrutura (Postgres/EventBridge) ou de tradução (ACL), ambos cobertos pelo teste de "reporta só o item falho" (que simula exatamente uma rejeição de `executar`) — não há necessidade de teste adicional simulando Bedrock indisponível neste nível, isso já é coberto pela suíte de `indexar-orcamento.test.ts` (T029).

Nenhum arquivo de produção teve teste adicional necessário — os 9 casos já escritos pelo dev-back-end cobrem os 4 critérios de aceite do handoff (isolamento de item no batch, falha nunca silenciosa, tenantId nunca inventado, correlação de log) com cenário positivo e negativo cada. Nenhum defeito de produção encontrado nesta validação.

## #623 (PR #662) — Composition root de produção: Lambda `IndexarOrcamento` (IAM + NodejsFunction)

Sem T-number dedicado em `tasks.md` — a própria T030 registra explicitamente "Composição de produção fica para #623, escopo separado". Primeira Lambda de produção do repositório (formato de referência para #613/#614/#615/#624, ADR-009).

| Requisito / critério (issue #623, ADR-009) | Cenário | Teste | Resultado |
|---|---|---|---|
| Composição de produção compõe corretamente a fábrica `criarIndexadorQueueHandler` (T030) e `IndexarOrcamento` (T029) sem alterá-las | `criarBuscaIndexacao(deps)` com stubs de `db`/`eventBridge`/`bedrock` | `constrói indexarOrcamento e acl com os stubs injetados` | PASS |
| Isolamento multitenant: `indexador-queue` é fila única não particionada por tenant, mas `IndiceOrcamentoRepository` (ADR-005/spec 007) exige instância por tenant — `IndexarOrcamentoPorMensagem.executar` deve construir repositório novo por mensagem, nunca reaproveitar entre tenants | payload inválido (rejeitado pela ACL antes de qualquer I/O) via `TenantId` válido | `indexarOrcamento.executar delega por mensagem (nunca reaproveita repositório entre tenants)` | PASS (delegação real confirmada — `repositorioNuncaUsado` nunca invocado, rejeição vem da ACL dentro do `executar` real de `IndexarOrcamento`, não de stub vazio) |
| `exigirAgenteIaBedrockEmProducao` — fail-fast no cold start se `NEXO_AGENTE_IA` != `"bedrock"` (ADR-009, Decisão 3) | ausente, valor errado (`"ollama"`), valor correto | 3 casos novos em `tests/composition/aws-clients.production.test.ts` (escritos por QA — único branch de decisão do arquivo, não coberto pelo dev-back-end) | PASS |
| `NodejsFunction` liga role (`IndexadorLambdaRole`, least privilege) + fila (`indexador-queue`, `SqsEventSource` com `reportBatchItemFailures`) + bus de domínio | `cdk synth --quiet` (sem credencial AWS — sem deploy) | bundling esbuild ESM do `entry: indexador-queue.production.ts` sem erro; `IndexadorFunctionStack` sintetizado e listado | PASS |
| Nenhuma regressão nos testes pré-existentes do repositório | suíte completa | `pnpm run test` | PASS — 1004 aprovados (1001 pré-existentes + 3 novos), 106 pulados (mesmos, `DATABASE_URL` ausente), 0 falhos |
| IAM least privilege: `bedrock:InvokeModel` restrito a ARN parametrizado (nunca `*`), `events:PutEvents` restrito ao ARN do bus, sem policy para Postgres (TCP via `DATABASE_URL`, não RDS Data API), sem permissão S3 | leitura de código (`indexador-lambda-role-stack.ts`) — sem credencial AWS para testar IAM em runtime | verificado por leitura de código + `cdk synth` (sintaxe válida) | PASS (verificação estática — IAM em runtime é limitação de ambiente, ver riscos residuais) |

Suítes executadas: `pnpm run typecheck` (limpo), `pnpm run typecheck:infra` (limpo), `pnpm run lint` (limpo — 1 falso positivo transitório do `cdk.out/` gerado pela própria sessão de QA, removido antes da medição final, não é achado sobre o PR), `cdk synth --quiet` (sintetiza as 18 stacks, incluindo `IndexadorFunctionStack`, sem erro — sem deploy, sem credencial AWS), `pnpm run test` — 166 arquivos passando (1004 testes), 19 arquivos pulados (106 testes, integração real Postgres/`DATABASE_URL` ausente, pré-existente).

Cobertura isolada de `src/composition/` (`--coverage.include='src/composition/**'`): `aws-clients.production.ts` 75% statements/50% functions (linha 28 não coberta: `clientesProducao()` em si — construção direta de clientes SDK v3, sem branch, mesmo padrão não testado de `clientesLocais()` em `src/dev/config.ts`); `busca-indexacao.ts` 80% statements/50% functions (linhas 42-52 não cobertas: `repositorioNuncaUsado` — stub que lança `never`, documentado no próprio código como "nunca invocado", satisfaz apenas o tipo do parâmetro do construtor de `IndexarOrcamento`); ambos com 100% branch coverage. Lacunas classificadas como **código inviável de ganho adicional** (wrapper fino sem lógica própria) e **exclusão tecnicamente justificada** (stub estruturalmente inalcançável por design) — nenhuma delas representa risco de negócio não testado.

Nenhum defeito de produção encontrado nesta validação. `backend-reviewer` já havia aprovado (2ª rodada) após 1 MAJOR de VPC/networking resolvido com props opcionais `vpc`/`vpcSubnets`/`securityGroups` (hoje `undefined`, sem stack de rede/Aurora no repo — fora de escopo de #623, registrado como risco residual).

## #620 (PR #673) — `OllamaEmbeddingGateway` + `OllamaEmbeddingACL` (alternativa local ao `BedrockEmbeddingGateway`) + `selecionarAgenteEmbedding`

Mesmo padrão de #619 (extrator) aplicado ao embedding: `NEXO_AGENTE_IA` seleciona `local`/`bedrock` na composition root, mesmo contrato de porta (`AgenteEmbeddingGateway`), sem vazar detalhe de infraestrutura.

| Requisito / critério (issue #620, ADR-009) | Cenário | Teste | Resultado |
|---|---|---|---|
| Gateway invoca `POST /api/embed` do Ollama com `model`/`input` e devolve VO `Embedding` traduzido pela ACL | caso feliz, vetor de 1024 dimensões (`mxbai-embed-large`) | `gerarEmbedding chama POST /api/embed e devolve VO Embedding traduzido pela ACL` | PASS |
| Falha HTTP (`resposta.ok === false`) é erro explícito, nunca silenciosa | status 500 | `lança erro se a requisição HTTP falhar` | PASS |
| `embeddings` ausente/vazio no corpo é rejeitado, nunca confia cegamente no shape do modelo | corpo `{}` | `lança erro se "embeddings" estiver ausente ou vazio` | PASS |
| **Critério crítico**: vetor com dimensão != 1024 devolvido pelo Ollama causa falha explícita — nunca truncar/normalizar em silêncio | fetch mockado devolve vetor real de 768 posições (`nomic-embed-text`), não um stub que sempre satisfaz 1024 | `lança erro explícito se o modelo devolver vetor com dimensão diferente de 1024` — QA confirmou por leitura: o mock (`fetchFake`) devolve o corpo bruto tal como o Ollama devolveria; a rejeição vem de `OllamaEmbeddingACL.converter` comparando `bruto.embedding.length` (768, genuíno) contra `DIMENSAO_EMBEDDING_OLLAMA` (1024) — não há atalho que faça o teste passar independente do gateway real | PASS |
| `ehEmbeddingBrutoOllama` aceita/rejeita shapes estruturais (ausência, `null`, elemento não numérico) | 3 casos | `ehEmbeddingBrutoOllama` (describe dedicado) | PASS |
| `OllamaEmbeddingACL.converter` produz `Embedding` válido (1024 dim, `modeloId`, `geradoEm`) a partir de bruto correto | vetor de 1024 dimensões | `converte embedding bruto de 1024 dimensões (mxbai-embed-large) em VO Embedding válido` | PASS |
| `OllamaEmbeddingACL.converter` lança `OllamaEmbeddingACLInvalidaError` (não erro genérico) quando dimensão != 1024 | vetor de 768 dimensões, `nomic-embed-text` | `lança OllamaEmbeddingACLInvalidaError quando a dimensão do vetor não é 1024` | PASS |
| `selecionarAgenteEmbedding('local')` constrói `OllamaEmbeddingGateway`; `('bedrock')` constrói `BedrockEmbeddingGateway` | ambos os valores válidos | 2 testes dedicados | PASS |
| `selecionarAgenteEmbedding` falha rápido se a config exigida pelo valor escolhido não foi fornecida (`config.bedrock`/`config.ollama` ausente) | 2 casos | 2 testes dedicados | PASS |
| `selecionarAgenteEmbedding` falha rápido se `NEXO_AGENTE_IA` ausente ou com valor fora de `local`/`bedrock` | `undefined`, `'outro'` | `falha rápido se NEXO_AGENTE_IA estiver ausente ou com valor inválido` | PASS |
| Handler de produção (`indexador-queue.production.ts`) sempre resolve para `BedrockEmbeddingGateway`, nunca Ollama — `exigirAgenteIaBedrockEmProducao()` já garante `NEXO_AGENTE_IA=bedrock` antes da chamada | leitura de código — mesmo padrão já testado em `aws-clients.production.test.ts` (T028/#623) para o guard, `selecionarAgenteEmbedding` reexercitado pelos testes de composição acima | inspeção de `indexador-queue.production.ts` linhas 42-49 | PASS (verificação estática — nenhum teste de integração de produção real dispara Ollama em prod, por design) |
| Nenhuma regressão | suíte completa | `npx vitest run --reporter=default` (bypass do reporter Allure — limitação de ambiente nesta sessão, ver riscos residuais) | PASS — 177 arquivos passando/19 pulados (196), 1070 testes passando/106 pulados (1176), 0 falhos — idêntico ao relatado pelo dev-back-end |

Cobertura isolada dos arquivos alterados (`--coverage.include`, medida pelo QA via `coverage-final.json`/`istanbul-lib-coverage`): `ollama-embedding.gateway.ts` 100% statements/branches/functions/lines (15/15 stmts, 10/10 branches); `ollama-embedding.acl.ts` 100% statements/branches/functions/lines (10/10 stmts, 8/8 branches); `composition/busca-indexacao.ts` 86.95% statements/100% branches/57.14% functions — único gap são as linhas 78-88 (`repositorioNuncaUsado`, stub que lança `never`, estruturalmente inalcançável por design, mesmo padrão já aceito e documentado na entrada de #623 acima). `npx tsc --noEmit` limpo; `npx eslint` limpo nos 7 arquivos do diff (produção + teste).

**Limitação de ambiente registrada, não é achado sobre o PR**: nesta sessão de QA, `npx vitest run` (reporter Allure padrão do `vitest.config.ts`) falhou com `Error: Vitest failed to find the runner` ao carregar `allure-vitest/dist/setup.js` — reproduzido também em `main` antes do checkout desta branch, isolado ao ambiente sandbox (resolução de módulo pnpm/vitest neste worktree específico), não a uma alteração desta PR. Confirmado com `--reporter=default` (bypass só do reporter Allure, sem alterar `vitest.config.ts`): 100% dos resultados idênticos aos relatados pelo dev-back-end. Relatório Allure não pôde ser gerado nesta sessão — ação recomendada: DevOps/dev-back-end investigar a causa da falha do `allure-vitest` setup neste ambiente sandbox fora deste gate (não bloqueia #620, que está integralmente coberto e passando).

Nenhum defeito de produção encontrado nesta validação.

## T037 (PR #714) — `BedrockInterpretadorConsultaGateway` (Converse API, tool-use restrito ao catálogo)

Contraparte do gateway sobre a ACL de T033 (já validada acima). Mesmo padrão de `BedrockCategorizadorItemGateway` (spec 003): saída estruturada via tool-use, `enum` restringindo `categoria` ao `catalogoCategorias` configurado, e consulta do usuário isolada em bloco delimitado na mensagem de usuário (nunca na instrução de sistema).

| Requisito / critério (tasks.md T037) | Cenário | Teste | Resultado |
|---|---|---|---|
| Invoca Converse API forçando `toolChoice` para a ferramenta única, `enum` de `categoria` igual ao `catalogoCategorias` recebido | caso feliz | `interpretar invoca o Converse API forçando tool-use restrito ao catálogo e devolve CriterioBusca traduzido pela ACL` | PASS |
| Tradução do bloco `toolUse` para `CriterioBusca` delegada à `BedrockInterpretacaoConsultaACL` (gateway nunca constrói o VO diretamente) | mesmo teste acima | idem | PASS |
| Consulta do usuário isolada em bloco `<consulta_do_usuario>` na mensagem de usuário, nunca concatenada à instrução de sistema (mitigação de prompt injection) | consulta contendo tentativa de injeção ("IGNORE AS REGRAS ANTERIORES...") | `isola a consulta do usuário em bloco delimitado na mensagem de usuário (nunca instrução de sistema)` | PASS |
| Resposta sem bloco `toolUse` válido é erro explícito, nunca silenciosa | `content: [{ text: ... }]`, sem `toolUse` | `lança erro se a resposta não contiver bloco toolUse` | PASS |
| Shape do input da ferramenta fora do esperado é rejeitado pelo type guard `ehInterpretacaoConsultaBruta`, nunca confia cegamente no LLM | `{ categoria: 42 }` | `lança erro se o input da ferramenta não tiver o shape esperado` | PASS |
| Categoria fora do catálogo é rejeitada mesmo que o modelo burle o `enum` do schema (defesa em profundidade: schema + ACL) | `categoria: 'categoria-inventada-pelo-modelo'` | `nunca aceita silenciosamente categoria fora do catálogo — mesmo que o modelo burle o enum do schema` (assert de `BedrockInterpretacaoConsultaACLInvalidaError`) | PASS |

Suítes executadas: `pnpm typecheck` (limpo), `pnpm lint` (limpo), `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao` — 27 arquivos passando (182 testes), 4 arquivos pulados (23 testes, `skipIf(!DATABASE_URL)`, ambiente sandbox sem Postgres — pré-existente, não é falha desta PR).

Cobertura isolada de `bedrock-interpretador-consulta.gateway.ts` (`--coverage.include`): 100% statements (13/13), 100% functions (4/4), 100% lines (12/12), 85.71% branches (6/7) — único ramo não coberto é o fallback `?? []` de `resposta.output?.message?.content ?? []` (linha 127) quando `output`/`message`/`content` está totalmente ausente na resposta; nenhum teste exercita esse shape específico (os testes de "sem toolUse" usam `content` presente, só sem bloco `toolUse`). Mesmo padrão/mesma lacuna já existente e aceita em `BedrockCategorizadorItemGateway` (spec 003, linha equivalente) — classificado como risco residual não bloqueante, comportamento observável idêntico ao já testado (erro explícito de "saída estruturada"), não código de negócio distinto.

Nenhum wiring de composition root, caso de uso ou controller HTTP nesta task — confirmado por grep (`BedrockInterpretadorConsultaGateway` não referenciado fora de `domain/gateways`, `infrastructure/bedrock-interpretacao-consulta.acl.ts` e o próprio par produção/teste); escopo correto de T037, consumo fica para T038 (Application)/T039 (Interface)/T040 (IAM).

Nenhum defeito de produção encontrado nesta validação.
