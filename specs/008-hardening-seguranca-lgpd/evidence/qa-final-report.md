# QA Final Report — T001-T003 (Phase 1: Setup)

> Ver seção "T011" ao final deste documento para a validação mais recente
> (teste de infraestrutura SCP segregação de ambientes, PR #508). O conteúdo
> abaixo documenta a validação histórica de T001-T003 e é preservado para
> rastreabilidade.

## SPEC_ID e versão testada
`008-hardening-seguranca-lgpd`. PR #407, branch `feat/008-hardening`,
commit `64ef79c`. Primeira validação (não é reteste; sem BUG anterior).

## Resumo executivo
Phase 1 é scaffolding puro: pastas de `src/platform/conformidade/**` e
`src/platform/shared-value-objects/domain/` (T001), schema Drizzle inicial
das 5 tabelas do schema `platform` + migrações (T002), confirmação de que
lint/tsc já cobrem `src/platform/**` sem config nova (T003). Nenhum VO,
agregado, caso de uso ou endpoint implementado ainda — critérios de aceite
funcionais de `spec.md` (US1-US4) não se aplicam a esta fase.

## Requisitos cobertos e não cobertos
- Critério estrutural (a) layout de pastas conforme `plan.md`: coberto, PASS.
- Critério (b) schema Drizzle reflete `plan.md` (Domain/Infrastructure) e
  gera migração sem erro: coberto, PASS.
- Critério (c) `pnpm typecheck`/`eslint src/platform` limpos: coberto, PASS.
- Nenhum RF/RN/RNF de `spec.md` (US1-US4) é exigível nesta fase.

## Suítes executadas e comandos
- `pnpm typecheck` (`tsc --noEmit`)
- `pnpm exec eslint src/platform`
- `pnpm db:generate` (já executado pelo dev-back-end antes do PR; migrações
  presentes e consistentes com o schema — não regerado neste QA para evitar
  diff espúrio no journal do Drizzle Kit, apenas inspecionado)
- `pnpm test` (`vitest run --passWithNoTests`), executado em dois pontos:
  baseline `cb343f5` (antes de T001) e HEAD do PR `64ef79c`, para isolar
  regressão

Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
0 testes automatizados novos (task de scaffolding, sem lógica a testar —
consistente com `tasks.md`, que só exige testes a partir de T004).

## Resultado: aprovados, falhos, ignorados e instáveis
`pnpm typecheck` e `pnpm exec eslint src/platform`: limpos, sem erro/warning.
`pnpm test`: 12 suítes falhando na inicialização (`Vitest failed to find the
runner`, erro do reporter `allure-vitest`) — **idêntico no baseline
pré-008 e no HEAD do PR**, ou seja, falha de infraestrutura de testes
preexistente, não regressão introduzida por este PR.

## Cobertura inicial e final
Não mensurável nesta fase — nenhum arquivo de produção com lógica
executável entra no diff (`platform.schema.ts` é declaração Drizzle
declarativa). Ver `qa/coverage-baseline.md` e `qa/coverage-final.md`.

## Allure
Não gerado — não aplicável (sem teste de runtime executando; ver
`qa/allure-report.md`).

## Bugs por severidade e status
Nenhum bug de produção aberto nesta validação.

## Riscos residuais
- A falha preexistente de `pnpm test` (reporter `allure-vitest` incompatível
  com a versão instalada do runner) bloqueia a execução de toda a suíte
  Vitest do repositório, inclusive testes já existentes de 001. Não é
  atribuível a este PR (confirmado idêntico no baseline), mas é um risco
  transversal: nenhuma suíte nova (T004 em diante, unit de VOs/agregado)
  poderá ser validada em runtime até essa infraestrutura ser corrigida.
  Recomenda-se investigação e correção da configuração de
  `vitest.config.ts`/`allure-vitest` antes do início da Phase 2, para não
  acumular dívida sobre um gate de QA que hoje não consegue rodar nada.
- Subpastas mais profundas do layout de `plan.md` (`domain/value-objects/`,
  `domain/events/`, `application/use-cases/`, `interface/http/`) ainda não
  existem — esperado, entram junto com T004+.

## Limitações do ambiente
Execução local via worktree isolado. `pnpm` via corepack falha sob Node 18
(bug conhecido de host-defined-options); testes rodados com Node 24.18.1
via nvm, conforme instrução do dev-back-end. Sem banco Aurora real
provisionado — não necessário para esta fase (`db:generate` é introspecção
de schema TS, offline).

## Parecer final
APROVADO COM RESSALVAS

Ressalva: falha preexistente de infraestrutura de testes (`allure-vitest` /
Vitest runner) impede execução de qualquer suíte no repositório, incluindo
a de 001 já existente. Não bloqueia este PR (scaffolding puro, sem lógica,
sem regressão comprovável — mesmo erro no baseline e no HEAD), mas deve ser
corrigida antes que T004+ (que exige testes unit reais) possa ser validada
por QA. Ação recomendada: dev-back-end ou DevOps investigar a config de
`vitest.config.ts`/`allure-vitest` como item da próxima task, não como
defeito desta.

---

# QA Final Report — T005 (VO PoliticaRetencao)

## SPEC_ID e versao testada
008-hardening-seguranca-lgpd. PR #437, branch feat/008-hardening-conformidade-t005,
commit 4db548f. Primeira validacao (nao e reteste; sem BUG anterior).

## Resumo executivo
T005 implementa o VO PoliticaRetencao (categoria, prazoEmDias, baseLegal,
atualizadaEm) com 3 erros de dominio proprios (PrazoEmDiasInvalidoError,
BaseLegalInvalidaError, AtualizadaEmInvalidaError, todos ErroDominio). Unico
arquivo de producao alterado: politica-retencao.vo.ts (novo). Teste unitario
com 9 casos cobre caminho valido, todos os ramos de erro e equals.

## Requisitos cobertos e nao cobertos
- Criterio de aceite da task ("teste unit cobrindo rejeicao de prazoEmDias <= 0"):
  coberto, PASS -- e ampliado para nao-inteiro, baseLegal vazia/whitespace e
  atualizadaEm invalida.
- Shape do VO conforme especificado pelo dev-back-end: confirmado por leitura
  de codigo, PASS.
- Nenhum outro RF/RN/RNF de spec.md (US1-US4) e exigivel por esta task isolada
  (VO puro, sem uso ainda por caso de uso/agregado).

## Suites executadas e comandos
- npx vitest run tests/platform/shared-value-objects/politica-retencao.vo.test.ts
- npx vitest run --reporter=default (suite completa, para regressao)
- npm test (config completa com reporter Allure)
- npx tsc --noEmit
- npx eslint no arquivo de producao e no teste
- npx vitest run --coverage (isolado no arquivo do VO)

Detalhe completo em qa/test-execution-report.md.

## Quantidade de testes por tipo
9 testes unitarios (ja entregues pelo dev-back-end junto com T005; QA validou,
sem necessidade de criar novos, por ja cobrirem o criterio de aceite e todos
os ramos de erro do VO).

## Resultado: aprovados, falhos, ignorados e instaveis
- politica-retencao.vo.test.ts: 9/9 aprovados.
- Suite completa (--reporter=default): 230 aprovados, 27 ignorados
  (skipped pre-existentes), 7 arquivos falhos -- todos por dependencia de
  runtime ausente em outros modulos (BC extracao/ingestao-identificacao),
  confirmados nao relacionados a este diff.
- tsc/eslint: sem erros.

## Cobertura inicial e final
Repositorio nao possui threshold de cobertura configurado. Para o arquivo em
diff, politica-retencao.vo.ts: todos os statements/branches exercitados pelos
9 testes (caminho valido + 3 ramos de erro + equals), confirmado por leitura
de codigo -- a tabela text do reporter v8 omite a linha individual do arquivo
(ver nota em qa/test-execution-report.md). Nenhuma lacuna de cobertura
conhecida para este VO.

## Allure
Gerado com sucesso nesta validacao -- allure-results/ contem os 9 resultados
de PoliticaRetencao. Ver qa/allure-report.md.

## Bugs por severidade e status
Nenhum bug de producao encontrado nesta validacao.

## Riscos residuais
- 7 arquivos de teste seguem falhando por dependencias de runtime ausentes
  (@aws-sdk/client-eventbridge, pino, @opentelemetry/instrumentation-aws-lambda)
  em modulos nao relacionados a 008 -- pre-existente, fora do escopo deste PR.
- Cobertura estrutural do repositorio como um todo ainda baixa (maior parte
  dos modulos de outros BCs sem teste) -- nao e escopo desta task.

## Limitacoes do ambiente
Nenhuma limitacao bloqueante identificada nesta validacao -- ao contrario do
registrado na Fase 1, a suite completa (incluindo o reporter Allure) rodou
sem erro de inicializacao neste ambiente/commit.

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T006 (VO DadoAnonimizado)

## SPEC_ID e versao testada
008-hardening-seguranca-lgpd. PR #439, branch feat/008-hardening-conformidade-t006,
commit dcb1190. Primeira validacao (nao e reteste; sem BUG anterior).

## Resumo executivo
T006 implementa o VO DadoAnonimizado (campoOriginal, metodo: MASCARAMENTO|REMOCAO,
aplicadoEm, solicitacaoId) — marcador de campo anonimizado, mesmo padrao de
CategoriaDocumento/PoliticaRetencao (private constructor + factory `de`). Unico
arquivo de producao alterado: dado-anonimizado.vo.ts (novo). Criterio de aceite
central da task e do plan.md (L107, L158): irreversibilidade — VO nunca expoe
getter/construtor que aceite o valor original de volta. Teste ja entregue pelo
dev-back-end cobre isso explicitamente; QA nao precisou estender.

## Requisitos cobertos e nao cobertos
- Irreversibilidade (plan.md L107/L158): coberto, PASS — teste verifica
  Object.keys(dado) restrito a [campoOriginal, metodo, aplicadoEm, solicitacaoId],
  ausencia de `valor`/`valorOriginal`, e leitura de codigo confirma private
  constructor sem metodo de reconstrucao a partir do dado original.
- Validacao de metodo restrito a MASCARAMENTO|REMOCAO: coberto.
- Rejeicao de campoOriginal/solicitacaoId vazios ou so espaco: coberto (it.each).
- Rejeicao de aplicadoEm invalida (Invalid Date): coberto.
- equals por valor (positivo e negativo): coberto.
- Nenhum outro RF/RN/RNF de spec.md (US1-US4) e exigivel por esta task isolada.

## Suites executadas e comandos
- npx vitest run --reporter=default (suite completa)
- npx vitest run --reporter=default tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts (isolado)
- npx vitest run --coverage --reporter=default tests/platform/shared-value-objects (cobertura do diretorio)
- npx eslint src/platform/shared-value-objects/domain/dado-anonimizado.vo.ts tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts
- npx tsc --noEmit -p tsconfig.json

## Quantidade de testes por tipo
10 testes unitarios (ja entregues pelo dev-back-end junto com T006; QA validou
sem necessidade de estender — cobrem o criterio de aceite de irreversibilidade
e todos os ramos de erro do VO).

## Resultado: aprovados, falhos, ignorados e instaveis
- dado-anonimizado.vo.test.ts: 10/10 aprovados.
- Suite completa (--reporter=default): 242 aprovados, 27 ignorados (skipped
  pre-existentes), 7 arquivos falhos por `Cannot find module`
  (@aws-sdk/client-*, pino, @opentelemetry/*) em modulos de outros
  BCs/infrastructure ja mergeados em commits anteriores — confirmado via
  `git show --stat dcb1190` que o diff deste PR contem apenas tasks.md +
  os 2 arquivos do VO. Nao relacionado a este PR.
- tsc --noEmit: mesmos modulos ausentes reportados; nenhum erro nos arquivos
  do VO DadoAnonimizado.
- eslint: sem violacoes.

## Cobertura inicial e final
Diretorio src/platform/shared-value-objects/domain (3 VOs: categoria-documento,
politica-retencao, dado-anonimizado): Statements 97.61% | Branch 100% |
Functions 94.44% | Lines 97.61%. Sem regressao de threshold (repositorio nao
possui threshold de cobertura configurado).

## Allure
Nao gerado nesta rodada — reporter --reporter=default usado como workaround
documentado para bug do adaptador allure-vitest neste ambiente (instrucao
explicita da invocacao). Evidencia de execucao registrada via output de
vitest run, reproduzivel localmente com os comandos acima.

## Bugs por severidade e status
Nenhum bug de producao encontrado nesta validacao.

## Riscos residuais
- 7 arquivos de teste seguem falhando por dependencias de runtime ausentes no
  node_modules do worktree (@aws-sdk/client-eventbridge, @aws-sdk/client-bedrock-runtime,
  @aws-sdk/client-lambda, pino, @opentelemetry/instrumentation-aws-lambda) em
  modulos de outros BCs — pre-existente, fora do escopo deste PR. Recomenda-se
  reinstalacao de dependencias (npm ci) neste worktree antes do proximo ciclo,
  para nao acumular falso-negativo em suites futuras.

## Limitacoes do ambiente
Allure HTML nao gerado (workaround de reporter aplicado conforme instrucao).
7 suites de outros BCs nao executaveis por dependencia de pacote ausente no
ambiente local — nao relacionado a este PR.

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T007 (VO ReferenciaTitular)

## SPEC_ID e versao testada
008-hardening-seguranca-lgpd. PR #441, branch feat/008-hardening-conformidade-t007,
commit 47c19bc. Primeira validacao (nao e reteste; sem BUG anterior nesta task).

## Resumo executivo
T007 implementa o VO ReferenciaTitular (src/platform/conformidade/domain/value-objects/referencia-titular.vo.ts)
— identifica o titular de dado pessoal de forma estavel entre BCs (ex.: e-mail
normalizado ou CNPJ+contato) sem expor a modelagem interna de nenhum BC
(plan.md L106). Opaco por design: normaliza (lowercase + trim) mas nao
interpreta formato. Arquivos de producao alterados: referencia-titular.vo.ts
(novo) e conformidade/domain/errors/erro-dominio.ts (novo — base de erro de
dominio local do modulo conformidade, primeira vez que esse modulo precisa de
um; mesmo padrao ja usado em shared-value-objects/ingestao-identificacao/extracao/validacao,
cada um com sua propria classe local, conforme ADR-004: "cada BC os declara
localmente — nunca import cross-BC").

## Requisitos cobertos e nao cobertos
- Criterio de aceite da task (identificar titular de forma estavel entre BCs
  sem expor modelagem interna, plan.md L106): coberto, PASS.
- Opacidade: VO nao valida/interpreta formato do valor (aceita qualquer texto
  nao vazio ate 320 chars) — confirmado por leitura de codigo.
- Normalizacao (lowercase + trim) garantindo que a mesma referencia logica com
  capitalizacao diferente resulte no mesmo VO: coberto, teste dedicado.
- Validacao de limite (vazio/whitespace rejeitado, >320 chars rejeitado, 320
  chars exato aceito): coberto.
- equals por valor normalizado: coberto.
- Nenhum outro RF/RN/RNF de spec.md (US1-US4) e exigivel por esta task isolada
  (VO puro, ainda sem uso por agregado/caso de uso — entra em T022+).

## Suites executadas e comandos
- npx vitest run --reporter=default tests/platform/conformidade
- npx vitest run --reporter=default (suite completa, para regressao)
- npx vitest run --coverage --coverage.reporter=json tests/platform/conformidade
- npx tsc --noEmit -p .
- npx eslint . --ext .ts

Detalhe completo em qa/test-execution-report.md.

## Quantidade de testes por tipo
7 testes unitarios (ja entregues pelo dev-back-end junto com T007; QA validou
sem necessidade de estender — cobrem o criterio de aceite, opacidade,
normalizacao, limites de tamanho e equals).

## Resultado: aprovados, falhos, ignorados e instaveis
- referencia-titular.vo.test.ts: 7/7 aprovados.
- Suite completa (--reporter=default): 249 aprovados, 27 ignorados (skipped
  pre-existentes), 7 arquivos falhos por Cannot find package (pino,
  @opentelemetry/instrumentation-aws-lambda e outros pacotes AWS/observability)
  em modulos de bounded-contexts/extracao e bounded-contexts/ingestao-identificacao —
  mesmos 7 ja registrados em T005/T006, confirmado via git show 47c19bc --stat
  que o diff deste PR nao toca esses modulos. Nao relacionado a este PR.
- tsc --noEmit / eslint: sem erro nos arquivos do diff.

## Cobertura inicial e final
Repositorio nao possui threshold de cobertura configurado. Para o arquivo em
diff, referencia-titular.vo.ts: 9/9 statements (100%), confirmado via
coverage-final.json (v8 json reporter, filtrado por caminho — a tabela texto
do reporter v8 nao lista o arquivo individualmente, mesma limitacao de
ferramental ja registrada em T005/T006). Nenhuma lacuna de cobertura conhecida
para este VO.

## Allure
Gerado com sucesso nesta validacao — allure-results/ contem os 7 resultados
de ReferenciaTitular (grep -rl "ReferenciaTitular" allure-results). Ver
qa/allure-report.md.

## Bugs por severidade e status
Nenhum bug de producao encontrado nesta validacao.

## Riscos residuais
- 7 arquivos de teste seguem falhando por dependencias de runtime ausentes no
  node_modules do worktree (pino, @opentelemetry/*, @aws-sdk/*) em modulos de
  outros BCs — pre-existente, fora do escopo deste PR, mesmo risco ja
  registrado em T005/T006. Recomenda-se reinstalacao de dependencias (npm ci)
  neste worktree antes do proximo ciclo.
- Novo `ErroDominio` local do modulo conformidade/domain: apenas 2 subclasses
  ate agora (ReferenciaTitularInvalidaError). Convencao correta segundo
  ADR-004, sem acao necessaria.

## Limitacoes do ambiente
Nenhuma limitacao bloqueante identificada nesta validacao alem da ja
registrada (pacotes AWS/observability ausentes, pre-existente e nao
relacionada a este diff).

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T009 (EventPublisher/EventBridgePublisher do componente Conformidade)

## SPEC_ID e versão testada
008-hardening-seguranca-lgpd. Issue #310, PR draft #447, branch
`feat/008-hardening-conformidade-t009`, commit `37ada19`. Primeira
validação (não é reteste; sem BUG anterior nesta task).

## Resumo executivo
T009 implementa `EventPublisher` (interface, Domain) e `EventBridgePublisher`
(implementação, Infrastructure) para o componente de plataforma Conformidade,
publicando no bus único `nexo-dominio-bus` com `source = nexo.conformidade` e
`detail-type` = nome do evento — mesmo shape e mesmo padrão já usado em 001
(`ingestao-identificacao`) e 002 (`extracao`). Arquivos de produção alterados:
`domain/gateways/event-publisher.ts` (novo) e
`infrastructure/eventbridge.publisher.ts` (novo). 3 testes unitários já
entregues pelo dev-back-end (publicação bem-sucedida, erro descritivo, fallback
de mensagem) validados sem necessidade de extensão.

## Requisitos cobertos e não cobertos
- Mesma interface `EventPublisher` da convenção de 001: coberto, PASS.
- Mesma instância de bus (`nexo-dominio-bus`, injetado via construtor): coberto, PASS.
- `source` fixo `nexo.conformidade`: coberto, PASS.
- `detail-type` = nome do evento: coberto, PASS.
- Sem mecanismo de publicação alternativo: coberto, PASS (leitura de código).
- Sem SDK AWS vazando para Domain: coberto, PASS (leitura de código — import
  de `@aws-sdk/client-eventbridge` confinado a Infrastructure).
- Nenhum outro RF/RN/RNF de `spec.md` (US1-US4) é exigível por esta task
  isolada (Foundational, ainda sem uso por caso de uso/agregado — entra em
  T022+).

**Observação registrada, não bloqueante**: a redação de `tasks.md` T009 pede
"reaproveitar (**import**, não reimplementar)" o padrão de 001. O código
entregue declara sua própria cópia local de interface+classe em
`platform/conformidade/`, sem import cross-contexto — mesmo padrão que 002
(`extracao`) já usa em relação a 001, e consistente com ADR-004 desta spec
("a convenção de 001, item 5, proíbe código compartilhado por import direto
entre contextos"). Todos os critérios de aceite tecnicamente verificáveis
(interface, bus, source, ausência de mecanismo alternativo, isolamento
Domain/SDK) estão satisfeitos — a divergência é entre a redação literal da
task e a convenção real e já estabelecida do repositório (reafirmada em
002, que precede esta task), não um defeito de implementação. Ver detalhe em
`qa/traceability-matrix.md` e `qa/test-execution-report.md`.

## Suítes executadas e comandos
- `pnpm vitest run --reporter=default tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts`
- `pnpm vitest run --reporter=default` (suíte completa, para regressão)
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/platform/conformidade tests/platform/conformidade`
- `pnpm vitest run --reporter=default --coverage --coverage.reporter=json tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts`

Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
3 testes unitários (já entregues pelo dev-back-end junto com T009; QA validou
sem necessidade de estender — cobrem publicação bem-sucedida, erro descritivo
do EventBridge e mensagem de fallback).

## Resultado: aprovados, falhos, ignorados e instáveis
- `eventbridge.publisher.test.ts`: 3/3 aprovados.
- Suíte completa (`--reporter=default`): 293 aprovados, 27 ignorados (skipped
  pré-existentes — suítes de integração Drizzle/schema que exigem Aurora
  local), **0 arquivos falhos** (60 arquivos passaram) — inclusive os 3
  testes que o dev-back-end reportou como falha pré-existente por timeout
  (`confirmar-upload.controller`, `upload-url.controller`,
  `auth-cognito.middleware`) passaram nesta execução.
- `tsc --noEmit`/`eslint`: sem erro.

## Cobertura inicial e final
Repositório não possui threshold de cobertura configurado. Para os arquivos
em diff: `eventbridge.publisher.ts` — Statements 7/7 (100%) | Branches 4/4
(100%) | Functions 2/2 (100%), confirmado via `coverage-final.json` (v8 json
reporter, filtrado por caminho). `event-publisher.ts` é apenas uma interface
TS (sem código executável em runtime, sem entrada em cobertura). Nenhuma
lacuna de cobertura conhecida para este PR.

## Allure
Não gerado nesta rodada — bug intermitente do adaptador `allure-vitest`
(`Vitest failed to find o runner`) se reproduziu nesta validação (já
registrado desde a Fase 1/T001). Contornado com `--reporter=default`
(mesmo workaround de T006), que não produz `allure-results`. Evidência de
execução registrada via saída de `vitest run` (ver `qa/test-execution-report.md`
e `qa/allure-report.md`).

## Bugs por severidade e status
Nenhum bug de produção encontrado nesta validação.

## Riscos residuais
- Adaptador `allure-vitest` segue não confiável neste ambiente (bug
  intermitente já registrado desde T001) — recomendação de investigar/corrigir
  `vitest.config.ts`/versão do `allure-vitest` permanece em aberto, fora do
  escopo de código de produção de T009.
- Divergência de redação entre `tasks.md` T009 ("import, não reimplementar")
  e a convenção real do repositório (cópia local por isolamento de contexto,
  já praticada em 002) — não bloqueante para este gate, mas recomenda-se ao
  Tech Lead/Arquiteto ajustar a redação de tasks futuras equivalentes para
  "reaproveitar o padrão" em vez de "import", evitando ambiguidade percebida
  em revisões futuras.

## Limitações do ambiente
Nenhuma limitação bloqueante identificada além da já registrada (reporter
Allure intermitente, contornável, sem impacto na validação funcional).

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T011 (Phase 3, US1: Segregação de Ambientes)

## SPEC_ID e versão testada
`008-hardening-seguranca-lgpd`. PR #508 (draft), branch
`feat/008-t011-scp-infra-test`, commit `8baa2ee`. Primeira validação (sem
BUG anterior).

## Resumo executivo
T011 não é código de domínio/aplicação/endpoint — é um teste de
infraestrutura (`infra/scripts/verificar-scp-segregacao-ambientes.sh`, via
`aws-cli`) que valida que a SCP (Service Control Policy) da conta AWS
dev/hml bloqueia `rds:CopyDBSnapshot`, `rds:RestoreDBInstanceFromDBSnapshot`
e `s3:CopyObject` com origem na conta de produção. Documentado para
Ricardo/DevOps executar manualmente ou via `workflow_dispatch`
(`.github/workflows/verificar-scp-segregacao-ambientes.yml`) — não roda no
CI padrão (push/PR), pois este repositório não tem credenciais AWS reais
nem as contas dev/hml/prod provisionadas (T013/T014/T015, fora do escopo
desta task). O backend-reviewer já aprovou (APPROVE WITH NITS) após uma
rodada de correção de 2 MAJOR (permissão de execução do script; limpeza
best-effort real de recurso órfão em caso de sucesso inesperado da ação
bloqueada) e 2 minor/nit (regex de explicit-deny mais específica; sufixo de
nome de recurso com nanossegundos).

**Limitação de ambiente, registrada explicitamente**: não há credenciais
AWS reais nem contas dev/hml/prod provisionadas neste ambiente de QA — a
execução do script contra AWS real (o cenário fim-a-fim que ele testa) não
pôde ser exercitada. A validação abaixo é estática (leitura), sintática
(YAML, `bash -n`) e lógica (mock local isolado da função `assert_bloqueado`
e da guarda de conta de produção, reproduzido de forma independente da
verificação já feita pelo backend-reviewer na correção). Ver "Limitações do
ambiente".

## Requisitos cobertos e não cobertos
- Permissão de execução do arquivo (`chmod +x`, MAJOR corrigido pelo
  dev-back-end): coberto, PASS — `git ls-files -s` confirma modo `100755`.
- Guarda de segurança contra rodar na conta de produção
  (`AWS_PROD_ACCOUNT_ID` vs. `aws sts get-caller-identity`) posicionada
  antes de qualquer chamada destrutiva: coberto, PASS — leitura de código
  (linhas 49-56, antes de qualquer `aws rds`/`aws s3api`, que só aparecem a
  partir da linha 109) + mock isolado simulando `CURRENT_ACCOUNT_ID ==
  AWS_PROD_ACCOUNT_ID` (aborta com `exit 1` antes de qualquer ação).
- Lógica de `assert_bloqueado` nos 3 desfechos possíveis: coberto, PASS —
  mock isolado (função extraída do script real via `awk`, executada com
  comandos fake, independente da verificação de correção já feita):
  - sucesso inesperado (simula vazamento) → `CRÍTICO` + `RESULTADO=1` +
    comando de limpeza best-effort efetivamente invocado;
  - falha por explicit deny de SCP (mensagem real do erro AWS) → `OK` +
    `RESULTADO=0`;
  - falha por outro motivo (ex. `ValidationException`, sem a frase de SCP)
    → `FALHA` + `RESULTADO=1`, não confundido com bloqueio por SCP.
- Regex de detecção de explicit-deny (`with an explicit deny in a service
  control policy`) restrita o suficiente para não casar com
  `AccessDenied`/`ValidationException` genéricos: coberto, PASS (extraída
  dinamicamente do script real no mock, não hardcoded pelo QA).
- Sufixo de nome de recurso com nanossegundos (`date +%s%N`) evita colisão
  entre execuções próximas: coberto, PASS — leitura de código.
- Workflow YAML sintaticamente válido: coberto, PASS — parseado com
  `js-yaml` (`npx js-yaml ...`) sem erro.
- Workflow dispara apenas via `workflow_dispatch` (nunca `push`/
  `pull_request`): coberto, PASS — chave `on` do YAML parseado contém
  exclusivamente `workflow_dispatch`.
- README documenta pré-requisitos (T013/T014/T015, snapshot/objeto de teste
  não sensíveis em prod) e uso (variáveis de ambiente, comando de execução,
  saída esperada): coberto, PASS — leitura manual comparada ao script e ao
  workflow, conteúdo consistente entre os 3 arquivos.
- **Não coberto (limitação de ambiente)**: execução real do script contra
  contas AWS dev/hml/prod verdadeiras, incluindo o comportamento real da
  SCP (T013/T014) e da role OIDC (T015) — nenhuma dessas dependências existe
  neste repositório/ambiente. Ver "Limitações do ambiente".

## Suítes executadas e comandos
- `git ls-files -s infra/scripts/verificar-scp-segregacao-ambientes.sh` —
  confirma modo `100755`.
- `bash -n infra/scripts/verificar-scp-segregacao-ambientes.sh` — sintaxe
  válida.
- `npx --yes js-yaml .github/workflows/verificar-scp-segregacao-ambientes.yml`
  — parse YAML sem erro; inspeção programática confirma `on` = apenas
  `workflow_dispatch`.
- Script de mock QA (scratchpad local, não versionado no repositório):
  extrai a função `assert_bloqueado` do script real via `awk` e a
  `SCP_DENY_REGEX` real via `grep`, executa em subshell isolado 3 cenários
  (sucesso inesperado / explicit deny / outro erro) com comandos fake no
  lugar de `aws-cli`, e testa a guarda de conta de produção com
  `CURRENT_ACCOUNT_ID` simulado. Não requer `shellcheck`/`python3`
  (indisponíveis neste ambiente Windows/Git Bash) — validação feita com as
  ferramentas efetivamente disponíveis (`bash`, `node`/`npx`).

Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
0 testes automatizados novos versionados no repositório — esta é uma task
de infraestrutura entregue como script standalone (não há suíte de
domínio/aplicação a estender). A validação de QA consistiu em 4 verificações
estáticas/sintáticas (permissão, sintaxe bash, YAML, trigger) e 4 cenários
de mock lógico isolado (guarda de produção + 3 desfechos de
`assert_bloqueado`), nenhum deles executando contra AWS real.

## Resultado: aprovados, falhos, ignorados e instáveis
Todas as 8 verificações acima: PASS. Nenhuma falha, nenhum teste ignorado
para ocultar problema. Execução real contra AWS não realizada (ver
"Limitações do ambiente") — não classificada como ignorada/instável, e sim
como fora do alcance possível neste ambiente.

## Cobertura inicial e final
Não aplicável — não há suíte de testes de código (vitest/cobertura v8) para
um script bash de infraestrutura. Repositório não possui ferramenta de
cobertura para shell scripts.

## Allure
Não aplicável a este tipo de entrega (script de infraestrutura fora do
runner de testes do monorepo). Nenhum `allure-results` gerado para T011.

## Bugs por severidade e status
Nenhum bug de produção encontrado nesta validação.

## Riscos residuais
- Execução real do script contra AWS dev/hml/prod segue não validada (só
  será possível após T013/T014/T015). Recomenda-se que Ricardo/DevOps
  execute o script assim que as contas/SCP/role OIDC estiverem prontas, e
  que o QA seja acionado novamente para validar a execução real antes de
  considerar a segregação de ambientes definitivamente comprovada em
  produção.
- Mock de QA cobre a lógica local do script, não substitui teste de
  integração contra a AWS real — mensagens de erro reais da AWS podem
  variar ligeiramente de ambiente/região/versão de `aws-cli`; a regex de
  detecção (`with an explicit deny in a service control policy`) deve ser
  reconfirmada na primeira execução real por Ricardo/DevOps.

## Limitações do ambiente
Confirmado: não há credenciais AWS reais, contas dev/hml/prod, SCP aplicada
nem role OIDC provisionadas neste ambiente/repositório (T013/T014/T015 são
tasks futuras, fora do escopo de T011). Não foi possível executar o script
fim-a-fim contra AWS real. Ferramentas auxiliares também limitadas no
ambiente Windows/Git Bash usado (`shellcheck` e `python3`/`pyyaml`
indisponíveis) — contornado com `bash -n` para sintaxe e `js-yaml` (via
`npx`) para validação do YAML, ambos suficientes para o escopo desta
verificação.

## Parecer final
APROVADO PELO QA
