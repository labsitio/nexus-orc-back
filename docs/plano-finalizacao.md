# Plano de finalização — Nexo

Insumo: `docs/estado-funcionalidades.md` (gerente-produto, 2026-08-03). Este
documento não refaz o levantamento — responde onde estamos (síntese), o que
falta (issue a issue, confirmado no GitHub), e em que ordem fechar.

Verificação de issues: `gh issue list --state all --limit 900` exportado
para JSON (432 issues) e processado por script — não colado issue a issue no
contexto. Detalhe pontual (corpo, labels `blocked`) via `gh issue view N`
quando o JSON não bastou.

## Nota de método desta revisão

Esta é a quarta revisão. Gatilho: board passou de 425 para 432 issues desde a
revisão anterior, 13 issues fecharam (incluindo toda a categorização de item
de 003 e duas issues centrais de 005), e uma trilha inteiramente nova
apareceu — ADR-010, verificação de papel via grupos Cognito — que reabre a
frase "não há gate `blocked` no board" da 3ª revisão. Nesta revisão eu:

- **Reverifiquei no código**, arquivo e linha:
  - `BedrockCategorizadorItemGateway` (`src/bounded-contexts/validacao/infrastructure/bedrock-categorizador-item.gateway.ts`)
    e `BedrockCategorizacaoACL` existem; `ValidarOrcamento.categorizarItensSemCategoria`
    (`src/bounded-contexts/validacao/application/use-cases/validar-orcamento.ts:147-185`)
    chama o categorizador antes de `validarPrecoDentroDaFaixa` (linha 100), só
    para itens sem `categoria` e com catálogo de faixas configurado — #149,
    #151, #152, #153 confirmadas no próprio código, não só no board.
  - `application/use-cases/` de 005 agora tem 6 arquivos (era 4): os dois
    novos são `criar-evento-desfecho.ts` e
    `registrar-decisao-humana-workflow.ts`
    (`src/bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.ts`)
    — confirma #248 fechada por código, não só por label. A classe já publica
    `IntegracaoExternaSolicitada` quando `requerIntegracaoExterna === true`
    (linhas 64-68), o que cobre parte do que #255/#249 pedem para
    `ConsolidarEDecidirWorkflow`/`RevisarDecisaoWorkflowComIA` — mas **não
    existe controller** para chamar este caso de uso: busquei
    `decisao-humana.controller.ts` em `orquestracao/interface/http/` e não
    existe (só existe o de `validacao`, endpoint diferente,
    `/v1/orcamentos/{id}/validacao/decisao-humana`, issue #146/T036, sem
    relação com #250). #250 continua sem código.
  - Os 4 gateways Ollama (`ollama-classificador.gateway.ts`,
    `ollama-extrator.gateway.ts`, `ollama-embedding.gateway.ts`,
    `ollama-orquestrador.gateway.ts`) existem **e estão amarrados** nos 4
    `src/composition/*.ts` correspondentes por seleção via `NEXO_AGENTE_IA`
    (`local` → Ollama, `bedrock` → gateway real) — não é código solto sem
    consumidor, é caminho de execução real (`ingestao-identificacao.ts:94`,
    `extracao.ts:66`, `busca-indexacao.ts:63`, `orquestracao.ts:146`).
  - ADR-010 no código: comparei o working tree local (atrás de `origin/main`
    nesta branch) com `origin/main` via `git show`/`git ls-tree`, porque o
    board mudou **durante esta sessão** (issue #685 fechou às 12:38 enquanto eu
    investigava). Em `origin/main`, commit `53d2fb6` (2026-08-07T09:38:34-03:00,
    PR #693, fecha #685): `src/interface/shared/tenant-context.middleware.ts`
    agora declara `papeis?: readonly string[]` no augment de `FastifyRequest` e
    popula `request.papeis` a partir de `payload['cognito:groups']` (função
    `extrairPapeis`, lista vazia se claim ausente, nunca erro) — lendo o mesmo
    payload já verificado, sem segunda chamada a `verify()`. **Não existe**
    ainda `role-guard.middleware.ts` em nenhum lugar do `origin/main`
    (`git ls-tree -r origin/main | grep role-guard` vazio) — T2 (#686) não
    começou. `RotaOpts.preHandler` em `orquestracao/interface/http/route-opts.ts`
    continua tipado só como `preHandlerHookHandler` único, sem array — T3
    (#687) não começou.
  - `src/dev/local.ts` (lido inteiro de novo): ainda só 001→002, dois
    pollers (`classificador-queue`, `extrator-queue`), comentário do próprio
    arquivo confirma. Sem mudança desde a 3ª revisão.
  - `docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`
    existe (`ls docs/architecture-diagrams/`), citado no corpo de #685 como
    PR #683.
  - Dimensão pgvector: `indice-orcamento.schema.ts` moveu de
    `infrastructure/` para `infrastructure/persistence/schema/` em algum
    commit anterior (caminho novo confirmado nesta rodada); linha 54 continua
    `vector('embedding', { dimensions: 1024 })`.
- **Reconsultei via `gh`** (JSON completo, 432 issues, mais `gh issue view` e
  `gh pr view` pontual para #685-#691, #469, #477, #693, #683): todas as
  issues citadas na 3ª revisão, mais a faixa nova #625-#693. O board mudou
  *durante* a investigação (ver #685 acima) — datei a verificação onde isso
  importa.
- **Herdei sem reverificar linha a linha**: 008/009 alheio às issues que não
  mudaram de estado nesta rodada, ADR-004/008/009 (só confirmei que os
  arquivos continuam existindo), avaliação de risco de #588/#590 (MarkItDown
  leve vs. completo), `docs/plano-infra-ambientes.md` §5.
- **Risco de processo** (herdado): revisões anteriores já foram perdidas por
  edição sem commit. Esta fica no working tree por instrução explícita da
  tarefa.

## 1. Onde estamos

**Duas mudanças de fundo desde a 3ª revisão.**

**Primeira: 003 (categorização de item) e duas peças centrais de 005
fecharam por código, não só por label.** #149/#151/#152/#153 fecham a
categorização via agente: `ValidarOrcamento` agora chama
`AgenteCategorizadorItemGateway` (Bedrock, tool-use restrito ao catálogo de
`FaixaPreco` configurado) para todo item sem `categoria` antes de aplicar a
regra de preço — confirmado em
`validar-orcamento.ts:147-185`. A frase "a regra de preço ainda não é
confiável" da 3ª revisão **não é mais verdadeira** no caminho onde há faixas
configuradas. Seguem abertas #150 (teste de integração determinístico
ponta-a-ponta), #154 (controllers de gestão de `FaixaPreco`/categoria) e #155
(IAM `bedrock:InvokeModel` restrito ao ARN do modelo de categorização) — o
que falta agora é teste, superfície administrativa e IAM, não mais a regra
de negócio central.

Em 005, #246 (caminho de baixa confiança do `ConsolidarEDecidirWorkflow`)
e #248 (`RegistrarDecisaoHumanaWorkflow`) fecharam por código — o caso de uso
existe, valida transição (`PENDENTE_REVISAO_HUMANA` obrigatório, via
`DecisaoWorkflowNaoEncontradaError`/transição do agregado), publica o evento
de desfecho e, quando a decisão exige, `IntegracaoExternaSolicitada` na
mesma chamada. **O que ainda falta para uma decisão de workflow completa não
é regra de negócio — é o controller HTTP** (#250, T044,
`POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana`): não existe em
`orquestracao/interface/http/` (só existe o controller homônimo de
`validacao`, endpoint diferente, sem relação). #250 está `in-progress`,
assinado por `allanrobert10`.

**Segunda, e mais importante para a ordem de execução: reapareceu um gate
formal `blocked` no board — ADR-010, verificação de papel via grupos
Cognito.** PR #683 (`e602046`) gerou 7 tasks (#685-#691). Nesta sessão, T1
(#685, `TenantContextMiddleware` popula `request.papeis` a partir de
`cognito:groups`) **fechou durante a investigação** (PR #693, `53d2fb6`,
09:38 local) — confirmado em código no `origin/main`, não só no board. T2
(#686, `role-guard.middleware.ts`) e T3 (#687, `RotaOpts.preHandler` aceita
array) seguem `ready`, sem código ainda. **T4 (#688), T5 (#689) e T6 (#690)
seguem `blocked`** — e T4 é textualmente "destrava #250": o controller de
decisão humana de 005, que a Fase 2 desta revisão trata como cabeça do
caminho crítico, **não pode fechar sem o guard `comprador-responsavel`**
que #688 introduz. A frase da 3ª revisão — "não há hoje nenhuma issue `OPEN` com
label `blocked`" — **é falsa agora**. Existe gate formal de novo, e ele passa
por dentro da própria cabeça do caminho crítico desta revisão, não ao lado
dela.

Ollama (#617, #619, #620, #621) fechou por completo, e os 4 gateways não são
código solto: estão amarrados nos 4 `composition/*.ts` via `NEXO_AGENTE_IA`
(`local`/`bedrock`), path de execução real hoje, não só arquivo isolado.

O restante do panorama de deploy é inalterado: `infra/bin/app.ts` continua
amarrando 004 (#623) e 005 (#624) a `NodejsFunction` reais; 001/002/003
continuam sem `*-function-stack.ts` (#613/#614/#615/#616, `OPEN`).
`src/dev/local.ts` continua só 001→002. 007 Acompanhamento continua no
estágio inicial descrito anteriormente (1 arquivo, schema Zod, sem
domínio/aplicação/persistência).

Duas issues de operação AWS nunca citadas nas revisões anteriores: **#469**
(executar runbook Cognito `custom:tenant_id` em dev/staging/prod — sem ele
não há claim para o `TenantContextMiddleware` extrair fora de LocalStack) e
**#477** (confirmar Managed Workflow do AWS Transfer Family antes do canal
SFTP resolver `tenantId` em produção). Ambas exigem acesso operacional AWS
que o time não tem hoje — mesma classe de bloqueio da Fase 5, tratadas lá
(ver seções 3 e 4).

008/009: sem mudança de estado desde a 3ª revisão (62/71 seguem `OPEN`).

## 2. Fechamento de casos de uso

Convenção da tabela: "issues que o fecham" lista todas as issues abertas
necessárias (não apenas a task central). "O que ainda não tem issue" só é
preenchido quando confirmei ausência real no board.

### 001 · Ingestão e Classificação

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Upload multi-canal (portal/API/mobile) sem 400 | FECHADO | #592 (BUG-001), fechada por #618/PR #625 | — |
| Retrofit `tenantId`/`schemaVersion: 2` no agregado/eventos | FECHADO | #277, #278, #279, #280, #281 — confirmado em `domain-event.ts:21` (`tenantId: string`), `:7` (`schemaVersion: 2`) | — |
| Handler Lambda de produção para os casos de uso já implementados de 001 | NÃO INICIADO | #613 (handlers), #576, #577, #579, #580 (IAM `events:PutEvents`), #53 (IAM leitura consulta-status, fechada) | — |
| Conversão real de documento (MarkItDown, não stub) | PARCIAL | #588 (T066, Lambda Python), #589 (T067, LocalStack Lambda) | — |
| Teste adversarial `tenantId` forjado no body | ABERTO | #635 | — |
| Runbook Cognito `custom:tenant_id` em dev/staging/prod | ABERTO — exige acesso operacional AWS | #469 | — |
| Documentação/perf/segurança de fechamento da spec | ABERTO | #54, #61, #62, #63, #64, #65 | — |

### 002 · Extração de Dados

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId`/`schemaVersion: 2` em eventos de 002 | FECHADO | #582, #631, #648 — confirmado em `extracao/domain/events/domain-event.ts:16` (`tenantId: string`) | — |
| Conversão real de documento (MarkItDown, instância própria ADR-002) | PARCIAL | #590 (T046) | — |
| Handler Lambda de produção do Extrator | NÃO INICIADO | #614 (handler), #578 (IAM `events:PutEvents`) | — |
| Perf/segurança de fechamento | ABERTO | #107, #109, #110 | — |

### 003 · Validação de Consistência

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| `DrizzleFaixaPrecoRepository` (leitura + escrita) | FECHADO | #385 (T023, leitura), #153 (T043, `upsert`) | — |
| Retrofit `tenantId`/`schemaVersion: 2` em eventos de 003 | FECHADO | #583, #649 — confirmado em `validacao/domain/events/domain-event.ts:31` (`tenantId: string`) | — |
| Categorização de item via agente (regra de preço não hardcoded) | **FECHADO** | #149 (unit test ACL), #151 (`BedrockCategorizadorItemGateway`+ACL), #152 (`ValidarOrcamento` invoca antes da regra de preço) — confirmado em `validar-orcamento.ts:147-185` | — |
| Teste de integração determinístico ponta-a-ponta da categorização | ABERTO | #150 | — |
| Controllers administrativos de `FaixaPreco`/categoria | ABERTO — bloqueado por ADR-010 T5 | #154, gated por #689 (`blocked`) | — |
| Handler Lambda de produção do Validador | NÃO INICIADO | #615 (handler), #616 (IAM `events:PutEvents`) | — |
| IAM `bedrock:InvokeModel` restrito ao modelo de categorização | ABERTO | #155 | — |
| Perf/segurança/docs de fechamento | ABERTO | #156, #157, #158, #159, #160 | — |

### 004 · Indexação e Busca Semântica

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Handler Lambda SQS `indexador-queue` | FECHADO | #190 (T030) | — |
| Handler Lambda de produção (deploy) | FECHADO | #623 — `IndexadorFunctionStack` em `infra/bin/app.ts` | — |
| Endpoint HTTP de busca em linguagem natural | FECHADO | #198 (T038), #199 (T039) | — |
| Gateway de IA local (Ollama) para embedding | **FECHADO** | #620 — `OllamaEmbeddingGateway` amarrado em `composition/busca-indexacao.ts:63` via `NEXO_AGENTE_IA=local`; dimensão 1024 confirmada de novo em `indice-orcamento.schema.ts:54` (caminho do arquivo mudou para `infrastructure/persistence/schema/`) | — |
| IAM `IndexarOrcamentoLambdaRole` / `BuscarOrcamentosLambdaRole` | ABERTO | #192, #200 | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #186, #187, #195, #196, #197, #201, #202, #203, #204, #205, #206 | — |

### 005 · Orquestração de Workflow e Integrações

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId`/`schemaVersion: 2` em eventos de 005 | FECHADO | #586, #650, #656 — confirmado em `orquestracao/domain/events/domain-event.ts:19` (`tenantId: string`) | — |
| Registro de contexto (classificação/extração) para a decisão | FECHADO | #234 (T028) | — |
| Handlers Lambda consumidores (3 filas) + deploy | FECHADO | #235 (T029), #624 (deploy) | — |
| Rastreabilidade da decisão (status) | PARCIAL — endpoint fechado, contract test aberto | #236 (T030, endpoint, FECHADO), #237 (T031, auth Cognito, FECHADO); #229 (T023, contract test) ainda `OPEN` | — |
| `ConsolidarEDecidirWorkflow` — caminho de baixa confiança | **FECHADO** | #246 (T040) — confirmado que o caso de uso publica `DecisaoWorkflowEscalonadaParaComprador` no caminho de baixa confiança | — |
| Escalonamento para comprador + decisão humana (regra de negócio) | **FECHADO** | #248 (T042, `RegistrarDecisaoHumanaWorkflow` confirmado em `application/use-cases/registrar-decisao-humana-workflow.ts`, já publica `IntegracaoExternaSolicitada` quando aplicável) | — |
| Escalonamento para comprador + decisão humana (controller HTTP) | ABERTO, `in-progress`, **gated por ADR-010 T4** | #250 (T044) — confirmado ausente em `orquestracao/interface/http/`; bloqueado por #688 (`blocked`) até o guard `comprador-responsavel` existir | — |
| Auth Cognito no endpoint de status | FECHADO | #237 (T031) | — |
| Solicitação de reenvio ao fornecedor | ABERTO | #252 (T046), #254 (T048), #256 (T050) | — |
| Integração externa disparada pela decisão | **FECHADO** | #255 (T049 — confirmado que `ConsolidarEDecidirWorkflow` e `RegistrarDecisaoHumanaWorkflow`, os 2 casos de uso vigentes, já publicam `IntegracaoExternaSolicitada`; `RevisarDecisaoWorkflowComIA` citado como pendente não existe mais, removido junto do Agente Revisor de Workflow), #253 (T047, teste, já cobria ambos) | — |
| Verificação de papel — guard e teste adversarial (trilha nova) | **T1 FECHADO nesta sessão; T2/T3 abertas; T4/T5/T6 `blocked`** | #685 (T1, FECHADO — `request.papeis` em `tenant-context.middleware.ts`), #686 (T2, guard), #687 (T3, `RotaOpts` array), #688/#689/#690 (T4/T5/T6, `blocked`), #691 (T7, doc operacional, FECHADO) | — |
| Decisão de modelo Bedrock do Agente Orquestrador | EM ABERTO, sem ADR | #664 — pré-requisito para qualquer caso de uso de 005 que chame o agente orquestrador via Bedrock real | — |
| IAM roles do BC | ABERTO | #238 (T032), #251 (T045) | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #230, #239, #241, #242, #243, #244, #257, #258, #259, #260, #261, #262, #263 | — |

### 007 · Isolamento Multi-tenant (retrofit 001-005), Acompanhamento e verificação de papel (ADR-010)

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId`/`schemaVersion: 2` — 001 a 005 | FECHADO | #277-#281 (001), #582/#631/#648 (002), #583/#649 (003), #584/#585 (004, gate), #586/#650 (005), #632 (contract cutover), #656 (isolamento estrutural 002/003/005), #297/#587 (confirmação pré-cutover) | — |
| Teste adversarial `tenantId` forjado (001) | ABERTO | #635 | — |
| Runbooks operacionais AWS (Cognito, Transfer Family) — pré-requisitos de produção do retrofit | ABERTO — exigem acesso operacional AWS | #469 (Cognito), #477 (Transfer Family) | — |
| **Verificação de papel via grupos Cognito (ADR-010) — trilha nova** | T1 FECHADO, T7 FECHADO; T2/T3 ABERTAS; T4/T5/T6 `blocked` | #685 (FECHADO), #686, #687 (ABERTAS), #688, #689, #690 (`blocked`), #691 (FECHADO) | — |
| Exportação de auditoria multi-tenant (`Acompanhamento`) | NÃO INICIADO (só contrato) | #283-#296, #298-#301 (T020-T038, exceto #282/#297 já fechadas) | — |

### 008 · Hardening/LGPD e 009 · Custo — 9 issues fechadas (domínio isolado), sem consumidor no fluxo ainda

Sem mudança de estado desde a 3ª revisão: 62 das 71 issues seguem `OPEN`. As
9 fechadas (#319, #320, #323 em 008 — agregado `SolicitacaoEsquecimento` e
seus testes; #350, #352, #353, #354, #355, #360 em 009 — dependência
DynamoDB e VOs de cache de identificação) são domínio isolado, sem wiring
real com 001-005.

## 3. Prioridade por issue

Critério (explícito, ordem de peso, **inalterado nesta revisão** — só a
distribuição de issues mudou): **(a)** desbloqueia o fluxo ponta a ponta ou
corrige defeito que impede uso → P0. **(b)** completa um caso de uso que já
está em andamento e é pré-requisito técnico direto de outro (gate real, não
conveniência) → P1. **(c)** necessário para deploy de produção mas não
bloqueia progresso local/de código (IAM, handlers, validação com AWS real) →
P2. **(d)** otimização (009), compliance sem consumidor ainda (008),
documentação/OpenAPI, ou spec que não é caminho crítico → P3.

**Correção sobre a nota da 3ª revisão:** a afirmação "não há hoje nenhuma
issue `OPEN` com label `blocked`" **não vale mais**. #688, #689 e #690 são
`blocked` agora, por dependência técnica real (ADR-010 T2/T3 precisam existir
primeiro). Isso reintroduz o critério **(b)** na prioridade de 005: #250 não
é mais P1 só por (a) — é P1 também por (b), porque #688 (`blocked`) o
referencia textualmente ("destrava #250"), e #688 por sua vez depende de
O gate explícito é #685 (fechado) → #686/#687 (ready) → #688
(blocked) → #250 (in-progress, mas travado).**

| Prioridade | Issues | Motivo |
|---|---|---|
| **P0** | Nenhuma. | Não há defeito conhecido nem gate formal impedindo uso hoje fora do que já está em andamento. |
| **P1** | #686, #687 (ADR-010 T2/T3 — guard + `RotaOpts` array) | Critério (b), gate real: sem eles, #688/#689/#690 continuam `blocked` e #250 não pode fechar por completo. Cabeça do caminho crítico desta revisão — ver seção 4. |
| **P1** | #688 (guard comprador-responsável), #250 (controller decisão humana) | Critério (a)+(b): #688 é o gate que "destrava #250" textualmente no board; juntos fecham a única lacuna de regra de negócio que resta para uma decisão de workflow completa e autorizada chegar a produção. |
| **P1** | #689 (guard compliance-admin), #154 (controllers `FaixaPreco`) | Critério (b): mesmo gate ADR-010, ramo de 003 — #154 não pode fechar por completo sem #689. |
| **P1** | #690 (teste adversarial de papel forjado) | Critério (a): única prova, sob ataque, de que `request.papeis` (já em produção via #685/PR #693) não pode ser forjado por body/header/query nas 2 rotas gated. |
| **P1** | #252, #253, #254, #256 (005, reenvio ao fornecedor restante — #255 fechada), #229, #238, #251, #664 | Critério (a): sem reenvio ao fornecedor, o fluxo ponta a ponta continua incompleto mesmo com #246/#248/#255 fechadas. #664 é pré-requisito de qualquer caso de uso que chame o Agente Orquestrador via Bedrock real. |
| **P1** | #150, #154 (já listada acima), #155 (003, resíduo da categorização) | Critério (a)/(b): a regra central já fechou (#149/#151/#152), mas sem #150 (teste determinístico ponta-a-ponta) e #155 (IAM restrito ao modelo) a categorização não tem prova automatizada nem least privilege. |
| **P1** | #635 (007 teste adversarial `tenantId` forjado) | Único teste que valida, sob ataque, o retrofit de segurança de tenant. |
| **P2** | #613, #614, #615, #616 (handlers Lambda de produção 001-003) | Critério (c): 004/005 já têm handler de produção; 001-003 seguem sem `*-function-stack.ts`, mas isso não bloqueia progresso de código local. |
| **P2** | #576, #577, #578, #579, #580, #65 (IAM `events:PutEvents` + auditoria least privilege) | Necessário para deploy real; não bloqueia progresso de código local. |
| **P2** | #588, #589, #590 (MarkItDown Lambda real) | Sem AWS pode avançar via LocalStack Lambda (#589); conversão real de produção (#588/#590) é pré-deploy. |
| **P2** | #469, #477 (runbooks operacionais AWS — Cognito, Transfer Family) | Critério (c): pré-requisito de produção do retrofit 007, mas exige acesso AWS que o time não tem hoje — mesma classe de bloqueio da Fase 5. |
| **P2** | #63, #107, #157, #202, #258 (medição p95 real) | Requer ambiente de staging/AWS. |
| **P2** | #64, #109, #158, #203, #259 (security review c/ Bedrock real) | Idem — precisa de chamada real a Bedrock. |
| **P2** | #641 (convenção de métrica de observabilidade — 8 issues dependem) | Pré-requisito técnico real (critério b) de closure de testes/observabilidade abaixo, mas nenhum dos dependentes bloqueia o pipeline em si. |
| **P2** | #54, #61, #62, #110, #156, #159, #160, #192, #200, #201, #204, #205, #206, #186, #187, #195, #196, #197, #230, #239, #241-#244, #257, #260-#263 | Testes/observabilidade/docs de fechamento — importantes, mas não bloqueiam avanço de outra fase. |
| **P3** | #283-#296, #298-#301 (007 Acompanhamento/exportação de auditoria) | Sem consumidor até 008 precisar dela; único trecho de 007 ainda em estágio inicial. |
| **P3** | 62 issues abertas de 008/009 (#314-#384, exceto as 9 já fechadas) | LGPD/custo sem porta de entrada de aplicação ainda; nenhum caso de uso downstream depende disso hoje. |

## 4. Ordem de execução

**Caminho crítico — cabeça reavaliada nesta revisão, de novo.** Na 3ª
revisão a cabeça era 005+003 em paralelo, sem gate formal ("critério (a),
não (b)"). **Isso mudou**: ADR-010 introduziu um gate formal
(`blocked`) que passa por dentro da própria cabeça anterior — #688 é
textualmente "destrava #250", e #250 era a peça que faltava para 005 fechar
sua lacuna central de regra de negócio. Ignorar o gate e tratar #250 como
prioridade isolada seria repetir o erro que a 3ª revisão corrigiu na direção
contrária: lá, um gate fechou e a revisão anterior não tinha percebido;
aqui, um gate abriu e merece o mesmo peso.

**Nova cabeça: ADR-010 T2/T3 (#686, #687) — os dois itens que hoje bloqueiam
tudo o resto da trilha.** T1 (#685) fechou nesta sessão (`request.papeis` já
em produção via PR #693); T2 (`role-guard.middleware.ts`, 403 Problem
Details) e T3 (`RotaOpts.preHandler` aceita array em orquestração e
validação) são os dois blocos que faltam para os 3 guards `blocked` (#688,
(#689, #690) poderem sair do estado. Depois deles, em paralelo: #688→#250
(005, decisão humana) e #689→#154 (003, gestão de faixa de preço).

Caminho completo: ADR-010 T2/T3 (#686/#687) → gate ADR-010 T4/T5/T6
(#688/#689/#690) em paralelo com o restante de 005 (#252-256, #229, #238,
e #251, #664) e o restante de 003 (#150, #155) → wiring local 003→004→005
(extensão de `src/dev/local.ts`, hoje só 001→002) → handlers de produção
restantes de 001-003 (P2) → validação com AWS real, incluindo #469/#477 (P2)
→ 007 Acompanhamento/008/009 (P3, paralelizável a qualquer momento).

### Fase 0 — Desbloqueio imediato — CONCLUÍDA
Objetivo verificável: upload funciona nos 4 canais; composition root vira
código commitado. #592 (BUG-001) fechada, #618 mergeada (PR #625). Nada
pendente aqui.

### Fase 1 — Retrofit 007 (001-005) — CONCLUÍDA
Objetivo verificável: todo evento publicado por 001-005 carrega `tenantId`
obrigatório e `schemaVersion: 2`; os 5 repositórios são tenant-scoped.
**Status: feito**, confirmado em código. Resíduos: #635 (teste adversarial
`tenantId` forjado, `OPEN`) e #469/#477 (runbooks operacionais AWS,
`OPEN`, exigem acesso que o time não tem hoje — movidos para Fase 6).

### Fase 2 — ADR-010 (verificação de papel) — NOVA CABEÇA
Objetivo verificável: `role-guard.middleware.ts` existe e retorna 403
Problem Details para papel insuficiente; `RotaOpts.preHandler` aceita array
em orquestração e validação; os 2 endpoints gated (#250, #154) têm guard
funcionando; teste adversarial de papel forjado passa.
- #686 (T2, guard), #687 (T3, `RotaOpts` array) — sem dependência entre eles,
  correm em paralelo.
- Depois: #688 (guard comprador-responsável, destrava #250), #689 (guard
  compliance-admin, destrava #154), #690 (teste adversarial) — os 3 dependem
  de #686/#687 terminarem primeiro.
- Depende de: nada — #685/T1 já fechou (PR #693). Esta fase pode começar
  imediatamente.

### Fase 3 — Completar 005 e 003 (paralelo)
Objetivo verificável: uma decisão de workflow completa (aprovar/escalonar/
reenviar/integração externa), autorizada por papel, é produzível ponta a
ponta via HTTP; item sem `categoria` é classificado pelo agente antes da
regra de preço, com superfície administrativa de `FaixaPreco` também
autorizada por papel.
- 005: #250 (controller, gated por #688), #252, #253, #254, #255, #256,
  #229, #238, #251, #664 (mais os testes #230, #239, #241-#244, #257,
  #260-#263).
- 003: #150 (teste determinístico), #154 (controller, gated por #689), #155
  (IAM `bedrock:InvokeModel`), #156 (perf).
- Depende de: Fase 2 para #250 e #154 especificamente (gate #688/#689); o
  restante de cada trilha não depende do gate e pode começar em paralelo à
  Fase 2.

### Fase 4 — Encadear o pipeline local completo
Objetivo verificável: `src/dev/local.ts` processa 001→002→003→004→005 de
ponta a ponta em LocalStack, sem intervenção manual entre BCs.
- Estender `src/dev/local.ts` para encadear 003/004/005 (sem issue própria
  hoje — registrar como parte do trabalho de wiring).
- #192, #200 (IAM de 004, se ainda não cobertas por deploy).
- Depende de: Fase 3 completa (casos de uso de 003/005 precisam existir e
  estar desbloqueados).

### Fase 5 — Handlers de produção restantes (001-003) + IAM + Acompanhamento
Objetivo verificável: existe `lambda.Function`/`export const handler` real
para os casos de uso de 001, 002 e 003 (004/005 já têm), com IAM least
privilege incluindo `events:PutEvents`. Trilha de Acompanhamento corre em
paralelo, sem consumidor obrigatório.
- #613 (001), #614 (002), #615+#616 (003), #576, #577, #578, #579, #580, #65,
  #53 (já fechada).
- MarkItDown real: #588, #590 (código), #589 (LocalStack Lambda, sem AWS).
- #641 (convenção de métrica) antes dos 8 dependentes de closure/observabilidade.
- 007 Acompanhamento: #283-#296, #298-#301 — paralelizável a qualquer momento.
- Depende de: nada tecnicamente formal — pode começar em paralelo à Fase
  2/3/4; ordenada depois por prioridade (P2), não por bloqueio.

### Fase 6 — Validação com AWS real (EXIGE credencial AWS/Bedrock)
Objetivo verificável: deploy em staging funciona (004/005 já sintetizam via
CDK; 001-003 dependem da Fase 5); runbooks Cognito/Transfer Family
executados nos 3 ambientes; p95 medido; security review com Bedrock real
feito; auditoria de IAM confirma least privilege em ambiente real.
- #469 (runbook Cognito `custom:tenant_id`), #477 (Managed Workflow Transfer
  Family) — pré-requisitos de produção do retrofit 007, sem eles o
  `TenantContextMiddleware`/canal SFTP não funcionam fora de LocalStack.
- #63, #107, #157, #202, #258 (p95 real).
- #64, #109, #158, #203, #259 (security review c/ Bedrock).
- #580 (auditoria final de IAM, precisa de ambiente real para ter valor).
- 008 T013-T017 (#314-#318): 3 contas AWS, SCP, GuardDuty/Security Hub —
  ainda todas `OPEN`.
- **Esta fase inteira exige AWS** — o time não tem acesso hoje; todo o
  resto do plano (Fases 0-5) avança sem essa credencial.

### Fase 7 — 008 LGPD, 009 custo (P3, restante)
Objetivo verificável: direito ao esquecimento tem porta de entrada; cache de
identificação e lifecycle de custo operam. Sem consumidor obrigatório no
fluxo principal — pode rodar a qualquer momento em paralelo às fases 2-6.
- 008: #314-#348 (62 abertas de 008/009 combinadas, 9 já fechadas — ver
  seção 2). 009: #349-#384.

## 5. Decisões arquiteturais que a ordem pressupõe

Decisões já fechadas por ADR:

- **ADR-010** (`docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`,
  PR #683): verificação de papel via claim `cognito:groups` do access token
  **já verificado** pelo `TenantContextMiddleware` — sem custom attribute
  nem Lambda de pré-geração, sem segunda chamada a `verify()` (mesmo payload
  já obtido para resolver `tenantId`). T1 confirmado em código
  (`tenant-context.middleware.ts`, função `extrairPapeis`, `origin/main`
  commit `53d2fb6`). Decisão pendente que esta ADR ainda não resolve por
  código: o formato exato do guard (T2, #686) e a extensão de `RotaOpts`
  para múltiplos papéis (T3, #687) — ambas ainda ready, sem implementação.
- **ADR-009** (`docs/architecture-diagrams/adr-009-composicao-producao-gateway-ia.html`,
  PR #622): dono/localização da composition root de produção, formato do
  handler, seleção de gateway de IA (`NEXO_AGENTE_IA`). Confirmado em código
  nesta revisão de novo: é o mesmo padrão que agora também seleciona entre
  os 4 gateways Ollama e os gateways Bedrock reais nos 4 `composition/*.ts`.
- **ADR-004** (`docs/architecture-diagrams/adr-004-iam-eventbridge-publish.html`):
  IAM `events:PutEvents`, cobre #576-#580 — execução, não decisão em aberto.
- **ADR-008** (`docs/architecture-diagrams/adr-008-tenantid-retrofit.html`):
  retrofit `tenantId` — cobria a Fase 1 (007), concluída.
- **Lambda MarkItDown por BC** (ADR-002, referenciado em #588/#590): decisão
  tomada, não em aberto. Risco não coberto por issue específica, ainda
  aberto: confirmar que #588 (leve) e #590 (completa) não divergem em
  contrato de resposta antes de ambos serem consumidos pelas ACLs de 001/002
  — herdado, não reverificado nesta rodada porque nenhuma das duas issues
  fechou.
- **Restrição de dimensionalidade do embedding local (#620)**: reconfirmado
  nesta revisão — `indice-orcamento.schema.ts:54` (agora em
  `infrastructure/persistence/schema/`) ainda fixa
  `vector('embedding', { dimensions: 1024 })`. `OllamaEmbeddingGateway` já
  está em produção local emitindo 1024 dimensões, amarrado em
  `composition/busca-indexacao.ts:63`.

Decisão nova, ainda **sem ADR**, identificada na 3ª revisão e ainda em
aberto:

- **#664 — modelo Bedrock do Agente Orquestrador (legado vs. Mantle) e
  cliente Bedrock correspondente.** Sem ADR hoje. Bloqueia qualquer caso de
  uso de 005 que chame o orquestrador via Bedrock real (não bloqueia os
  stubs locais/Ollama, que já rodam sem essa decisão). Recomendação: ADR
  antes de #252-256 avançarem além do caminho que hoje já funciona sem
  Bedrock real.

- **Fase 6 (AWS real) não pode ser antecipada por decisão de arquitetura** —
  é bloqueio de acesso operacional, registrado, sem mitigação de design
  possível além de maximizar o que roda em LocalStack (Fases 0-5). #469 e
  #477 são pré-requisitos operacionais desta fase, não deste documento.

## Riscos remanescentes

- **Gate formal `blocked` voltou ao board, e passa pela cabeça do caminho
  crítico.** ADR-010 T4/T5/T6 (#688/#689/#690) estão `blocked` até T2/T3
  (#686/#687) fecharem. Diferente do gate anterior (#584→#585→#190, dentro
  de um único BC), este atravessa 003 e 005 simultaneamente através de um
  middleware compartilhado (`tenant-context.middleware.ts`) — um atraso em
  #686/#687 atrasa os dois BCs ao mesmo tempo, não um por vez.
- **#250 está `in-progress` mas tecnicamente travado.** O dev já começou o
  controller; sem o guard `comprador-responsável` (#688), o controller não
  pode fechar com a autorização que o ADR-010 exige — risco de o trabalho em
  #250 avançar sem guard e precisar de retrabalho quando #688 chegar, se não
  houver coordenação explícita da ordem.
- **Cutover de `tenantId` já é produção-visível em 2 de 5 BCs**, e agora
  `request.papeis` também está em produção local (via PR #693) sem
  `role-guard` para consumi-lo ainda — a claim é extraída, mas nada decide
  403 com ela hoje. Janela de tempo com dado de papel disponível e sem
  imposição de autorização correspondente.
- **#635 (teste adversarial `tenantId` forjado) ainda `OPEN`.** Mesma
  disciplina que falta para #690 (papel forjado) — ambos testam a mesma
  classe de ataque (claim client-controlável tentando se passar por claim
  verificada) em dimensões diferentes (tenant vs. papel).
- **005 segue sendo o BC de maior risco financeiro**, agora com uma segunda
  camada de gate (ADR-010) além da regra de negócio já resolvida (#246/#248
  fecharam). O risco mudou de "falta regra de negócio" para "regra de
  negócio existe, falta autorização e o endpoint que a expõe".
- **#664 (modelo Bedrock do orquestrador) é decisão em aberto sem ADR.** Sem
  resolução, qualquer trabalho em 005 que assuma um cliente Bedrock
  específico corre risco de retrabalho.
- **001-003 seguem sem handler de produção** (#613-#616, `OPEN`) enquanto
  004/005 já têm — desbalanceamento inalterado desde a 3ª revisão.
- **#469/#477 (runbooks operacionais AWS) nunca foram citados nas revisões
  anteriores e são pré-requisito de produção real do retrofit 007** — sem
  eles, `TenantContextMiddleware` não tem claim `custom:tenant_id` para
  extrair fora de LocalStack, e o canal SFTP não resolve `tenantId`. Ambos
  bloqueados por falta de acesso AWS, mesma classe da Fase 6.
- **Risco de processo, não de arquitetura**: este documento já foi perdido
  uma vez por edição sem commit no worktree; o board também mudou durante a
  própria investigação desta revisão (#685 fechou enquanto eu verificava
  código). Quem for commitar deve fazê-lo antes de editar de novo por cima,
  e reconferir issues citadas como `OPEN`/`blocked` se o commit demorar.
