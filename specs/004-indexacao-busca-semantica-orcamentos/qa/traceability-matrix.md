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
