# Plano de finalização — Nexo

Insumo: `docs/estado-funcionalidades.md` (gerente-produto, 2026-08-03). Este
documento não refaz o levantamento — responde onde estamos (síntese), o que
falta (issue a issue, confirmado no GitHub), e em que ordem fechar.

Verificação de issues: `gh issue list --state all --limit 800` exportado para
TSV (425 issues) e processado por script — não colado issue a issue no
contexto. Detalhe pontual (corpo, labels `blocked`) via `gh issue view N`
quando o TSV não bastou.

## Nota de método desta revisão

Esta é a terceira revisão deste documento, disparada por uma sequência grande
de merges (retrofit multi-tenant 007 fechado em 001-005, gate #584→#585→#190
fechado, handlers de produção de 004/005 mergeados). Nesta revisão eu:

- **Reverifiquei no código**, arquivo e linha: `schemaVersion` nos 5
  `domain-event.ts` (todos `2` agora — ver seção 1), obrigatoriedade de
  `tenantId: string` (não mais opcional) nos mesmos 5 arquivos, uso de
  `DrizzleTenantScopedRepositoryBase` nos repositórios dos 5 BCs, os
  `export const handler`/`NodejsFunction` existentes em `src/*/interface/events/*.production.ts`
  e `infra/lib/*-function-stack.ts` (mais `infra/bin/app.ts` para confirmar
  wiring real, não só arquivo solto), `application/use-cases/` de 005 (4
  arquivos agora, não 2), `interface/` de 005 (handlers das 3 filas +
  controller de status, não mais vazia), `interface/` de 003 e 004 (handlers
  de fila existem, sem wrapper de produção), o conteúdo completo de
  `src/dev/local.ts` (ainda só 001→002, poller de duas filas, comentário do
  próprio arquivo confirma), a dimensão pgvector em
  `indice-orcamento.schema.ts:54` (ainda 1024) e o BC `acompanhamento` (só
  1 arquivo, um schema Zod — nenhum domínio/aplicação/persistência ainda).
- **Reconsultei via `gh`** (TSV completo + `gh issue view` pontual) o estado
  de toda issue citada na revisão anterior, mais o intervalo #625-#666 para
  achar issues novas. Mudanças relevantes na seção 1 e nas tabelas.
- **Herdei sem reverificar linha a linha** (sem sinal de que tenham mudado): a
  maior parte de 008/009 alheia às 9 issues que apareceram como `CLOSED`
  nesta rodada (ver seção 2), o conteúdo dos ADR-004/008/009 (só confirmei que
  os arquivos existem, não reli o texto inteiro de novo), e a avaliação de
  risco de #588/#590 (divergência de contrato MarkItDown leve vs. completo)
  da revisão anterior.
- **Risco de processo** (herdado, ainda vale registrar): a primeira execução
  deste documento foi perdida por edição sem commit no worktree. Esta
  revisão fica no working tree por instrução explícita de quem a pediu — não
  é decisão de método deste documento, é escopo da tarefa.

## 1. Onde estamos

**Mudança central desde a revisão anterior: o retrofit multi-tenant (007) em
001-005 fechou por completo.** Verificado nos 5 `domain-event.ts`:
`schemaVersion: 2` e `tenantId: string` obrigatório (não mais `tenantId?`) em
`ingestao-identificacao` (`:21`), `extracao` (`:16`), `validacao` (`:31`),
`busca-indexacao` (`:18`) e `orquestracao` (`:19`). Os 5 repositórios Drizzle
estendem `DrizzleTenantScopedRepositoryBase` (RLS + tenant-scoping
estrutural). No board: #277-#281 (001), #582-#587 e #632/#648/#649/#650/#656
(002/003/005, wiring + cutover formal) — todas `CLOSED`. Isso fecha o gate
#584→#585 que bloqueava #190, e #190/#235/#236 (handlers/controller que
dependiam do retrofit) também fecharam.

**Segunda mudança central: já existe deploy implantável para 2 dos 5 BCs.**
`infra/bin/app.ts` instancia `IndexadorFunctionStack` (004, issue #623,
`CLOSED`) e `ContextoClassificacaoFunctionStack` /
`ContextoExtracaoFunctionStack` / `DecisaoWorkflowFunctionStack` (005, issue
#624, `CLOSED`) — cada um é um `NodejsFunction` real amarrado à sua
role IAM e à sua fila SQS. A frase "zero deploy implantável hoje" da revisão
anterior **não é mais verdadeira** para 004/005. Ela **continua verdadeira**
para 001/002/003: `classificador-queue`, `extrator-queue` e `validador-queue`
têm handler de fila em `src/*/interface/events/*.handler.ts` e role IAM
(`infra/lib/*-lambda-role-stack.ts`), mas nenhum `*-function-stack.ts` os
amarra a um `NodejsFunction` — são as issues #613 (001), #614 (002), #615/#616
(003), todas ainda `OPEN`.

`src/dev/local.ts` continua encadeando só 001→002 (2 pollers:
`classificador-queue`, `extrator-queue`); 003/004/005 seguem sem wiring de
execução local, nem produção. 003 (validação) tem domínio e application
prontos e isolados. 004 tem application/domain prontos e agora handler de
produção real (004 é o BC mais avançado em deploy, apesar de menos avançado
em regra de negócio — a categorização de item por agente, #149-#155, segue
`OPEN`, então a regra de preço ainda não é confiável). 005 avançou de 2 para
4 casos de uso (`consolidar-e-decidir-workflow.ts`,
`consultar-status-decisao-workflow.ts`, `registrar-contexto-classificacao.ts`,
`registrar-contexto-extracao.ts`) e ganhou interface (handlers das 3 filas +
`status.controller.ts`, que fecha #236). Ainda falta
`RegistrarDecisaoHumanaWorkflow` (#248, `OPEN`) e o controller de decisão
humana (#250, `OPEN`) — 005 continua sendo o BC com maior lacuna de regra de
negócio na cadeia (decisão humana, reenvio ao fornecedor, integração
externa), só que agora sem gate formal de 007 na frente.

007 (retrofit) não terminou por completo: o que falta é só a trilha de
**Acompanhamento/exportação de auditoria** — BC quase vazio no código (1
arquivo, um schema Zod de resposta, `src/bounded-contexts/acompanhamento/interface/http/exportacao-auditoria.schema.ts`),
sem domínio, sem persistência, sem caso de uso. Só o teste de contrato (#282,
T019) e a confirmação pré-cutover (#297, T034) fecharam; T020-T038
(#283-#301, exceto #282/#297) seguem `OPEN`. Isso não bloqueia nada do
pipeline principal — é auditoria, não decisão de negócio — mas é a parte de
007 que de fato ainda está em estágio inicial, ao contrário de 001-005.

008/009 saíram do "zero absoluto": 9 issues fecharam (#319, #320, #323 em
008 — testes e agregado `SolicitacaoEsquecimento`; #350, #352, #353, #354,
#355, #360 em 009 — dependência DynamoDB e VOs de cache de identificação),
mas nenhuma delas tem consumidor real no fluxo ainda — é trabalho de domínio
isolado, sem wiring. 62 das 71 issues de 008/009 seguem `OPEN`.

Uma decisão nova apareceu sem ADR: **#664, `OPEN`** — "modelo Bedrock do
Agente Orquestrador + cliente Bedrock (legado vs. Mantle), a decidir".
Precisa resolver antes de qualquer caso de uso de 005 que chame o agente
orquestrador via Bedrock real (não afeta os stubs locais).

## 2. Fechamento de casos de uso

Convenção da tabela: "issues que o fecham" lista todas as issues abertas
necessárias (não apenas a task central). "O que ainda não tem issue" só é
preenchido quando confirmei ausência real no board.

### 001 · Ingestão e Classificação

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Upload multi-canal (portal/API/mobile) sem 400 | FECHADO | #592 (BUG-001), fechada por #618/PR #625 | — |
| Retrofit `tenantId`/`schemaVersion: 2` no agregado/eventos | FECHADO | #277, #278, #279, #280, #281 — confirmado em `domain-event.ts:21` (`tenantId: string`), `:7` (`schemaVersion: 2`) | — |
| Handler Lambda de produção para os casos de uso já implementados de 001 | NÃO INICIADO | #613 (handlers), #576, #577, #579, #580 (IAM `events:PutEvents`), #53 (IAM leitura consulta-status) | — |
| Conversão real de documento (MarkItDown, não stub) | PARCIAL | #588 (T066, Lambda Python), #589 (T067, LocalStack Lambda) | — |
| Teste adversarial `tenantId` forjado no body | ABERTO | #635 | — |
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
| `DrizzleFaixaPrecoRepository` (leitura) | FECHADO | #385 (T023) | — |
| Retrofit `tenantId`/`schemaVersion: 2` em eventos de 003 | FECHADO | #583, #649 — confirmado em `validacao/domain/events/domain-event.ts:31` (`tenantId: string`) | — |
| Categorização de item via agente (regra de preço não hardcoded) | NÃO INICIADO | #149, #150, #151, #152, #153, #154, #155 | — |
| Handler Lambda de produção do Validador | NÃO INICIADO | #615 (handler), #616 (IAM `events:PutEvents`) | — |
| Perf/segurança/docs de fechamento | ABERTO | #156, #157, #158, #159, #160 | — |

### 004 · Indexação e Busca Semântica

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Handler Lambda SQS `indexador-queue` | FECHADO | #190 (T030) — gate #584→#585 cumprido, mergeada | — |
| Handler Lambda de produção (deploy) | FECHADO | #623 — `IndexadorFunctionStack` instanciado em `infra/bin/app.ts`, confirmado nesta revisão | — |
| Endpoint HTTP de busca em linguagem natural | FECHADO | #198 (T038), #199 (T039) | — |
| IAM `IndexarOrcamentoLambdaRole` / `BuscarOrcamentosLambdaRole` | ABERTO | #192, #200 | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #186, #187, #195, #196, #197, #201, #202, #203, #204, #205, #206 | — |
| Gateway de IA local (Ollama) para embedding | ABERTO | #620 — restrição de 1024 dimensões confirmada de novo em `indice-orcamento.schema.ts:54` | — |

### 005 · Orquestração de Workflow e Integrações

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId`/`schemaVersion: 2` em eventos de 005 | FECHADO | #586, #650, #656 — confirmado em `orquestracao/domain/events/domain-event.ts:19` (`tenantId: string`) | — |
| Registro de contexto (classificação/extração) para a decisão | FECHADO | #234 (T028), casos de uso `registrar-contexto-classificacao.ts`/`registrar-contexto-extracao.ts` confirmados no diretório | — |
| Handlers Lambda consumidores (3 filas) + deploy | FECHADO | #235 (T029), #624 (deploy) — `ContextoClassificacaoFunctionStack`/`ContextoExtracaoFunctionStack`/`DecisaoWorkflowFunctionStack` confirmados em `infra/bin/app.ts` | — |
| Rastreabilidade da decisão (status) | FECHADO | #229 (T023), #236 (T030) — `status.controller.ts` confirmado em `interface/http/` | — |
| `ConsolidarEDecidirWorkflow` — caminho de baixa confiança | ABERTO — verificar se cobre insuficiência de confiança além do caminho base | #246 (T040) | — |
| Escalonamento para comprador + decisão humana | NÃO INICIADO | #248 (T042, `RegistrarDecisaoHumanaWorkflow` — confirmado ausente em `application/use-cases/`), #250 (T044, controller), #237 (T031, auth Cognito) | — |
| Solicitação de reenvio ao fornecedor | NÃO INICIADO | #252 (T046), #254 (T048), #256 (T050) | — |
| Integração externa disparada pela decisão | NÃO INICIADO | #253 (T047), #255 (T049, ADR-003) | — |
| Decisão de modelo Bedrock do Agente Orquestrador | EM ABERTO, sem ADR | #664 — pré-requisito para qualquer caso de uso de 005 que chame Bedrock real | — |
| IAM roles do BC | ABERTO | #238 (T032), #251 (T045) | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #230, #239, #241, #242, #243, #244, #257, #258, #259, #260, #261, #262, #263 | — |

### 007 · Isolamento Multi-tenant (retrofit 001-005) e Acompanhamento

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId`/`schemaVersion: 2` — 001 a 005 | **FECHADO** | #277-#281 (001), #582/#631/#648 (002), #583/#649 (003), #584/#585 (004, gate), #586/#650 (005), #632 (contract cutover), #656 (isolamento estrutural 002/003/005), #297/#587 (confirmação pré-cutover) — todas `CLOSED`, confirmado em código nos 5 `domain-event.ts` | — |
| Teste adversarial `tenantId` forjado (001) | ABERTO | #635 | — |
| Exportação de auditoria multi-tenant (`Acompanhamento`) | NÃO INICIADO (só contrato) | #283-#296, #298-#301 (T020-T038, exceto #282/#297 que já fecharam) | — |

### 008 · Hardening/LGPD e 009 · Custo — 9 issues fechadas (domínio isolado), sem consumidor no fluxo ainda

62 das 71 issues seguem abertas. As 9 fechadas (#319, #320, #323 em 008 —
agregado `SolicitacaoEsquecimento` e seus testes; #350, #352, #353, #354,
#355, #360 em 009 — dependência DynamoDB e VOs de cache de identificação) são
domínio isolado, sem wiring real com 001-005. Não detalhado linha a linha
aqui por não terem consumidor no fluxo ponta a ponta hoje (ver seção 3,
prioridade P3).

## 3. Prioridade por issue

Critério (explícito, ordem de peso, **inalterado nesta revisão** — só a
distribuição de issues mudou): **(a)** desbloqueia o fluxo ponta a ponta ou
corrige defeito que impede uso → P0. **(b)** completa um caso de uso que já
está em andamento e é pré-requisito técnico direto de outro (gate real, não
conveniência) → P1. **(c)** necessário para deploy de produção mas não
bloqueia progresso local/de código (IAM, handlers, validação com AWS real) →
P2. **(d)** otimização (009), compliance sem consumidor ainda (008),
documentação/OpenAPI, ou spec que não é caminho crítico → P3.

**Nota sobre (b) nesta revisão:** o único gate formal (`blocked`) que existia
no board — #623/#624 aguardando #190/#235 — fechou junto com o retrofit 007.
Não há hoje nenhuma issue `OPEN` com label `blocked` (confirmado no TSV
completo). Os itens de 005 abaixo continuam em P1 pelo critério (a) — sem
eles não existe decisão de workflow completa, ou seja, o fluxo ponta a ponta
não fecha —, não mais por (b): não há mais uma issue formal que dependa
tecnicamente deles para destravar.

| Prioridade | Issues | Motivo |
|---|---|---|
| **P0** | Nenhuma. | Não há defeito conhecido nem gate formal impedindo uso hoje — o último (#584→#585→#190) fechou nesta janela. |
| **P1** | #246, #248, #250, #252, #253, #254, #255, #256, #229, #237, #238, #251, #664 (005 application/interface restante) | Critério (a): sem decisão humana, reenvio e integração externa, nenhum orçamento chega a uma decisão final — o fluxo ponta a ponta continua incompleto mesmo com 001-004 fechados. #664 é pré-requisito de qualquer caso de uso que chame o Agente Orquestrador via Bedrock real. |
| **P1** | #149-#155 (003 categorização de item) | Regra de preço hoje não é confiável sem isso — risco de corretude de negócio, critério (a). |
| **P1** | #635 (007 teste adversarial `tenantId` forjado) | Único teste que valida, sob ataque, o retrofit de segurança que acabou de fechar — sem ele a garantia multi-tenant é só "código parece certo", não verificada sob adversário. |
| **P2** | #613, #614, #615, #616 (handlers Lambda de produção 001-003) | Critério (c): 004/005 já têm handler de produção; 001-003 seguem sem `*-function-stack.ts`, mas isso não bloqueia progresso de código local (`src/dev/local.ts` já roda 001→002 sem eles). |
| **P2** | #576, #577, #578, #579, #580, #65, #53 (IAM `events:PutEvents` + auditoria least privilege) | Necessário para deploy real; não bloqueia progresso de código local. |
| **P2** | #588, #589, #590 (MarkItDown Lambda real) | Sem AWS pode avançar via LocalStack Lambda (#589); conversão real de produção (#588/#590) é pré-deploy. |
| **P2** | #617, #619, #620, #621 (Ollama local, alternativa ao Bedrock) | 001/002 já rodam localmente com stubs — Ollama é upgrade de realismo, não desbloqueio. `docs/plano-infra-ambientes.md` §5 (herdado, não relido nesta rodada) documenta que Ollama não substitui p95 real, security review com Bedrock, nem calibração de confiança. |
| **P2** | #63, #107, #157, #202, #258 (medição p95 real) | Requer ambiente de staging/AWS — não substituível por Ollama. |
| **P2** | #64, #109, #158, #203, #259 (security review c/ Bedrock real) | Idem — precisa de chamada real a Bedrock. |
| **P2** | #641 (convenção de métrica de observabilidade — 8 issues dependem) | Pré-requisito técnico real (critério b) de closure de testes/observabilidade abaixo, mas nenhum dos dependentes bloqueia o pipeline em si. |
| **P2** | #54, #61, #62, #110, #156, #159, #160, #192, #200, #201, #204, #205, #206, #186, #187, #195, #196, #197, #230, #239, #241-#244, #257, #260-#263 | Testes/observabilidade/docs de fechamento — importantes, mas não bloqueiam avanço de outra fase. |
| **P3** | #283-#296, #298-#301 (007 Acompanhamento/exportação de auditoria) | Sem consumidor até 008 precisar dela; único trecho de 007 ainda em estágio inicial. |
| **P3** | 62 issues abertas de 008/009 (#314-#384, exceto as 9 já fechadas) | LGPD/custo sem porta de entrada de aplicação ainda; nenhum caso de uso downstream depende disso hoje. |

## 4. Ordem de execução

**Caminho crítico — cabeça reavaliada nesta revisão.** Na revisão anterior a
cabeça era 007 (retrofit 001), #277→#281, por ser gate formal (#584→#585) de
#190. **Esse gate fechou por completo** — confirmado em código
(`tenantId: string` obrigatório e `schemaVersion: 2` nos 5 BCs) e no board
(#277-#281, #582-#587, #632/#648/#649/#650/#656 todas `CLOSED`). **Não existe
hoje nenhum gate formal `blocked` aberto no board** (verificado no TSV
completo). Isso muda a natureza da escolha de cabeça: não há mais dependência
técnica formal a seguir, só o critério (a) da seção 3 — o que ainda impede o
fluxo ponta a ponta de produzir uma decisão completa.

**Nova cabeça: 005 (application/interface restante) — #246, #248, #250,
#252-#256, #237, #238, #251, #664 —, em paralelo com 003 (#149-#155,
categorização de item).** Motivo: com 001-004 fechados e o retrofit
completo, 005 é o único BC onde falta regra de negócio central (decisão
humana, reenvio, integração externa) para qualquer orçamento chegar a uma
decisão final; 003 é o único onde a regra de preço ainda roda sem a
categorização correta. Nenhuma das duas trilhas bloqueia a outra
tecnicamente (BCs distintos) — a ordem entre elas é de esforço/risco, não de
dependência formal (sendo honesto sobre isso, ao contrário da revisão
anterior, que tinha um gate real para justificar a cabeça).

Caminho completo: 005 (application/interface) ⟷ 003 (categorização, paralelo,
sem dependência mútua) → wiring local 003→004→005 (extensão de
`src/dev/local.ts`, hoje só 001→002) → handlers de produção restantes de
001-003 (P2) → validação com AWS real (P2) → 007 Acompanhamento/008/009 (P3,
paralelizável a qualquer momento).

### Fase 0 — Desbloqueio imediato — CONCLUÍDA
Objetivo verificável: upload funciona nos 4 canais; composition root vira
código commitado. #592 (BUG-001) fechada, #618 mergeada (PR #625). Nada
pendente aqui.

### Fase 1 — Retrofit 007 (001-005) — CONCLUÍDA
Objetivo verificável: todo evento publicado por 001-005 carrega `tenantId`
obrigatório e `schemaVersion: 2`; os 5 repositórios são tenant-scoped.
**Status: feito**, confirmado em código nesta revisão (ver seção 1). Único
resíduo: #635 (teste adversarial `tenantId` forjado, `OPEN` — não bloqueia
avanço, mas fecha a garantia de segurança do retrofit) e a trilha de
Acompanhamento/auditoria (movida para Fase 4, sem consumidor).

### Fase 2 — Completar 005 e 003 (paralelo)
Objetivo verificável: uma decisão de workflow completa (aprovar/escalonar/
reenviar/integração externa) é produzível chamando os casos de uso de 005
diretamente (sem handler Lambda ainda); item sem `categoria` é classificado
pelo agente antes da regra de preço (003).
- 005: #246, #248, #250, #252, #253, #254, #255, #256, #229 (já parcialmente
  coberto por #236, fechada), #237, #238, #251, #664 (mais os testes #230,
  #239, #241-#244, #257, #260-#263).
- 003: #149, #150, #151, #152, #153, #154, #155, #156 — paralelo a 005 (BCs
  distintos, sem dependência entre si).
- Depende de: nada — Fase 1 já concluída. As duas trilhas correm em
  paralelo dentro desta fase.

### Fase 3 — Encadear o pipeline local completo
Objetivo verificável: `src/dev/local.ts` processa 001→002→003→004→005 de
ponta a ponta em LocalStack, sem intervenção manual entre BCs.
- Estender `src/dev/local.ts` para encadear 003/004/005 (sem issue própria
  hoje — registrar como parte do trabalho de wiring, não uma issue nova
  isolada).
- #192, #200 (IAM de 004, se ainda não cobertas por deploy).
- Depende de: Fase 2 completa (casos de uso de 003/005 precisam existir).

### Fase 4 — Handlers de produção restantes (001-003) + IAM + Acompanhamento
Objetivo verificável: existe `lambda.Function`/`export const handler` real
para os casos de uso de 001, 002 e 003 (004/005 já têm, ver seção 1), com IAM
least privilege incluindo `events:PutEvents`. Trilha de Acompanhamento
(exportação de auditoria) corre em paralelo, sem consumidor obrigatório.
- #613 (001), #614 (002), #615+#616 (003), #576, #577, #578, #579, #580, #65,
  #53.
- MarkItDown real: #588, #590 (código), #589 (LocalStack Lambda, sem AWS).
- Ollama local (upgrade de realismo, não bloqueio): #617, #619, #620
  (restrição de 1024 dimensões, `indice-orcamento.schema.ts:54`), #621.
- #641 (convenção de métrica) antes dos 8 dependentes de closure/observabilidade.
- 007 Acompanhamento: #283-#296, #298-#301 — paralelizável a qualquer momento,
  sem dependência das linhas acima.
- Depende de: nada tecnicamente formal — pode começar em paralelo à Fase 2/3;
  ordenada depois por prioridade (P2), não por bloqueio.

### Fase 5 — Validação com AWS real (EXIGE credencial AWS/Bedrock)
Objetivo verificável: deploy em staging funciona (004/005 já sintetizam via
CDK; 001-003 dependem da Fase 4); p95 medido; security review com Bedrock
real feito; auditoria de IAM confirma least privilege em ambiente real.
- #63, #107, #157, #202, #258 (p95 real).
- #64, #109, #158, #203, #259 (security review c/ Bedrock).
- #580 (auditoria final de IAM, precisa de ambiente real para ter valor).
- 008 T013-T017 (#314-#318): 3 contas AWS, SCP, GuardDuty/Security Hub —
  ainda todas `OPEN`.
- **Esta fase inteira exige AWS** — o time não tem acesso hoje; todo o
  resto do plano (Fases 0-4) avança sem essa credencial.

### Fase 6 — 008 LGPD, 009 custo (P3, restante)
Objetivo verificável: direito ao esquecimento tem porta de entrada; cache de
identificação e lifecycle de custo operam. Sem consumidor obrigatório no
fluxo principal — pode rodar a qualquer momento em paralelo às fases 2-5.
- 008: #314-#348 (62 abertas de 008/009 combinadas, 9 já fechadas — ver
  seção 2). 009: #349-#384.

## 5. Decisões arquiteturais que a ordem pressupõe

Decisões já fechadas por ADR (herdado da revisão anterior — arquivos só
confirmados como existentes, não relidos linha a linha nesta rodada):

- **ADR-009** (`docs/architecture-diagrams/adr-009-composicao-producao-gateway-ia.html`,
  PR #622): dono/localização da composition root de produção, formato do
  handler (`export const handler` direto por caso de uso, `NodejsFunction`
  no CDK), seleção de gateway de IA (`NEXO_AGENTE_IA`). Confirmado em código
  nesta revisão: é exatamente o padrão usado pelos 4 `*-function-stack.ts`
  hoje existentes (004 e as 3 filas de 005).
- **ADR-004** (`docs/architecture-diagrams/adr-004-iam-eventbridge-publish.html`):
  IAM `events:PutEvents`, cobre #576-#580 — execução, não decisão em aberto.
- **ADR-008** (`docs/architecture-diagrams/adr-008-tenantid-retrofit.html`):
  retrofit `tenantId` — cobria a Fase 1 (007), **agora concluída**, ver
  seção 1.
- **Lambda MarkItDown por BC** (ADR-002, referenciado em #588/#590): decisão
  tomada, não em aberto. Risco não coberto por issue específica, ainda
  aberto: confirmar que #588 (leve) e #590 (completa) não divergem em
  contrato de resposta antes de ambos serem consumidos pelas ACLs de 001/002
  — herdado, não reverificado nesta rodada porque nenhuma das duas issues
  fechou.
- **Restrição de dimensionalidade do embedding local (#620)**: reconfirmado
  nesta revisão — `indice-orcamento.schema.ts:54` ainda fixa
  `vector('embedding', { dimensions: 1024 })`. Qualquer
  `OllamaEmbeddingGateway` tem que emitir 1024 dimensões.

Decisão nova, ainda **sem ADR**, identificada nesta revisão:

- **#664 — modelo Bedrock do Agente Orquestrador (legado vs. Mantle) e
  cliente Bedrock correspondente.** Sem ADR hoje. Bloqueia qualquer caso de
  uso de 005 que chame o orquestrador via Bedrock real (não bloqueia os
  stubs locais, que não usam Bedrock). Recomendação: ADR antes de #246/#248
  avançarem além do caminho que hoje já funciona sem IA real.

- **Fase 5 (AWS real) não pode ser antecipada por decisão de arquitetura** —
  é bloqueio de acesso operacional, registrado, sem mitigação de design
  possível além de maximizar o que roda em LocalStack (Fases 0-4).

## Riscos remanescentes

- **Cutover de `tenantId` já é produção-visível em 2 de 5 BCs.** 004 e 005
  já têm `NodejsFunction` de produção (`IndexadorFunctionStack`,
  `ContextoClassificacaoFunctionStack`, `ContextoExtracaoFunctionStack`,
  `DecisaoWorkflowFunctionStack`) processando eventos que agora exigem
  `tenantId` obrigatório — mas **nenhuma dessas Lambdas rodou em AWS real
  ainda** (sem credencial, Fase 5 nunca começou). O risco mudou de "retrofit
  incompleto" para "cutover nunca validado fora de LocalStack/`cdk synth`" —
  LocalStack community não aplica IAM nem RLS Postgres da mesma forma que
  Aurora real.
- **#635 (teste adversarial `tenantId` forjado) ainda `OPEN`.** O retrofit
  de segurança fechou por código, mas a prova de que um `tenantId` forjado
  no body é ignorado nos endpoints HTTP de 001 ainda não existe como teste
  automatizado — risco de regressão silenciosa.
- **005 continua sendo o BC de maior risco financeiro e menor cobertura de
  regra de negócio**, agora sem gate formal na frente dele — o risco não é
  mais "bloqueado por 007", é "sem nenhuma dependência externa forçando a
  prioridade", o que facilita ser adiado por conveniência. Esta revisão
  marca #246/#248/#250/#252-256/#237/#238/#251/#664 como P1 pelo critério
  (a), não (b) — ver nota na seção 3.
- **#664 (modelo Bedrock do orquestrador) é decisão em aberto sem ADR.**
  Se não resolvida antes, qualquer trabalho em 005 que assuma um cliente
  Bedrock específico corre risco de retrabalho.
- **001-003 seguem sem handler de produção** (#613-#616, `OPEN`) enquanto
  004/005 já têm — a cadeira do pipeline de produção está desbalanceada:
  eventos de 001/002/003 hoje só são consumidos localmente (`src/dev/local.ts`,
  só 001→002) ou não são consumidos em produção alguma.
- Ollama (#617, #619, #620, #621) não reduz a necessidade de validação com
  Bedrock real (Fase 5) — herdado, `docs/plano-infra-ambientes.md` §5 não
  relido nesta rodada, sem sinal de que tenha mudado.
- **Risco de processo, não de arquitetura**: este documento já foi perdido
  uma vez por edição sem commit no worktree. Esta revisão fica no working
  tree por instrução explícita da tarefa que a pediu — quem for commitar
  deve fazê-lo antes de editar de novo por cima.
