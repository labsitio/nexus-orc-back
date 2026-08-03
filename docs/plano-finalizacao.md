# Plano de finalização — Nexo

Insumo: `docs/estado-funcionalidades.md` (gerente-produto, 2026-08-03). Este
documento não refaz o levantamento — responde onde estamos (síntese), o que
falta (issue a issue, confirmado no GitHub), e em que ordem fechar.

Verificação de issues: `gh issue list --state open --limit 500 --json
number,title,labels` (172 issues abertas, `gh` disponível neste ambiente —
diferente da nota de método do doc de produto, que rodou sem `gh`). Todos os
números de issue citados abaixo foram confirmados contra essa saída.

## 1. Onde estamos

001→002 é o trecho mais maduro, mas só executável localmente via canal SFTP
(BUG-001 quebra os outros 3 canais no primeiro passo). Não existe nenhum
`export const handler`/`lambda.Function` em `src/`/`infra/` — zero produção
implantável hoje; `src/composition/` é intenção não commitada. `src/dev/local.ts`
encadeia só 001→002; 003/004/005 não têm wiring de execução, nem local nem
produção. 003 (validação) está com domínio e application prontos, isolado.
004 tem application/domain prontos mas falta controller HTTP de busca
(issue já aberta, não é lacuna sem issue). 005 é o mais atrasado: domínio
pronto, application quase vazia (só 1 de ~5 casos de uso), interface HTTP
vazia — e é a decisão de maior risco financeiro da cadeia. 007 (tenantId)
só chegou a 001; 002-005 publicam evento sem tenant, e há gate explícito
(#585) impedindo o handler SQS de 004 mergear antes do retrofit. 008/009
estão em estágio inicial e sem consumidor no fluxo ainda. Divergência com o
doc de produto: concordo com o inventário; único ponto de atenção é a nota
de método — usei `gh` (disponível), o doc de produto não tinha; números
abaixo são exatos, não amostrados.

## 2. Fechamento de casos de uso

Convenção da tabela: "issues que o fecham" lista todas as issues abertas
necessárias (não apenas a task central). "O que ainda não tem issue" só é
preenchido quando confirmei ausência real no board.

### 001 · Ingestão e Classificação

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Upload multi-canal (portal/API/mobile) sem 400 | PARCIAL | #592 (BUG-001) | — |
| Handler Lambda de produção para os casos de uso já implementados de 001 | NÃO INICIADO | #576, #577, #579, #580 (IAM `events:PutEvents` das roles já definidas), #53 (IAM leitura consulta-status) | issue a criar: "Infrastructure: exportar `handler` de produção e `lambda.Function`/`NodejsFunction` no CDK para os 5 casos de uso de 001 já implementados (receber, classificar, confirmar-revisão, consultar-status), a partir da composition root de `src/composition/ingestao-identificacao.ts`" |
| Conversão real de documento (MarkItDown, não stub) | PARCIAL | #588 (T066, Lambda Python), #589 (T067, rodar no LocalStack Lambda) | — |
| Documentação/perf/segurança de fechamento da spec | ABERTO | #54, #61, #62, #63, #64, #65 | — |

### 002 · Extração de Dados

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Conversão real de documento (MarkItDown, instância própria ADR-002) | PARCIAL | #590 (T046) | — |
| Handler Lambda de produção do Extrator | NÃO INICIADO | #578 (IAM `events:PutEvents` `ExtratorLambdaRole`) | issue a criar: "Infrastructure: `export const handler` de produção para `ExtrairDadosOrcamento`" (mesmo padrão de 001) |
| Perf/segurança de fechamento | ABERTO | #107, #109, #110 | — |

### 003 · Validação de Consistência

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| `DrizzleFaixaPrecoRepository` (leitura) | achado — arquivo já existe no código | #385 (T023) | Não é lacuna de issue a criar — é possível pendência administrativa (fechar #385) ou lacuna residual (falta `upsert`, coberto por #153/T043). Recomendo: dono da spec 003 confirma no código antes de fechar #385; não fechar por suposição. |
| Categorização de item via agente (regra de preço não hardcoded) | NÃO INICIADO | #149, #150, #151, #152, #153, #154, #155 | — |
| Handler Lambda de produção do Validador | NÃO INICIADO | nenhuma issue de IAM `events:PutEvents` encontrada para `ValidarOrcamentoLambdaRole` nesta amostra | issue a criar: "IAM: `events:PutEvents` para `ValidarOrcamentoLambdaRole`" + "Infrastructure: `export const handler` de produção para `ValidarOrcamento`" |
| Perf/segurança/docs de fechamento | ABERTO | #156, #157, #158, #159, #160 | — |

### 004 · Indexação e Busca Semântica

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| Handler Lambda SQS `indexador-queue` | BLOQUEADO | #190 (T030) — **gate explícito #585: só mergeia depois de #584 (007 T042) mergeada** | — |
| Endpoint HTTP de busca em linguagem natural | ABERTO, issue já existe | #199 (T039, controller) — depende de #198 (T038, caso de uso `BuscarOrcamentos`, já apontado como implementado pelo doc de produto: confirmar se #198 pode ser fechada) | Não é lacuna sem issue — divergência a registrar: doc de produto descreveu como "lacuna sem porta de entrada", mas há issue #199 aberta cobrindo exatamente o controller. |
| IAM `IndexarOrcamentoLambdaRole` / `BuscarOrcamentosLambdaRole` | ABERTO | #192, #200 | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #186, #187, #195, #196, #197, #201, #202, #203, #204, #205, #206 | — |

### 005 · Orquestração de Workflow e Integrações

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
| `ConsolidarEDecidirWorkflow` completo (caminho confiança suficiente e insuficiente) | PARCIAL | #234 (T028, base), #246 (T040, caminho baixa confiança) | — |
| Escalonamento para comprador + decisão humana | NÃO INICIADO | #248 (T042, `RegistrarDecisaoHumanaWorkflow`), #250 (T044, controller `POST .../decisao-humana`), #237 (T031, auth Cognito) | — |
| Solicitação de reenvio ao fornecedor | NÃO INICIADO | #252 (T046, validação `motivoDadoAusente`), #254 (T048, integration test), #256 (T050, erro legível) — publicação em si é parte de #234/#246 | — |
| Integração externa disparada pela decisão | NÃO INICIADO | #253 (T047), #255 (T049, ADR-003) | — |
| Rastreabilidade da decisão (status) | NÃO INICIADO | #229 (T023, contract test), #236 (T030, controller status) | — |
| Handlers Lambda consumidores (3 filas) | NÃO INICIADO | #235 (T029) | — |
| IAM roles do BC | ABERTO | #238 (T032), #251 (T045) | — |
| Testes/perf/segurança/docs de fechamento | ABERTO | #230, #239, #241, #242, #243, #244, #257, #258, #259, #260, #261, #262, #263 | — |

### 007 · Isolamento Multi-tenant (retrofit 002-005)

| Caso de uso | Status | Issues que o fecham | Sem issue |
|---|---|---|---|
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
| **P0** | #592 (BUG-001) | Quebra upload em 3/4 canais — impede qualquer avanço nesses canais. |
| **P0** | issue a criar (handlers de produção 001/002) | Sem isso não existe deploy possível — bloqueio estrutural, sem issue hoje. |
| **P1** | #234, #246, #248, #250, #252, #253, #254, #255, #256, #229, #236, #235, #237, #238, #251 (005 application/interface) | Fecha o BC de maior risco financeiro e menor cobertura; sem ele não há decisão de workflow, ponta a ponta nunca fecha. |
| **P1** | #582, #583, #584, #586, #297, #587 (007 retrofit) | #584 é gate explícito (#585) do handler SQS de 004; sem retrofit, produção roda sem isolamento multi-tenant — risco de segurança/negócio. |
| **P1** | #190 (004 handler SQS, bloqueado por #584) | Único handler de consumo faltante no caminho 003→004. |
| **P1** | #199 (004 controller busca), confirmar #198 | Fecha lacuna de produto já sinalizada como risco (US2 de 004). |
| **P1** | #149-#155 (003 categorização de item) | Regra de preço hoje não é confiável sem isso — risco de corretude de negócio. |
| **P2** | #576, #577, #578, #579, #580, #65 (IAM `events:PutEvents` + auditoria least privilege) | Necessário para deploy real; não bloqueia progresso de código local. |
| **P2** | #588, #589, #590 (MarkItDown Lambda real) | Sem AWS pode avançar via LocalStack Lambda (#589); conversão real de produção (#588/#590) é pré-deploy. |
| **P2** | #63, #107, #157, #202, #258 (medição p95 real) | Requer ambiente de staging/AWS — não roda sem credencial. |
| **P2** | #64, #109, #158, #203, #259 (security review c/ Bedrock real) | Idem — precisa de chamada real a Bedrock. |
| **P2** | #54, #61, #62, #110, #156, #159, #160, #192, #200, #201, #204, #205, #206, #186, #187, #195, #196, #197, #230, #239, #241-#244, #257, #260-#263 | Testes/observabilidade/docs de fechamento — importantes, mas não bloqueiam avanço de outra fase. |
| **P2** | #385 | Confirmar antes de fechar — não tratar como bloqueio; ação é administrativa (ver seção 2). |
| **P3** | #282-#301 (007 Acompanhamento/exportação de auditoria) | Sem consumidor até 008 precisar dela; spec 007 ainda em estágio inicial (14/45 tasks). |
| **P3** | Todas as 32 issues de 008 (#314-#348) | LGPD sem porta de entrada de aplicação ainda; nenhum caso de uso downstream depende disso hoje. |
| **P3** | Todas as 30 issues de 009 (#349-#384) | Otimização de custo — spec mais inicial (5/36), zero consumidor no fluxo. |

## 4. Ordem de execução

**Caminho crítico**: #592 → (P1 005 application) → (P1 007 retrofit,
gate #584→#585) → #190 → wiring local 003→004→005 → handlers de produção
(P0/P2) → validação com AWS real (P2). Cada seta é dependência técnica
real, não ordem de conveniência.

### Fase 0 — Desbloqueio imediato (sem AWS, paralelizável)
Objetivo verificável: upload funciona nos 4 canais; composition root vira
código commitado.
- #592 (BUG-001) — corrigir checksum vazio no `S3ArmazenamentoBrutoGateway`.
- Commitar `src/composition/` como está (decisão arquitetural pendente, ver
  seção 5) e confirmar #385 com dono da 003.
- Paralelo dentro da fase: as duas linhas acima não se tocam.

### Fase 1 — Completar 005 (application/interface) e 003 (categorização)
Objetivo verificável: uma decisão de workflow completa (aprovar/escalonar/
reenviar/integração externa) é produzível chamando os casos de uso
diretamente (sem handler Lambda ainda); item sem `categoria` é classificado
pelo agente antes da regra de preço.
- 005: #234, #246, #248, #250, #252, #253, #254, #255, #256, #229, #236,
  #235, #237, #238, #251 (mais os testes #230, #239, #241-#244).
- 003: #149, #150, #151, #152, #153, #154, #155, #156 — paralelo a 005
  (BCs distintos, sem dependência entre si).
- Depende de: nada de fase 0 além do commit da composition root (para não
  perder o trabalho). Pode começar em paralelo à Fase 0.

### Fase 2 — Retrofit tenantId (007) em 002-005
Objetivo verificável: todo evento publicado por 002-005 carrega `tenantId`
e `schemaVersion: 2`; handler SQS de 004 pode mergear.
- #582 (002), #583 (003), #584 (004, gate #585), #586 (005), #297/#587
  (confirmação pré-cutover).
- Depende de: nenhuma dependência técnica da Fase 1 — pode rodar em
  paralelo a ela, mas #584 deve concluir **antes** de #190 (fase 3).
- `#584 → #585 → #190` é o único gate formal documentado no board.

### Fase 3 — Fechar 004 e encadear o pipeline local completo
Objetivo verificável: `src/dev/local.ts` processa 001→002→003→004→005 de
ponta a ponta em LocalStack, sem intervenção manual entre BCs.
- #190 (handler SQS 004, após #584), #199 (controller busca, confirmar
  #198), #192, #200.
- Estender `src/dev/local.ts` para encadear 003/004/005 (sem issue própria
  hoje — registrar como parte do trabalho de wiring, não uma issue nova
  isolada, já que é ajuste do harness de dev, não de produção).
- Depende de: Fase 1 completa (casos de uso de 003/005 precisam existir) e
  Fase 2 completa (#584 mergeada).

### Fase 4 — Handlers de produção + IAM events:PutEvents
Objetivo verificável: existe pelo menos um `lambda.Function`/`export const
handler` real por caso de uso de 001-005 implementado, com IAM least
privilege incluindo `events:PutEvents`. Não exige deploy real ainda —
`cdk synth` local é suficiente para validar sintaticamente.
- issue a criar (handlers 001/002, ver seção 2/3), issue a criar (handler
  003), #576, #577, #578, #579, #580, #65, #53.
- MarkItDown real: #588, #590 (código), #589 (roda em LocalStack Lambda,
  sem AWS).
- Depende de: Fase 3 (senão não há caso de uso estável para expor).
  Pode rodar em paralelo com Fase 3 na parte de IAM/CDK que não toca nos
  casos de uso ainda incompletos (ex.: #576-#580 já podem começar agora,
  já que as roles são independentes do wiring local).

### Fase 5 — Validação com AWS real (EXIGE credencial AWS/Bedrock)
Objetivo verificável: deploy em staging funciona; p95 medido; security
review com Bedrock real feito; auditoria de IAM confirma least privilege
em ambiente real (LocalStack community não valida IAM).
- #63, #107, #157, #202, #258 (p95 real).
- #64, #109, #158, #203, #259 (security review c/ Bedrock).
- #580 (auditoria final de IAM, precisa de ambiente real para ter valor).
- 008 T013-T017 (#314-#318): 3 contas AWS, SCP, GuardDuty/Security Hub.
- **Esta fase inteira exige AWS** — o time não tem acesso hoje; todo o
  resto do plano (Fases 0-4) avança sem essa credencial.

### Fase 6 — 007 Acompanhamento/auditoria, 008 LGPD, 009 custo (P3)
Objetivo verificável: exportação de auditoria multi-tenant funciona;
direito ao esquecimento tem porta de entrada; cache de identificação e
lifecycle de custo operam. Sem consumidor obrigatório no fluxo principal —
pode rodar a qualquer momento em paralelo às fases 1-4, priorizada abaixo
delas.
- 007: #282-#301. 008: #314-#348. 009: #349-#384.
- Único ponto de atenção: #347 (008 T046) e #296 (007 T033) pedem
  atualização de `plan.md` de 002-005 quando essas specs "forem
  arquitetadas" — já foram; conferir se essa nota já foi registrada.

## 5. Decisões arquiteturais que a ordem pressupõe

- **ADR a escrever — dono e localização da composition root de produção.**
  Hoje `src/composition/` tem 2 arquivos não commitados e nenhum
  `lambda.Function` existe no CDK (`infra/lib/*.ts` só define bus/filas/
  roles). Antes da Fase 4, decidir: a composition root de produção vive
  neste repo (`src/composition/` + `infra/lib/`) ou em repo/pipeline
  separado de propriedade do Ricardo/DevOps? Isso determina se as issues
  "a criar" desta seção são deste repo ou de outro.
- **ADR-004 (IAM `events:PutEvents`)** já existe (`docs/architecture-diagrams/
  adr-004-iam-eventbridge-publish.html`) e cobre #576-#580 — não precisa de
  novo ADR, só execução.
- **ADR-008 (retrofit tenantId)** já existe (`docs/architecture-diagrams/
  adr-008-tenantid-retrofit.html`) e cobre a Fase 2 — idem, só execução.
- **Lambda MarkItDown: um por BC ou compartilhado?** O board já decidiu por
  instância própria por BC (ADR-002, referenciado em #588 T066 "conversão
  leve" para 001 e #590 T046 "conversão completa, instância própria" para
  002) — não é decisão em aberto, é execução de decisão já tomada. Só
  atenção: confirmar que #588 (leve) e #590 (completa) não divergem em
  contrato de resposta antes de ambos serem consumidos pelas ACLs de
  001/002 (risco não coberto por issue específica).
- **Ausência de ADR para o gap de handlers de produção em si** — a decisão
  "como e onde exportar `handler`" (Lambda direto vs. NestJS adapter vs.
  outro) não tem ADR nem issue; recomendo que a issue a criar da Fase 4
  comece pedindo um ADR curto antes do código, dado que impacta 001-005
  igualmente (decisão transversal, não de uma spec só).
- **Fase 5 (AWS real) não pode ser antecipada por decisão de arquitetura**
  — é bloqueio de acesso operacional, registrado, sem mitigação de design
  possível além de maximizar o que roda em LocalStack (Fases 0-4).

## Riscos remanescentes

- Issues "a criar" citadas aqui (handlers de produção 001/002/003) não
  foram criadas nesta tarefa, por instrução explícita — ficam como
  recomendação para o dono do board abrir.
- #385 e a divergência #198/"lacuna sem porta de entrada" (004) precisam
  de confirmação humana antes de fechar ou de tratar como concluídas.
- Contagem de issues por spec no doc de produto foi amostrada (sem `gh`);
  este documento usou `gh` e é exato — não há conflito de números, apenas
  de precisão da fonte.
