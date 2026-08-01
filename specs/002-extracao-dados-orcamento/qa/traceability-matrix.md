## Leva T023 (issue #88, PR #485, commit `9d2d2e8`)

| Critério de aceite (spec.md / plan.md / tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Handler consome mensagem SQS, parseia envelope EventBridge (`detail.orcamentoId`, `detail.resultado.*`, `detail.referenciaBruta.*`) e invoca `ExtrairDadosOrcamento.executar` com os campos extraídos | Contrato/integração | Unit | envelope válido, 2 mensagens → `executar` chamado 2x com os campos corretos | `extrator-queue.handler.test.ts` (1/7) | PASS |
| Falha em 1 mensagem do lote reporta batch item failure só daquele item, sem interromper as demais (Princípio IV, exceção nunca silenciosa) | Resiliência | Unit | 2 mensagens, 1 lança erro no caso de uso → `batchItemFailures` só com o item falho, `executar` chamado 2x | `extrator-queue.handler.test.ts` (2/7) | PASS |
| Envelope inválido (shape errado) nunca lança — reporta batch item failure | Robustez/entrada não confiável | Unit | corpo `{"algo":"invalido"}` → `executar` não chamado, item reportado como falha | `extrator-queue.handler.test.ts` (3/7) | PASS |
| Envelope sem `referenciaBruta` (dependência do ADR-003/PR #483) é rejeitado como inválido | Contrato entre specs (regressão) | Unit | envelope sem `detail.referenciaBruta` → `executar` não chamado, item reportado como falha | `extrator-queue.handler.test.ts` (4/7) | PASS |
| Todo log do processamento de uma mensagem é correlacionado por `orcamentoId`+`messageId` (T016) | Observabilidade | Unit | logger real (pino) gravando em memória → todas as linhas emitidas contêm ambos os campos | `extrator-queue.handler.test.ts` (5/7) | PASS |
| Log de erro é emitido mesmo quando `orcamentoId` não pôde ser extraído (envelope inválido antes do parse chegar a `detail.orcamentoId`) | Observabilidade/robustez | Unit | envelope inválido → 1 linha de log nível error (50), com `messageId`, `orcamentoId` ausente/undefined | `extrator-queue.handler.test.ts` (6/7) | PASS |
| Entrega duplicada (SQS at-least-once) não quebra o handler — idempotência é responsabilidade do caso de uso (T022), handler só precisa não tratar retorno normal como falha | Duplicidade/idempotência | Unit | `executar` resolve normalmente (void) para "reprocessamento" → nenhum batch item failure | `extrator-queue.handler.test.ts` (7/7) | PASS |
| `agenteOrigem` do envelope é narrowed contra o union real (`'CLASSIFICADOR' \| 'HUMANO'`), não apenas `typeof === 'string'` (NIT do backend-reviewer, corrigido nesta PR) | Contrato/type-safety | Estático + Unit | `ehEventBridgeEnvelope` rejeita `agenteOrigem` fora do union; todos os testes usam `'CLASSIFICADOR'` real, exercitando o narrowing | `extrator-queue.handler.test.ts` (todos) + leitura de código | PASS |

### Risco residual documentado, fora do escopo desta PR
`ExtrairDadosOrcamento` (T022, já mergeado) cobre idempotência apenas contra
duplicidade **sequencial** (2ª mensagem chega depois que a 1ª já persistiu com
status != `PENDENTE`). Duas mensagens da mesma entrega duplicada processadas
**concorrentemente** (SQS at-least-once + Lambda com concorrência > 1) é uma
race condition teoricamente possível, não coberta por este handler nem pelo
caso de uso atual. Pertence ao código de T022 (produção já mergeada, fora do
diff desta PR) — não é defeito introduzido por T023, registrado como risco
residual, não bloqueante.

### Fora desta leva
- Não coberto por teste automatizado: branches "root não é objeto"
  (`ehEventBridgeEnvelope`, linha 43) e "`orcamentoId` ausente isoladamente"
  (linha 51) — variações do mesmo guard já exercitado por 2 cenários de
  envelope inválido; classificado como cobertura estrutural residual de baixo
  risco (mesma família de branch defensivo, não caminho de negócio distinto).

## Leva T022 (issue #87, PR #480, commits `ec1f868`+`aaff5d4`)

| Critério de aceite (spec.md / plan.md / tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Caso de uso consome dados já resolvidos do evento (`orcamentoId`, `referenciaClassificacao`, `referenciaBrutaS3`), sem resolver mensagem SQS (fora de escopo, T023) | Escopo/contrato | Unit | `ExtrairDadosOrcamentoParams` só aceita os 3 campos já resolvidos | `extrair-dados-orcamento.test.ts` (todos os 4 testes) | PASS |
| Cria o agregado na 1ª tentativa, ou recupera o existente para o mesmo `orcamentoId` (idempotência contra SQS at-least-once) | Duplicidade/idempotência (crítico) | Unit | `existente=undefined` → `ExtracaoOrcamento.criar`; `existente` com status `PENDENTE` → reaproveita a mesma instância (`toBe(existente)`) | `extrair-dados-orcamento.test.ts` (2 dos 4 testes) | PASS |
| Nunca reprocessa nem republica evento quando a extração já saiu de `PENDENTE` (entrega duplicada da fila) | Duplicidade/publicação duplicada (crítico) | Unit | `existente` com status `EXTRAIDO` → `leituraBruta`/`agenteExtrator` não são chamados, nada é salvo nem publicado | `extrair-dados-orcamento.test.ts` (1 dos 4 testes) | PASS |
| Lê o bruto (read-only) → converte via MarkItDown ACL → invoca Agente Extrator → aplica `registrarTentativaExtrator` (regra de negócio no agregado, Application nunca decide o status) | Orquestração/separação de camadas | Unit + Integração simulada | fluxo completo com fakes; decisão de evento lê `extracao.status` resultante do agregado real, não uma regra duplicada no caso de uso | `extrair-dados-orcamento.test.ts` (4 testes) + `extrair-dados-orcamento.integration.test.ts` (3 testes, pré-existente T020) | PASS |
| Persiste via `ExtracaoOrcamentoRepository.salvar` | Persistência | Unit | `repositorio.salvos` contém a instância após cada tentativa nova (idempotência não impede persistir 1x) | `extrair-dados-orcamento.test.ts` (3 dos 4 testes) | PASS |
| Publica `OrcamentoExtraido` quando `EXTRAIDO` (todos os campos obrigatórios com confiança suficiente), payload com itens/condições estruturados | Contrato de evento | Unit | item completo + condições completas → 1 evento `OrcamentoExtraido`, `itens.length === 1` | `extrair-dados-orcamento.test.ts` (1 dos 4 testes) | PASS |
| Publica `ExtracaoEscalonadaParaRevisaoHumana` quando `PENDENTE_REVISAO_HUMANA` (1+ campo obrigatório sem confiança), nenhum valor inventado | Financeiro/silencioso (crítico) | Unit | item com `precoUnitario` sem confiança → 1 evento `ExtracaoEscalonadaParaRevisaoHumana`; assert explícito `valor: null` no campo pendente após persistir | `extrair-dados-orcamento.test.ts` (1 dos 4 testes) | PASS |
| Nunca lança exceção silenciosa: `EXTRAIDO` sem `condicoesComerciais` (violação de invariante) lança `ExtracaoInconsistenteError`, não mascara/assume | Robustez/invariante de domínio | Estático + leitura de código | branch defensivo (linha 89-93 do caso de uso) — inalcançável com o agregado atual (`completo()` garante `condicoesComerciais !== undefined` antes de `EXTRAIDO`), corretamente classificado como guarda de invariante, não testável sem quebrar produção | não coberto por teste automatizado (ver `qa/coverage-baseline.md`/relatório final, categoria "código inviável de testar sem refatoração de produção") | N/A — guarda defensiva correta, dead-code intencional e documentado |

### Fora desta leva
- Handler Lambda consumidor de `extrator-queue` (T023) — resolução da mensagem SQS real (parse do body, `OrcamentoClassificado`) não existe ainda; este caso de uso já assume os 3 campos resolvidos, conforme `tasks.md`.
- Endpoint de status (T024) — não consome este caso de uso, é leitura separada.

## Leva T019 (issue #84, PR #457, commit `61c4670`)

| Critério de aceite (spec.md / plan.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Contrato de resposta de `GET /extracao/status` reflete exatamente os `paraPayload()` reais dos VOs (`ItemOrcamento`, `CondicoesComerciais`, `CampoExtraido<T>`, `Dinheiro`, `DescricaoProduto`) | Drift contrato/domínio | Contrato (Zod) | 4 status possíveis do agregado (`PENDENTE`, `EXTRAIDO`, `PENDENTE_REVISAO_HUMANA`, `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`) + `orcamentoId` inválido + `status`/`agenteOrigem` fora do enum + 404 Problem Details | `status.contract.test.ts` (9 testes) | PASS |
| Campo obrigatório sem confiança nunca aparece com valor inventado na resposta de status | Financeiro (crítico) | Contrato (Zod) | cenário `PENDENTE_REVISAO_HUMANA` com `CampoExtraido` `valor: null`/`extraido: false` | `status.contract.test.ts` (1 dos 9 testes) | PASS |

### Fora desta leva
- Endpoint real (T024, controller) não existe ainda — este contrato só é
  exercitado end-to-end quando T024 for implementada e reusar estes schemas.

---

# Matriz de Rastreabilidade — SPEC 002 (leva T001, T005-T011)

| Critério de aceite (spec.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Nenhum campo obrigatório é preenchido com valor inventado quando confiança insuficiente | Financeiro (crítico) | Unit | `CampoExtraido.naoExtraido` sempre produz `valor: null`; `extraido()` com `null` lança erro | `campo-extraido.vo.test.ts` (4 testes) | PASS |
| Campo obrigatório sem confiança escalona direto para revisão humana, nunca fica extraído parcial | Silencioso (crítico) | Unit | `registrarTentativaExtrator` com item incompleto → `PENDENTE_REVISAO_HUMANA`, nunca `EXTRAIDO` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Preservação de vínculo: `referenciaClassificacao`/`referenciaBrutaS3` nunca sobrescritos | Rastreabilidade | Unit | `atualizarReferenciaClassificacao`/`atualizarReferenciaBrutaS3` sempre lançam `ReferenciaImutavelError` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Confirmação humana só válida a partir de `PENDENTE_REVISAO_HUMANA`; histórico append-only | Governança | Unit | transição inválida lança erro; valor real → `EXTRAIDO`; indisponibilidade → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`; histórico cresce (nunca é resetado) | `extracao-orcamento.aggregate.test.ts` (3 testes) | PASS (ressalva BUG-001: getter `historico` não é cópia defensiva) |
| VOs nunca aceitam primitivo solto fora de invariante (Dinheiro, Quantidade, DescricaoProduto, PeriodoValidade, ItemOrcamento, CondicoesComerciais, ReferenciaClassificacao, ReferenciaS3, TentativaExtracao, OrcamentoId, NivelConfianca) | Integridade de domínio | Unit | construção válida + construção inválida por VO | 12 arquivos de teste de VO | PASS |
| 3 Domain Events com `schemaVersion: 1`, `source: nexo.extracao` | Contrato de evento | Unit | shape do evento | `domain-events.test.ts` (3 testes) | PASS |

## Fora desta leva (não rastreado ainda)
- "Consulta de status reflete a etapa extraído/pendência" — depende do
  endpoint de status (T024, T039), não existe ainda.
- "Conversão via MarkItDown por padrão" — depende do ACL de Infrastructure
  (T021), interface já definida (`markitdown-conversao-extracao.acl.ts`) mas
  sem implementação nesta leva.

## Leva T012 (issue #77, PR #423, commit `27409c6`)

| Critério de aceite (spec.md / plan.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Schema persiste estado atual do agregado (`itens`/`condicoesComerciais` em JSONB, ADR-004) | Persistência | Integração (Postgres real) | criação com `itens` default `[]`, `condicoesComerciais` opcional | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `status` e `referencia_classificacao_agente_origem` restritos ao enum de domínio | Integridade de dados | Integração (Postgres real) | INSERT com valor fora do enum → violação de CHECK | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `extracoes_orcamento_historico` é append-only (nunca sobrescrito) | Governança/auditoria | Integração (Postgres real) | UPDATE/DELETE em linha de histórico → `RAISE EXCEPTION` | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** — migração 0005 não aplica, coluna `id` não migrada para `bigserial`, INSERT falha antes do UPDATE/DELETE ser exercitado |
| `TentativaExtracao` é sucesso XOR insucesso, nunca ambos/nenhum | Integridade de domínio | Integração (Postgres real) | INSERT com ambos os campos e com nenhum → violação de CHECK | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** (mesma causa raiz) |
| Migração aplica sem erro em Postgres real a partir do baseline (pré-condição p/ CI e T013) | Deploy/CI | Integração (Postgres real) | `drizzle-kit migrate` a partir do estado pós-T002 | manual (`drizzle-kit migrate` + `psql` direto) | **FAIL** — `bugs/BUG-003.md`, CRÍTICA |
| `db:generate` sem diff pendente (schema TS ≡ migração commitada) | Consistência schema/migração | Estático | `npx drizzle-kit generate` | manual | PASS |

## Leva T015 (issue #80, PR #429, commit `3580e09`)

| Critério de aceite (tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `EventBridgePublisher` implementa `EventPublisher` (Domain), instância própria do BC Extração, mesmo bus `nexo-dominio-bus` | Contrato/integração | Unit (mock `EventBridgeClient`) | publica com `EventBusName`, `Source: nexo.extracao`, `DetailType` e `Detail` (JSON do envelope) corretos | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Falha reportada pelo EventBridge (`FailedEntryCount > 0`) vira erro descritivo, nunca falha silenciosa | Confiabilidade/observabilidade | Unit | `ErrorMessage` presente → mensagem inclui detailType, orcamentoId, bus e motivo | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Fallback de mensagem quando EventBridge não informa `ErrorMessage` | Confiabilidade | Unit | `Entries: [{}]` → erro com "motivo desconhecido" | `eventbridge.publisher.test.ts` (1 teste) | PASS |

Limitação: sem LocalStack neste worktree — sem teste de integração real contra
EventBridge (`PutEventsCommand` de verdade). Risco residual: comportamento real
do SDK AWS (retries, throttling) não exercitado; mitigado por ser mock fiel ao
shape de retorno documentado do SDK (`FailedEntryCount`/`Entries[].ErrorMessage`).

## Leva T018 (issue #83, PR #451, commit `a8ff244`)

| Critério de aceite (tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `MarkItDownConversaoExtracaoACL.converter` invoca Lambda dedicado do BC (ADR-002, instância própria) com conteúdo em base64 | Contrato/integração | Unit (mock `LambdaClient`) | `send` chamado com `FunctionName` e `Payload` corretos; texto sanitizado devolvido | `markitdown-conversao-extracao.acl.test.ts` (1 teste) | PASS |
| Texto do MarkItDown sempre sanitizado antes de sair do ACL — nunca repassa texto bruto ao Application/Domain | Segurança (prompt injection) | Unit | resposta do Lambda com `\x00` + payload de injeção → ACL devolve sem caractere de controle | `markitdown-conversao-extracao.acl.test.ts` (1 teste) | PASS |
| Erros do Lambda (`FunctionError`, `Payload` ausente, JSON inválido, shape inesperado) nunca propagam payload cru, sempre erro descritivo | Confiabilidade | Unit | 4 cenários de falha | `markitdown-conversao-extracao.acl.test.ts` (4 testes) | PASS |
| Sanitização remove caractere de controle (inclusive usado para ofuscar prompt injection) preservando `\t\n\r`, trunca em 50_000 chars por code point completo, nunca lança erro | Segurança/DoS | Unit | texto normal, controle+ANSI, truncamento, entrada vazia, fronteira de emoji (surrogate pair), documento adversarial 10M chars, injeção literal preservada como texto | `sanitizar-conteudo-extracao.test.ts` (7 testes) | PASS |
| Mitigação de DoS: loop nunca varre o `textoBruto` inteiro quando composto majoritariamente de caracteres de controle | Segurança/DoS | Unit (timing) | limite de 500ms (vs 200ms do par de spec-001, ajustado por já ter sido reportado como flaky sob `--coverage`) | `sanitizar-conteudo-extracao.test.ts` (1 dos 7 testes acima) | PASS — verificado: impl. atual ~102ms sob `--coverage`; regressão simulada sem o limite de varredura ~1676ms sob `--coverage` (teste continua útil, não está frouxo) |

Réplica mecânica do par já validado em spec-001 (`sanitizar-conteudo-documento.ts`/`markitdown-conversao.acl.ts`) — mesma lógica de sanitização, zero decisão de design nova; apenas o limite de tempo do teste de DoS diverge (500ms vs 200ms), justificado no commit e confirmado empiricamente nesta validação.

Risco residual (fora do escopo desta leva): BUG-001 (spec 002, severidade BAIXA, P3) segue `PRONTO PARA RETESTE`, não relacionado a T018/arquivos desta PR. O par de spec-001 do teste de DoS (200ms) reproduziu-se como flaky sob `--coverage` (full-suite run desta validação, teste passou isolado) — confirma o relato do dev-back-end/backend-reviewer; nenhum arquivo de spec-001 foi tocado por esta PR, então nenhum BUG novo foi aberto por esse achado pré-existente.

## Leva T020 (issue #85, PR #460, commit `be208e5`)

| Critério de aceite (spec.md / tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `OrcamentoClassificado` consumido → `OrcamentoExtraido` publicado com itens/condições estruturados quando todo campo obrigatório tem confiança suficiente | Orquestração/contrato de evento | Integração simulada (fakes em memória) | fluxo completo ler bruto → converter → extrair → `registrarTentativaExtrator` → publicar; assert no shape do evento (`detailType`, `schemaVersion`, `itens`, `condicoesComerciais`) | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS |
| 1+ campo obrigatório sem confiança → `ExtracaoEscalonadaParaRevisaoHumana`, nunca valor inventado | Financeiro/silencioso (crítico) | Integração simulada | item com `precoUnitario` sem confiança → status `PENDENTE_REVISAO_HUMANA`; assert explícito `valor: null`/`extraido: false` no campo pendente | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS |
| Tempo até extração disponível (p95) até 5 minutos (spec.md, meta compartilhada com spec 001) | Performance (proxy) | Integração simulada (20 execuções em memória) | mede p95 da orquestração local contra meta de 5min | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS — proxy local explícito (comentário `ponytail:` no teste); não valida a meta ponta a ponta real (rede AWS/Bedrock/cold start), isso é T042 |

Verificação de fidelidade ao contrato real (sem antecipar T021/T022):
- Assinaturas dos fakes (`LeituraBrutaGatewayFake.ler`, `MarkItDownConversaoExtracaoACLFake.converter`, `AgenteExtratorGatewayFake.extrair`, `EventPublisherFake.publicar`) conferem, campo a campo, com as interfaces reais em `src/bounded-contexts/extracao/domain/gateways/*.ts` — nenhuma assinatura inventada.
- `registrarTentativaExtrator(itens, condicoesComerciais)` chamado exatamente como definido em `extracao-orcamento.aggregate.ts`; a decisão de evento (`EXTRAIDO` → `OrcamentoExtraido`, senão `ExtracaoEscalonadaParaRevisaoHumana`) lê `extracao.status` resultante do agregado — o teste não decide a regra de negócio por conta própria, só orquestra em torno da decisão do domínio.
- `CampoExtraido.naoExtraido`/`extraido` (VO real) garante estruturalmente `extraido === false ⟺ valor === null` — o teste 2 não afirma isso por mock, afirma sobre o VO real do domínio.

### Fora desta leva
- `ExtrairDadosOrcamento` (Application, T022/#87) e o handler Lambda de `extrator-queue` (Interface, T023) não existem ainda — este teste fixa a especificação executável que a implementação real deverá seguir; não substitui o teste de integração real (LocalStack) nem a medição de p95 ponta a ponta (T042, após T021/T023).

## Leva T029 (issue #94, PR #492, commit `f48e0c0`)

| Critério de aceite (spec.md US2 / tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Campo obrigatório ambíguo/ilegível conhecido → Extrator nunca preenche com valor inventado/estimado | Financeiro/silencioso (crítico) | Integração (handler SQS real → caso de uso real → agregado real) | `AgenteExtratorGatewayFake` devolve `CampoExtraido.naoExtraido` para `precoUnitario` (confiança 15) | `extrator-queue.handler.integration.test.ts` (1 teste) | PASS — assert `extraido: false` / `valor: null` no VO real |
| `ExtracaoEscalonadaParaRevisaoHumana` publicado diretamente pelo Extrator, sem passo de revisor de IA (ADR-003, agente removido) | Orquestração/contrato de evento | Integração | 1 mensagem SQS → 1 evento publicado, `detailType` e `motivo` conferidos | `extrator-queue.handler.integration.test.ts` (mesmo teste) | PASS |
| Status reflete a pendência (`PENDENTE_REVISAO_HUMANA`) no estado persistido do agregado | Consistência de estado | Integração | `RepositorioFake.salvar` capturado, `extracao.status` verificado no agregado real | `extrator-queue.handler.integration.test.ts` (mesmo teste) | PASS |

Diferencial desta leva frente a T020/T027 (não redundante): único teste que percorre a pilha via `criarExtratorQueueHandler` real (parse de mensagem SQS/EventBridge, `batchItemFailures`) — T020 reimplementa a orquestração inline sem o handler, T027 é unit test do agregado isolado. Fakes apenas nas bordas de infra (S3, MarkItDown, Bedrock, EventBridge), mesmo padrão já aprovado em T020.

### Fora desta leva
- Consulta de status via HTTP (`GET /v1/orcamentos/{id}/extracao/status`, T024) não implementada ainda — "status reflete a pendência" verificado no estado persistido do agregado (`ExtracaoOrcamentoRepository.salvar`), fonte de dados de onde o futuro endpoint lerá.

## Leva T038 (issue #103, PR #521, commit `76ccbed`)

| Critério de aceite (plan.md §§ "Application — Casos de uso"/"Domain — Agregados") | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `orcamentoId` inexistente → `ExtracaoNaoEncontradaError` | Consistência | Unit | repositório fake devolve `undefined` | teste 1 | PASS |
| Só aceita a partir de `PENDENTE_REVISAO_HUMANA`; qualquer outro status → `TransicaoInvalidaExtracaoError` do agregado | Consistência/contrato de transição | Unit | status `PENDENTE` e status já terminal (`EXTRAIDO_COM_PENDENCIA_CONFIRMADA`) | testes 6-7 | PASS |
| Valor real completa campo pendente (`itens[].precoUnitario`, `.descricao`, `.quantidade`, `condicoesComerciais.*`) → `EXTRAIDO`, publica `OrcamentoExtraido` | Financeiro/silencioso (crítico) | Unit | 4 cenários felizes (precoUnitario, descricao+quantidade, condicoesPagamento+condicoesEntrega, prazoValidade ISO válida) | teste 2 (dev-back-end) + 3 testes adicionados pelo QA | PASS |
| `indisponivel: true` → mantém `extraido: false`/`valor: null`, `agenteOrigem: 'HUMANO'`; 1+ pendência → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`, publica `OrcamentoExtraidoComPendenciaConfirmada` | Financeiro/silencioso (crítico) | Unit | assert direto no VO real (`CampoExtraido.extraido`/`.valor`) | teste 3 | PASS |
| Nunca reabre campo já `extraido: true` | Integridade de dado já validado | Unit | tentativa de reconfirmar `itens[0].descricao` já extraído → `CaminhoConfirmacaoInvalidoError` | teste 4 | PASS |
| Caminho (`itens[N].campo`/`condicoesComerciais.campo`) fora do intervalo ou em formato desconhecido → `CaminhoConfirmacaoInvalidoError` | Robustez de contrato | Unit | índice fora do array; string arbitrária | testes 5, 6 (numeração do arquivo) | PASS |
| Shape/tipo de `valor` (borda Zod `unknown`) inválido nunca vaza `TypeError` — sempre `CaminhoConfirmacaoInvalidoError` | Robustez de borda | Unit | objeto com campo obrigatório ausente (moeda), número solto em vez de objeto, string não-ISO para `prazoValidade` | testes 9-11 | PASS |
| Branch defensivo "nunca deveria ocorrer": `PENDENTE_REVISAO_HUMANA` sem `condicoesComerciais` → `ExtracaoSemCondicoesComerciaisError` | Invariante do agregado | Unit | `ExtracaoOrcamento.reconstituir(...)` com `condicoesComerciais: undefined` | teste adicionado pelo QA | PASS |
| `referenciaBrutaS3`/`referenciaClassificacao` nunca tocados pelo caso de uso | Imutabilidade (Princípio III) | Inspeção de código (nenhuma chamada aos métodos `never` do agregado no arquivo de produção) | — | leitura de código, não teste automatizado | PASS |

Cobertura do critério "Nunca decide o evento fora da regra do agregado":
a implementação lê `extracao.status` **após** `registrarConfirmacaoHumana` para
decidir entre `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` —
não há lógica de decisão duplicada na Application, só delegação ao Domain
(mesmo padrão já validado em T020/T029).

### Fora desta leva
- Mapeamento HTTP (409 para `TransicaoInvalidaExtracaoError`, 400 para
  `CaminhoConfirmacaoInvalidoError`, 404 para `ExtracaoNaoEncontradaError`) —
  T039, endpoint REST ainda não implementado.
- `IAM ConfirmarRevisaoHumanaExtracaoLambdaRole` — T040.
