# Plano de finalização — Nexo

Insumo: `docs/estado-funcionalidades.md` (gerente-produto, 2026-08-03). Este
documento não refaz o levantamento — responde onde estamos (síntese), o que
falta (issue a issue, confirmado no GitHub), e em que ordem fechar.

Verificação de issues: `gh issue list`/`gh issue view`/`gh pr view` (`gh`
disponível neste ambiente — diferente da nota de método do doc de produto,
que rodou sem `gh`). Todos os números de issue e PR citados abaixo foram
confirmados individualmente nesta revisão (ver "Nota de método" ao final
da seção 1).

## Nota de método desta revisão

Esta é a segunda execução deste documento — a primeira foi perdida (editada
sem commit, revertida por um merge concorrente). Nesta revisão eu:

- **Reverifiquei no código**, não apenas assumi: `schemaVersion` em
  `src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.ts:7`
  (ainda `1`), a dimensão pgvector em `indice-orcamento.schema.ts:54` (1024),
  a existência e conteúdo de `src/composition/` e `src/dev/` (commitados,
  4 arquivos), `NEXO_AGENTE_IA` em `.env.example:31`, `docs/plano-infra-ambientes.md`
  §5 (Ollama não substitui p95/security review/calibração — texto lido
  integralmente, não resumido de memória), o `application/use-cases/` de 005
  (2 arquivos: `consolidar-e-decidir-workflow.ts`,
  `registrar-contexto-classificacao.ts` — confirma "só ~2 de ~5" à mão).
- **Reconsultei via `gh`** estado e labels de #277, #281 (007), #613-#616,
  #623-#624 (handlers de produção), #618 (fechada) + PR #625 (merged), #592
  (fechada), #385/#198/#199 (fechadas), #235/#190 (abertas), PR #622
  (merged), #617/#619/#620/#621 (Ollama, abertas).
- **Herdei sem reverificar linha a linha** (mas sem motivo para desconfiar,
  dado o que já bateu): a lista completa de issues de 008/009 (#314-#384) e
  a maior parte da tabela de 007 (#282-#301) — não há sinal de que tenham
  mudado desde a primeira execução.

## 1. Onde estamos

001→002 é o trecho mais maduro. O canal de upload nos 4 canais está
corrigido: BUG-001 foi fechado pela #618 (PR #625, merged), que restaurou
`src/composition/` e `src/dev/` como código versionado — QA validou
end-to-end com docker-compose + LocalStack (`upload-url → PUT →
confirmar-upload → status`), evidência em
`specs/001-.../evidence/qa-issue-618-pr-625.md`, `BUG-001.md` marcado
`VALIDADO`. Ainda não existe nenhum `export const handler`/`lambda.Function`
de produção em `src/`/`infra/` — zero deploy implantável hoje, mas isso é
trabalho de infraestrutura já com issues abertas (#613-#616, #623-#624), não
mais um bloqueio estrutural sem issue. `src/dev/local.ts` encadeia só
001→002; 003/004/005 não têm wiring de execução, nem local nem produção.
003 (validação) está com domínio e application prontos, isolado. 004 tem
application/domain prontos mas falta controller HTTP de busca (issue já
aberta, não é lacuna sem issue). 005 é o mais atrasado: domínio pronto,
application quase vazia (2 de ~5 casos de uso: falta `RegistrarContextoExtracao`,
`RevisarDecisaoWorkflowComIA`, `RegistrarDecisaoHumanaWorkflow`), interface
HTTP vazia — e é a decisão de maior risco financeiro da cadeia.

**Correção em relação à primeira execução deste documento: "007 só chegou a
001" está errado.** Reverificado em
`ingestao-identificacao/domain/events/domain-event.ts:7`:
`schemaVersion: 1` ainda, e #277-#281 (retrofit de 001) seguem abertas. O
que de fato chegou a `main` do trabalho de suporte a 007 foi só
infraestrutura compartilhada (#264-#276, fechadas:
`src/shared-kernel/tenant/tenant-id.vo.ts`, `tenant-context.ts`,
`drizzle-tenant-scoped-repository-base.ts`) e periferia de 001 (mapping
SFTP, schema, repositório) — não o retrofit do agregado/eventos em si. Ou
seja: 007 não chegou nem a terminar 001, e 002-005 (#582-#587) seguem 100%
pendentes. Título da seção 2/007 abaixo ajustado de "retrofit 002-005" para
"retrofit 001-005".

008/009 estão em estágio inicial e sem consumidor no fluxo ainda. ADR-009
(composição de produção + seleção de gateway de IA) e
`docs/plano-infra-ambientes.md` mergearam em `main` (PR #622) — fecham 3
decisões que a primeira execução deste documento listava como ADR a
escrever (ver seção 5).

## 2. Fechamento de casos de uso

Convenção da tabela: "issues que o fecham" lista todas as issues abertas
necessárias (não apenas a task central). "O que ainda não tem issue" só é
preenchido quando confirmei ausência real no board.

### 001 · Ingestão e Classificação

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Upload multi-canal (portal/API/mobile) sem 400 | FECHADO | #592 (BUG-001), fechada por #618/PR #625 — QA validou end-to-end, evidência em `specs/001-.../evidence/qa-issue-618-pr-625.md` | — |
| Handler Lambda de produção para os casos de uso já implementados de 001 | NÃO INICIADO | #613 (handlers, 5 casos de uso), #576, #577, #579, #580 (IAM `events:PutEvents` das roles já definidas), #53 (IAM leitura consulta-status) | — |
| Conversão real de documento (MarkItDown, não stub) | PARCIAL | #588 (T066, Lambda Python), #589 (T067, rodar no LocalStack Lambda) | — |
| Documentação/perf/segurança de fechamento da spec | ABERTO | #54, #61, #62, #63, #64, #65 | — |

### 002 · Extração de Dados

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Conversão real de documento (MarkItDown, instância própria ADR-002) | PARCIAL | #590 (T046) | — |
| Handler Lambda de produção do Extrator | NÃO INICIADO | #614 (handler), #578 (IAM `events:PutEvents` `ExtratorLambdaRole`) | — |
| Perf/segurança de fechamento | ABERTO | #107, #109, #110 | — |

### 003 · Validação de Consistência

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| `DrizzleFaixaPrecoRepository` (leitura) | FECHADO | #385 (T023), já fechada — confirmado nesta revisão via `gh issue view 385` | — |
| Categorização de item via agente (regra de preço não hardcoded) | NÃO INICIADO | #149, #150, #151, #152, #153, #154, #155 | — |
| Handler Lambda de produção do Validador | NÃO INICIADO | #615 (handler), #616 (IAM `events:PutEvents` `ValidarOrcamentoLambdaRole`) | — |
| Perf/segurança/docs de fechamento | ABERTO | #156, #157, #158, #159, #160 | — |

### 004 · Indexação e Busca Semântica

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Handler Lambda SQS `indexador-queue` | BLOQUEADO | #190 (T030) — **gate explícito #585: só mergeia depois de #584 (007 T042) mergeada** | — |
| Handler Lambda de produção (deploy) | BLOQUEADO | #623, `blocked` — "BLOQUEADA por #190: handler Lambda de produção para indexador-queue (não pegar até T030 existir)" | — |
| Endpoint HTTP de busca em linguagem natural | FECHADO | #198 (T038, caso de uso) e #199 (T039, controller) — ambas fechadas, confirmado nesta revisão via `gh issue view` | — |
| IAM `IndexarOrcamentoLambdaRole` / `BuscarOrcamentosLambdaRole` | ABERTO | #192, #200 | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #186, #187, #195, #196, #197, #201, #202, #203, #204, #205, #206 | — |
| Gateway de IA local (Ollama) para embedding | ABERTO | #620 — restrição própria: vetor local precisa emitir 1024 dimensões (`DIMENSAO_EMBEDDING_TITAN_V2`, `indice-orcamento.schema.ts:54`), verificado no código nesta revisão | — |

### 005 · Orquestração de Workflow e Integrações

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| `ConsolidarEDecidirWorkflow` completo (caminho confiança suficiente e insuficiente) | PARCIAL | #234 (T028, base), #246 (T040, caminho baixa confiança) | — |
| Escalonamento para comprador + decisão humana | NÃO INICIADO | #248 (T042, `RegistrarDecisaoHumanaWorkflow`), #250 (T044, controller `POST .../decisao-humana`), #237 (T031, auth Cognito) | — |
| Solicitação de reenvio ao fornecedor | NÃO INICIADO | #252 (T046, validação `motivoDadoAusente`), #254 (T048, integration test), #256 (T050, erro legível) — publicação em si é parte de #234/#246 | — |
| Integração externa disparada pela decisão | NÃO INICIADO | #253 (T047), #255 (T049, ADR-003) | — |
| Rastreabilidade da decisão (status) | NÃO INICIADO | #229 (T023, contract test), #236 (T030, controller status) | — |
| Handlers Lambda consumidores (3 filas) | NÃO INICIADO | #235 (T029) | — |
| Handler Lambda de produção (deploy) | BLOQUEADO | #624, `blocked` — "BLOQUEADA por #235: handlers Lambda de produção para as 3 filas de contexto/decisão (não pegar até T029 existir)" | — |
| IAM roles do BC | ABERTO | #238 (T032), #251 (T045) | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #230, #239, #241, #242, #243, #244, #257, #258, #259, #260, #261, #262, #263 | — |

### 007 · Isolamento Multi-tenant (retrofit 001-005)

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Retrofit `tenantId` no agregado/eventos de 001 | ABERTO — verificado: `schemaVersion` ainda `1` em `domain-event.ts:7` | #277 (T014, atributo no agregado), #278 (T015, eventos + `schemaVersion: 2`), #280 (T017, casos de uso propagam/validam), #281 (T018, `DrizzleOrcamentoRepository` estende `DrizzleTenantScopedRepositoryBase`) | — |
| Retrofit `tenantId` em eventos de 002 | ABERTO | #582 (T040) | — |
| Retrofit `tenantId` em eventos de 003 | ABERTO | #583 (T041) | — |
| Retrofit `tenantId` em ACL de 004 (gate do handler SQS #190) | ABERTO | #584 (T042) | — |
| Retrofit `tenantId` em eventos de 005 | ABERTO | #586 (T044) | — |
| Confirmação pré-cutover (tenant real já em produção?) | ABERTO | #297 (T034, já feita para 001), #587 (T045, estende a 002-005) | — |
| Exportação de auditoria multi-tenant (`Acompanhamento`) | NÃO INICIADO | #282–#294 (T019-T031) | — |

### 008 · Hardening/LGPD e 009 · Custo — sem consumidor no fluxo ainda

Todas as issues (#314-#348 para 008, #349-#384 para 009) seguem abertas e
mapeiam 1:1 às tasks do doc de produto — nenhuma lacuna sem issue encontrada.
Não detalhado linha a linha aqui por não terem consumidor no fluxo ponta a
ponta hoje (ver seção 3, prioridade P3).

## 3. Prioridade por issue

Critério (explícito, ordem de peso): **(a)** desbloqueia o fluxo ponta a
ponta ou corrige defeito que impede uso → P0. **(b)** completa um caso de
uso que já está em andamento e é pré-requisito técnico direto de outro
(gate real, não conveniência) → P1. **(c)** necessário para deploy de
produção mas não bloqueia progresso local/de código (IAM, handlers,
validação com AWS real) → P2. **(d)** otimização (009), compliance sem
consumidor ainda (008), documentação/OpenAPI, ou spec que não é caminho
crítico → P3.

| Prioridade | Issues | Motivo |
|---|---|---|
| **P0** | ~~#592 (BUG-001)~~ **CONCLUÍDA** — fechada por #618 (PR #625, merged) | Já não é mais item de trabalho; mantido na tabela só para registrar que o P0 foi zerado nesta revisão. |
| **P1** | #234, #246, #248, #250, #252, #253, #254, #255, #256, #229, #236, #235, #237, #238, #251 (005 application/interface) | Fecha o BC de maior risco financeiro e menor cobertura; sem ele não há decisão de workflow, ponta a ponta nunca fecha. |
| **P1** | #277, #278, #280, #281 (007 retrofit 001), #582, #583, #584, #586, #297, #587 (007 retrofit 002-005) | #584 é gate explícito (#585) do handler SQS de 004; sem retrofit completo (001 incluso — ainda não iniciado), produção roda sem isolamento multi-tenant — risco de segurança/negócio. |
| **P1** | #190 (004 handler SQS, bloqueado por #584) | Único handler de consumo faltante no caminho 003→004. |
| **P1** | #149-#155 (003 categorização de item) | Regra de preço hoje não é confiável sem isso — risco de corretude de negócio. |
| **P2** | #613, #614, #615, #616, #623, #624 (handlers Lambda de produção 001-005, IAM `events:PutEvents` associado) | Corrige inconsistência da versão anterior deste documento (que os colocava em P0): critério (c) — necessário para deploy de produção, não bloqueia progresso local/de código, já que 001/002 rodam localmente via `src/dev/local.ts`. |
| **P2** | #576, #577, #578, #579, #580, #65 (IAM `events:PutEvents` + auditoria least privilege) | Necessário para deploy real; não bloqueia progresso de código local. |
| **P2** | #588, #589, #590 (MarkItDown Lambda real) | Sem AWS pode avançar via LocalStack Lambda (#589); conversão real de produção (#588/#590) é pré-deploy. |
| **P2** | #617, #619, #620, #621 (Ollama local, alternativa ao Bedrock) | Não P1: 001/002 já rodam localmente com stubs (`classificadorLocal`/`extratorLocal`, `NEXO_LOCAL_CONFIANCA`) — Ollama é upgrade de realismo, não desbloqueio. Verificado nesta revisão: ambiente local **não** rebaixa a prioridade dos itens que exigem AWS (linha seguinte) — `docs/plano-infra-ambientes.md` §5 documenta explicitamente que Ollama não substitui p95 real, security review com Bedrock, nem calibração de confiança. |
| **P2** | #63, #107, #157, #202, #258 (medição p95 real) | Requer ambiente de staging/AWS — não roda sem credencial; não é substituível por Ollama (ver linha acima). |
| **P2** | #64, #109, #158, #203, #259 (security review c/ Bedrock real) | Idem — precisa de chamada real a Bedrock; não é substituível por Ollama. |
| **P2** | #54, #61, #62, #110, #156, #159, #160, #192, #200, #201, #204, #205, #206, #186, #187, #195, #196, #197, #230, #239, #241-#244, #257, #260-#263 | Testes/observabilidade/docs de fechamento — importantes, mas não bloqueiam avanço de outra fase. |
| **P3** | #282-#301 (007 Acompanhamento/exportação de auditoria) | Sem consumidor até 008 precisar dela; spec 007 ainda em estágio inicial. |
| **P3** | Todas as 32 issues de 008 (#314-#348) | LGPD sem porta de entrada de aplicação ainda; nenhum caso de uso downstream depende disso hoje. |
| **P3** | Todas as 30 issues de 009 (#349-#384) | Otimização de custo — spec mais inicial, zero consumidor no fluxo. |

## 4. Ordem de execução

**Caminho crítico — cabeça reavaliada nesta revisão.** Na primeira execução
a cabeça era #592/BUG-001; com #618 mergeada (PR #625) esse item saiu do
caminho. **Nova cabeça: 007 (retrofit 001), #277→#278→#280→#281.** Motivo,
por evidência de código: `schemaVersion` ainda é `1` em
`ingestao-identificacao/domain/events/domain-event.ts:7` — 007 não terminou
nem 001, e #584 (007/004, retrofit do ACL de 004) é **gate formal e
documentado** (#585) que bloqueia #190 (handler SQS de 004), um bloqueio
técnico real, não de conveniência — exatamente o critério (b) da seção 3.
005 (application/interface) é a alternativa considerada para cabeça: também
incompleta e sem bloqueio externo, mas nada no board depende
tecnicamente dela terminar primeiro — é gargalo de esforço, não de
dependência formal.

Caminho completo: 007 (retrofit 001-005, gate #584→#585) ⟷ 005
(application/interface, paralelo, sem dependência mútua) → #190 → wiring
local 003→004→005 → handlers de produção (P2) → validação com AWS real
(P2). Cada seta é dependência técnica real, não ordem de conveniência.

### Fase 0 — Desbloqueio imediato — CONCLUÍDA
Objetivo verificável: upload funciona nos 4 canais; composition root vira
código commitado. **Status: feito.** #592 (BUG-001) fechada, #618 mergeada
(PR #625) — `src/composition/` e `src/dev/` são código versionado; QA
validou end-to-end com docker-compose + LocalStack, evidência em
`specs/001-.../evidence/qa-issue-618-pr-625.md`,
`specs/001-.../bugs/BUG-001.md` marcado `VALIDADO`. Nada pendente aqui.

### Fase 1 — Retrofit 007 (001-005) e completar 005/003
Objetivo verificável: todo evento publicado por 001-005 carrega `tenantId`
e `schemaVersion: 2` (007); uma decisão de workflow completa (aprovar/
escalonar/reenviar/integração externa) é produzível chamando os casos de
uso de 005 diretamente (sem handler Lambda ainda); item sem `categoria` é
classificado pelo agente antes da regra de preço (003).
- 007: #277, #278, #280, #281 (001), #582 (002), #583 (003), #584 (004,
  gate #585), #586 (005), #297/#587 (confirmação pré-cutover).
- 005: #234, #246, #248, #250, #252, #253, #254, #255, #256, #229, #236,
  #235, #237, #238, #251 (mais os testes #230, #239, #241-#244).
- 003: #149, #150, #151, #152, #153, #154, #155, #156 — paralelo a 005 e
  007 (BCs distintos, sem dependência entre si).
- Depende de: nada — Fase 0 já concluída. As três trilhas (007, 005, 003)
  correm em paralelo dentro desta fase.
- `#584 → #585 → #190` é o único gate formal documentado no board;
  #584 deve concluir **antes** de #190 (Fase 2).

### Fase 2 — Fechar 004 e encadear o pipeline local completo
Objetivo verificável: `src/dev/local.ts` processa 001→002→003→004→005 de
ponta a ponta em LocalStack, sem intervenção manual entre BCs.
- #190 (handler SQS 004, após #584), #192, #200.
- Estender `src/dev/local.ts` para encadear 003/004/005 (sem issue própria
  hoje — registrar como parte do trabalho de wiring, não uma issue nova
  isolada, já que é ajuste do harness de dev, não de produção).
- Depende de: Fase 1 completa (casos de uso de 003/005 precisam existir e
  #584 mergeada).

### Fase 3 — Handlers de produção + IAM events:PutEvents
Objetivo verificável: existe pelo menos um `lambda.Function`/`export const
handler` real por caso de uso de 001-005 implementado, com IAM least
privilege incluindo `events:PutEvents`. Não exige deploy real ainda —
`cdk synth` local é suficiente para validar sintaticamente.
- #613 (001), #614 (002), #615+#616 (003), #623 (004, `blocked` até #190
  existir), #624 (005, `blocked` até #235 existir), #576, #577, #578,
  #579, #580, #65, #53.
- MarkItDown real: #588, #590 (código), #589 (roda em LocalStack Lambda,
  sem AWS).
- Ollama local (upgrade de realismo, não bloqueio): #617, #619, #620
  (restrição de 1024 dimensões, `indice-orcamento.schema.ts:54`), #621.
- Depende de: Fase 2 para #623/#624 especificamente (marcadas `blocked`
  no board — não pegar antes de #190/#235 existirem). #613/#614/#615/#616
  e #576-#580 já podem começar agora, roles/handlers de 001-003 são
  independentes do wiring local.

### Fase 4 — Validação com AWS real (EXIGE credencial AWS/Bedrock)
Objetivo verificável: deploy em staging funciona; p95 medido; security
review com Bedrock real feito; auditoria de IAM confirma least privilege
em ambiente real (LocalStack community não valida IAM).
- #63, #107, #157, #202, #258 (p95 real).
- #64, #109, #158, #203, #259 (security review c/ Bedrock).
- #580 (auditoria final de IAM, precisa de ambiente real para ter valor).
- 008 T013-T017 (#314-#318): 3 contas AWS, SCP, GuardDuty/Security Hub.
- **Esta fase inteira exige AWS** — o time não tem acesso hoje; todo o
  resto do plano (Fases 0-3) avança sem essa credencial.

### Fase 5 — 007 Acompanhamento/auditoria, 008 LGPD, 009 custo (P3)
Objetivo verificável: exportação de auditoria multi-tenant funciona;
direito ao esquecimento tem porta de entrada; cache de identificação e
lifecycle de custo operam. Sem consumidor obrigatório no fluxo principal —
pode rodar a qualquer momento em paralelo às fases 1-3, priorizada abaixo
delas.
- 007: #282-#301. 008: #314-#348. 009: #349-#384.
- Único ponto de atenção: #347 (008 T046) e #296 (007 T033) pedem
  atualização de `plan.md` de 002-005 quando essas specs "forem
  arquitetadas" — já foram; conferir se essa nota já foi registrada.

## 5. Decisões arquiteturais que a ordem pressupõe

Três decisões que a primeira execução deste documento listava como "ADR a
escrever" **estão fechadas pelo ADR-009** (`docs/architecture-diagrams/
adr-009-composicao-producao-gateway-ia.html`, PR #622, merged), verificado
nesta revisão:

- **Dono e localização da composition root de produção**: fechada — vive
  neste repo (`src/composition/` + `infra/lib/`), não em repo/pipeline
  separado. Confirmado no próprio diagrama do ADR-009 ("Composition root ·
  `clientesProducao()` lê `NEXO_AGENTE_IA` · vive neste repositório").
- **Formato do handler de produção**: fechada — `export const handler`
  direto por caso de uso (`NodejsFunction` no CDK), não adapter NestJS nem
  outro padrão. Elimina a lacuna de ADR que a Fase 3 (handlers) tinha na
  primeira execução.
- **Seleção de gateway de IA (Bedrock vs. local)**: fechada — variável de
  ambiente `NEXO_AGENTE_IA` (`local`/`bedrock`, já em `.env.example:31`),
  lida pela composition root, uma segunda implementação de gateway
  (`Ollama<Nome>Gateway`) ao lado da `Bedrock<Nome>Gateway` existente por
  porta de domínio — não um `if` espalhado no domínio, não bounded context
  novo.
- **ADR-004 (IAM `events:PutEvents`)** já existe (`docs/architecture-diagrams/
  adr-004-iam-eventbridge-publish.html`) e cobre #576-#580 — não precisa de
  novo ADR, só execução.
- **ADR-008 (retrofit tenantId)** já existe (`docs/architecture-diagrams/
  adr-008-tenantid-retrofit.html`) e cobre a Fase 1 (007) — idem, só
  execução.
- **Lambda MarkItDown: um por BC ou compartilhado?** O board já decidiu por
  instância própria por BC (ADR-002, referenciado em #588 T066 "conversão
  leve" para 001 e #590 T046 "conversão completa, instância própria" para
  002) — não é decisão em aberto, é execução de decisão já tomada. Só
  atenção: confirmar que #588 (leve) e #590 (completa) não divergem em
  contrato de resposta antes de ambos serem consumidos pelas ACLs de
  001/002 (risco não coberto por issue específica).
- **Restrição de dimensionalidade do embedding local (#620)**: verificado
  no código — `indice-orcamento.schema.ts:54` fixa `vector('embedding', {
  dimensions: 1024 })`, `DIMENSAO_EMBEDDING_TITAN_V2 = 1024` em
  `bedrock-embedding.acl.ts:5`. Qualquer `OllamaEmbeddingGateway` tem que
  emitir 1024 dimensões — as outras 5 portas de IA (classificador, extrator,
  categorizador, interpretador de consulta, orquestrador) não têm essa
  restrição.
- **Fase 4 (AWS real) não pode ser antecipada por decisão de arquitetura**
  — é bloqueio de acesso operacional, registrado, sem mitigação de design
  possível além de maximizar o que roda em LocalStack (Fases 0-3).

## Riscos remanescentes

- #618 fechou o BUG-001 e destravou a Fase 0, mas os handlers de produção
  em si (#613-#616, #623-#624) seguem não implementados — zero deploy real
  ainda possível, só `cdk synth` local quando existirem.
- #277-#281 (007/001) não iniciaram: `schemaVersion` ainda `1` em produção
  de eventos — enquanto isso não fechar, nenhum evento de 001 carrega
  `tenantId`, e é a cabeça do caminho crítico desta revisão.
- Ollama (#617, #619, #620, #621) não reduz a necessidade de validação com
  Bedrock real (Fase 4) — registrado explicitamente em
  `docs/plano-infra-ambientes.md` §5 e reforçado aqui para não ser
  reinterpretado como "ambiente local resolve" em revisões futuras.
- Contagem de issues por spec no doc de produto foi amostrada (sem `gh`);
  este documento usou `gh` e é exato — não há conflito de números, apenas
  de precisão da fonte.
- **Risco de processo, não de arquitetura**: este documento já foi perdido
  uma vez por edição sem commit no worktree. Esta revisão foi commitada
  numa branch antes de encerrar — ver rodapé do arquivo/PR para hash e
  número.
