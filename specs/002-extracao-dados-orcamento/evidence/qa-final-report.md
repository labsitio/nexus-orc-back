# QA Final Report — SPEC 002-extracao-dados-orcamento

## Validação — T023 (issue #88), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #485, branch `feat/002-t023-extrator-queue-handler`, commit `9d2d2e8`
(pós-rebase em `origin/main`).

### Resumo executivo
`criarExtratorQueueHandler` (Interface, novo) — handler Lambda consumidor de
`extrator-queue`. Parseia o envelope EventBridge de `OrcamentoClassificado`
(`detail.orcamentoId`, `detail.resultado.{fornecedorIdentificado,
formatoIdentificado,agenteOrigem}`, `detail.referenciaBruta.{bucket,key,
versionId}` — este último campo existe graças ao ADR-003/PR #483, já
mergeado), invoca `ExtrairDadosOrcamento.executar` (T022, já mergeado, código
de produção não alterado nesta PR), reporta batch item failures item-a-item
(Princípio IV — exceção nunca silenciosa, mensagem malformada ou erro isolado
não bloqueia as demais do lote), usa `criarLogger` (T016) para correlação por
`orcamentoId`+`messageId`. `backend-reviewer` já aprovou (APPROVE WITH NITS);
o único NIT (narrowing real de `agenteOrigem` contra o union
`'CLASSIFICADOR' | 'HUMANO'` em vez de só `typeof === 'string'`) foi corrigido
no próprio commit `9d2d2e8` — confirmado por leitura de diff, não apenas pelo
relato do dev-back-end.

### Requisitos cobertos (T023, tasks.md)
Todos os 7 cenários do arquivo de teste cobrem os critérios de aceite — ver
`qa/traceability-matrix.md` § "Leva T023" para o mapeamento cenário-a-cenário:
invocação com dados corretos do envelope, batch item failure isolado, envelope
inválido, envelope sem `referenciaBruta` (dependência do ADR-003 confirmada),
correlação de log, log de erro sem `orcamentoId` extraído, entrega duplicada
não quebra o handler (idempotência é responsabilidade de T022, handler só não
trata retorno normal como falha).

### Suítes executadas e comandos
```bash
npx vitest run
# Test Files  87 passed | 8 skipped (95) / Tests  431 passed | 40 skipped (471)
# sem regressão

npx vitest run tests/bounded-contexts/extracao/interface/extrator-queue.handler.test.ts --coverage
# 7/7 PASS
# extrator-queue.handler.ts: Stmts 89.65% / Branch 84.61% / Funcs 100% / Lines 89.65%

npx tsc --noEmit -p .
# sem erros

npx eslint src/bounded-contexts/extracao/interface/events/extrator-queue.handler.ts \
  tests/bounded-contexts/extracao/interface/extrator-queue.handler.test.ts
# sem erros
```
8 skipped na suíte completa = integração Postgres pré-existente sem
`DATABASE_URL`, não relacionado a esta PR.

### Cobertura (arquivo novo)
`extrator-queue.handler.ts`: Statements 89.65% (26/29), Branches 84.61%
(11/13), Functions 100%, Lines 89.65%. Não coberto: linhas 43/51/62 —
variações do guard `ehEventBridgeEnvelope` (root não-objeto; `orcamentoId`
ausente isoladamente; fallthrough de `resultado` inválido), mesma família de
branch defensivo já exercitada por 2 outros cenários de envelope inválido.
Classificado como cobertura estrutural residual de baixo risco, não caminho
de negócio distinto — não bloqueante.

### Diff da PR (escopo confirmado)
```
specs/002-extracao-dados-orcamento/tasks.md        |   2 +-
.../interface/events/extrator-queue.handler.ts     | 133 +++++++++++
.../interface/extrator-queue.handler.test.ts       | 166 +++++++++++
```
Nenhum arquivo de produção fora do handler foi tocado; `ExtrairDadosOrcamento`
(T022) não foi alterado.

### Bugs
Nenhum defeito de produção encontrado.

### Riscos residuais (fora do escopo desta PR, não bloqueante)
- `ExtrairDadosOrcamento` (T022, já mergeado) é idempotente apenas contra
  duplicidade **sequencial** de mensagens SQS (2ª mensagem chega depois que a
  1ª já persistiu com status != `PENDENTE`). Duas mensagens da mesma entrega
  duplicada processadas **concorrentemente** (at-least-once + Lambda com
  concorrência > 1) é uma race condition teoricamente possível, não coberta.
  Já registrado como MINOR pelo `backend-reviewer` e corretamente documentado
  como fora de escopo deste diff (pertence ao código de T022, não a este
  handler) — não gera BUG bloqueante nesta PR.

### Parecer final
**APROVADO PELO QA.**

Motivo: todos os critérios de aceite de T023 cobertos por teste automatizado
determinístico (7/7), incluindo batch item failure isolado, dependência do
ADR-003 (`referenciaBruta`), correlação de log e comportamento correto frente
a entrega duplicada; suíte completa sem regressão; typecheck e lint limpos;
NIT do backend-reviewer confirmado corrigido por leitura de diff; race
condition de concorrência em T022 corretamente identificada como risco
residual fora de escopo, não bloqueante para esta PR.

---

## Validação — T026 (issue #91), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #482, branch `feat/002-t026-extrator-lambda-role`, commit `88f86ba`
(pós-rebase em `origin/main`, ancestralidade confirmada com
`git merge-base --is-ancestor origin/main HEAD`).

### Resumo executivo
`ExtratorLambdaRoleStack` (infra, novo) — role IAM dedicada da Lambda do
Extrator: `bedrock:InvokeModel` restrito ao ARN do modelo aprovado
(`CfnParameter`), `s3:GetObject`/`GetObjectVersion` restrito a
`${orcamentosRawBucket.bucketArn}/*` (sem Put/Delete),
`lambda:InvokeFunction` restrito ao ARN do Lambda MarkItDown deste BC
(`CfnParameter`), `grantConsumeMessages` na `extrator-queue`. Réplica
mecânica byte-a-byte de `ClassificadorLambdaRoleStack` (spec-001, já
aprovado) — confirmado por diff lado a lado dos dois arquivos, apenas nomes
trocados (Extrator↔Classificador). Wiring em `infra/bin/app.ts` é bloco
contíguo, import em ordem alfabética, nenhuma outra stack do arquivo tocada
(confirmado por leitura completa do diff do commit). `backend-reviewer` já
aprovou (APPROVE WITH NITS).

### Requisitos cobertos (T026, tasks.md)
- `bedrock:InvokeModel` restrito a ARN via `CfnParameter`, nunca `Resource: "*"`.
- `s3:GetObject`/`GetObjectVersion` restrito ao bucket raw, sem `PutObject`/`DeleteObject`.
- `lambda:InvokeFunction` restrito ao ARN do Lambda MarkItDown via `CfnParameter`.
- `grantConsumeMessages` na fila própria (`extrator-queue`), sem permissão além do necessário.
- Nenhuma `PolicyStatement` com `Resource: "*"` — confirmado inspecionando o
  template CDK sintetizado (`ExtratorLambdaRoleStack.template.json`), não
  apenas por leitura do código-fonte.

### Achado confirmado, não é regressão (NIT #2 do backend-reviewer)
`s3:GetObject` é restrito ao bucket inteiro (`bucketArn/*`), não a um prefixo
específico como o texto da task sugere ("restrito ao prefixo do bucket raw").
Mesma lacuna já existe em `ClassificadorLambdaRoleStack` (spec-001, aprovado)
— não é regressão introduzida por esta PR; registrado como risco residual,
não bloqueante.

### Suítes executadas e comandos
```bash
cd infra && npx tsc --noEmit -p tsconfig.json
# sem erros, sem output

npx vitest run
# Test Files  86 passed | 8 skipped (94) / Tests  424 passed | 33 skipped (457)
# sem regressão (spec 003/007 mergearam em paralelo — suíte completa confere)

cd infra && npx cdk synth --app "node bin/app.ts"
# Successfully synthesized to cdk.out — todas as 13 stacks do app, incluindo
# ExtratorLambdaRoleStack, sem erro
```
Verificação adicional (não apenas leitura de código): template sintetizado
inspecionado programaticamente —
`ExtratorLambdaRoleStack.template.json` → `PolicyDocument.Statement`
confirma 4 statements (`bedrock:InvokeModel`, `s3:GetObject`/`GetObjectVersion`,
`lambda:InvokeFunction`, ações SQS de `grantConsumeMessages`), nenhum com
`Resource: "*"`.

Não há suíte de teste automatizado de CDK stack de IAM role neste repositório
(mesmo gap pré-existente já registrado para `classificador-lambda-role-stack.ts`,
spec-001) — verificação via `tsc --noEmit` + `cdk synth` + inspeção do
template sintetizado é o padrão já aceito pelo projeto para este tipo de task.

### Cobertura
N/A — task de infraestrutura (IaC), sem lógica de aplicação; projeto não mede
cobertura de stacks CDK (mesmo critério já registrado em `qa/coverage-baseline.md`).

### Bugs
Nenhum defeito de produção encontrado.

### Riscos residuais
- `s3:GetObject` restrito ao bucket inteiro, não a um prefixo — mesma lacuna
  pré-existente do padrão já aprovado em spec-001; não bloqueante, não é
  regressão desta PR.

### Parecer final
**APROVADO PELO QA.**

Motivo: todos os critérios de aceite de T026 confirmados por inspeção do
template CDK sintetizado (least privilege real, nenhum `Resource: "*"`);
wiring correto e isolado (nenhuma outra stack alterada); `tsc --noEmit` e
`cdk synth --app "node bin/app.ts"` limpos para as 13 stacks do app; suíte
completa (`npx vitest run`) sem regressão após merges paralelos de spec
003/007.

---

## Validação — T022 (issue #87), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #480 (draft), branch `feat/002-t022-extrair-dados-orcamento`, commits
`ec1f868` (implementação) + `aaff5d4` (correção de NIT do backend-reviewer).

### Resumo executivo
`ExtrairDadosOrcamento` (Application, novo) — caso de uso central de US1/US2:
consome `OrcamentoClassificado` já resolvido (orcamentoId, referenciaClassificacao,
referenciaBrutaS3 — resolução SQS é T023, fora de escopo), cria ou recupera
idempotentemente o agregado `ExtracaoOrcamento`, lê o bruto via `LeituraBrutaGateway`,
converte via `MarkItDownConversaoExtracaoACL`, invoca `AgenteExtratorGateway`,
aplica `registrarTentativaExtrator` (regra de negócio no agregado, T009 — a
Application nunca decide o status), persiste via `ExtracaoOrcamentoRepository.salvar`
e publica `OrcamentoExtraido` ou `ExtracaoEscalonadaParaRevisaoHumana` conforme
o status resultante do domínio. `backend-reviewer` já aprovou (APPROVE WITH NITS);
o único MINOR relevante (non-null assertion em `condicoesComerciais`) foi
corrigido em `aaff5d4` (lança `ExtracaoInconsistenteError` explícito em vez de
assumir); o segundo MINOR (concorrência otimista) já está coberto por
`SELECT ... FOR UPDATE` em `DrizzleExtracaoOrcamentoRepository.salvar` (T013,
já em `main`, fora do diff desta PR).

### Requisitos cobertos (T022, tasks.md / spec.md)
Todos os critérios de aceite listados no handoff desta task estão cobertos por
teste automatizado — ver `qa/traceability-matrix.md` § "Leva T022" para o
mapeamento cenário-a-cenário. Destaques verificados de forma independente (não
apenas pelo relato do dev-back-end):
- Idempotência contra entrega duplicada SQS: teste confirma que nenhum efeito
  colateral ocorre (`leituraBruta.chamadas === 0`, `agenteExtrator.chamadas === 0`,
  nada salvo, nada publicado) quando a extração já saiu de `PENDENTE` — não
  apenas que o evento final está ausente.
- Invariante "nunca inventa valor": teste do caminho de baixa confiança assere
  `precoUnitario.valor === null` diretamente no agregado persistido, não apenas
  no evento publicado.
- Guarda `ExtracaoInconsistenteError`: branch defensivo, correto por leitura de
  código, porém inalcançável dado o invariante atual do agregado (`completo()`
  exige `condicoesComerciais` preenchido antes de `EXTRAIDO`) — classificado
  como "código inviável de testar sem refatoração de produção", não é lacuna
  evitável.

### Suítes executadas e comandos
```bash
npx vitest run tests/bounded-contexts/extracao
# Test Files  49 passed | 4 skipped (53) / Tests  206 passed | 24 skipped (230)
# (4 skipped = integração Postgres pré-existente sem DATABASE_URL)

npx vitest run
# Test Files  161 passed | 14 skipped (175) / Tests  793 passed | 60 skipped (853)
# sem regressão

npx tsc --noEmit
# sem erros

npx eslint src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.ts \
  tests/bounded-contexts/extracao/application/extrair-dados-orcamento.test.ts \
  tests/bounded-contexts/extracao/application/extrair-dados-orcamento.integration.test.ts
# sem erros
```
Reporter Allure (`allure-vitest`, já configurado em `vitest.config.ts`, mesma
convenção do projeto) gerou `allure-results/` normalmente nesta execução
(1431 arquivos `*-result.json`) — sem a falha ambiental relatada em levas
anteriores (`qa/coverage-baseline.md`); nenhuma configuração nova introduzida.

### Cobertura (arquivo novo)
`extrair-dados-orcamento.ts`: Statements 92% (23/25), Branches 90% (9/10),
Functions 75% (3/4), Lines 92% (23/25). Não coberto: guarda `ExtracaoInconsistenteError`
(linhas 32/92) — ver justificativa acima e em `qa/test-execution-report.md`.

### Bugs
Nenhum defeito de produção encontrado nesta leva.

### Riscos residuais (fora do escopo desta leva)
- BUG-001 (severidade BAIXA, P3) segue `PRONTO PARA RETESTE` no handoff; leitura
  do código atual (`extracao-orcamento.aggregate.ts:123-125`) mostra que o
  getter `historico` já devolve cópia defensiva — não fechado formalmente aqui
  por não ter sido informado pelo dev-back-end como pronto para reteste nesta PR,
  e por não pertencer ao diff de T022.
- Handler Lambda de `extrator-queue` (T023) e endpoint de status (T024) ainda
  não existem — fora de escopo, não bloqueiam T022 isoladamente.

### Parecer final
**APROVADO PELO QA.**

Motivo: todos os critérios de aceite de T022 cobertos por teste automatizado
determinístico, incluindo idempotência (cenário crítico contra duplicidade
SQS at-least-once) e a invariante "nunca inventa valor"; nenhuma regressão na
suíte completa; typecheck e lint limpos; NIT do backend-reviewer confirmado
corrigido por leitura de diff, não apenas por declaração do dev-back-end.

---

## Validação — T019 (issue #84), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #457 (draft), branch `feat/002-t019-contract-test-status-extracao-v2`, commit `61c4670`

### Resumo executivo
Contract test (Zod) de `GET /v1/orcamentos/{orcamentoId}/extracao/status` em
`tests/bounded-contexts/extracao/contract/status.contract.test.ts`, contra o
schema novo `src/bounded-contexts/extracao/interface/http/status.schema.ts`.
Controller real (T024) ainda não existe — task define apenas o contrato de
borda, a ser reusado quando T024 for implementada. `backend-reviewer` já
aprovou (APPROVE WITH NITS).

### Verificação independente do contrato contra o domínio real
Confirmado por leitura de cada VO (não apenas do relato do dev-back-end):
- `STATUS_EXTRACAO` (`extracao-orcamento.aggregate.ts`) ≡ `z.enum(STATUS_EXTRACAO)`.
- `AGENTES_ORIGEM_CAMPO` (`campo-extraido.vo.ts`, `['EXTRATOR','HUMANO']`) ≡
  `agenteOrigem`/`agente` no schema.
- `NivelConfianca.valor` (inteiro 0–100) ≡ `confianca: z.number().int().min(0).max(100)`.
- `Dinheiro.paraPayload()` (`valorCentavos`/`moeda`) ≡ `dinheiroResponseSchema`.
- `DescricaoProduto.paraPayload()` (`descricao`/`sku?`) ≡ `descricaoProdutoResponseSchema`.
- `ItemOrcamento.paraPayload()` (descricao/quantidade/precoUnitario, cada um
  `CampoExtraidoPayload<T>`) ≡ `itemOrcamentoResponseSchema`.
- `CondicoesComerciais.paraPayload()` (condicoesPagamento/prazoValidade/
  condicoesEntrega) ≡ `condicoesComerciaisResponseSchema`; `PeriodoValidade.paraPayload()`
  devolve ISO 8601 ≡ `z.string().datetime()`.
- `TentativaExtracao` (agente/timestamp/resultado?/motivoInsucesso?) ≡
  `tentativaExtracaoResponseSchema` — nota: o VO não tem `paraPayload()` e usa
  `undefined` (não `null`) no campo ausente; mapear `undefined → null` fica a
  cargo do controller real (T024, fora do escopo desta task), não é defeito
  desta PR.

### Verificação de "falha pelo motivo certo" (Karpathy checklist)
Alterado temporariamente `confianca: min(0)` → `min(1)` no schema, reexecutado
o teste — 2/9 falharam exatamente nos cenários com `confianca: 0`
(`PENDENTE_REVISAO_HUMANA`), erro Zod "Too small: expected number to be >=1".
Revertido via `git checkout --`, working tree confirmado limpo. Teste é
sensível ao contrato real, não um teste que passa por acidente.

### Suítes executadas e comandos
```bash
PATH="<nvm 24.14.1>/bin:$PATH" ./node_modules/.bin/vitest run \
  tests/bounded-contexts/extracao/contract/status.contract.test.ts --reporter=default
# Test Files  1 passed (1) / Tests  9 passed (9)

PATH="<nvm 24.14.1>/bin:$PATH" ./node_modules/.bin/vitest run \
  tests/bounded-contexts/extracao/ --reporter=default
# Test Files  21 passed | 2 skipped (23) / Tests  88 passed | 12 skipped (100)
# (2 skipped = testes de integração Postgres pré-existentes sem DATABASE_URL,
# não relacionados a esta task)

PATH="<nvm 24.14.1>/bin:$PATH" ./node_modules/.bin/tsc --noEmit
# sem erros

PATH="<nvm 24.14.1>/bin:$PATH" ./node_modules/.bin/eslint \
  src/bounded-contexts/extracao/interface/http/status.schema.ts \
  tests/bounded-contexts/extracao/contract/status.contract.test.ts
# sem erros
```
Reporter Allure indisponível neste ambiente ("Vitest failed to find the
runner") — falha de infraestrutura pré-existente, não desta task (mesma
limitação já registrada em `qa/coverage-baseline.md`); execução feita com
`--reporter=default`.

### Cobertura
Não medida isoladamente com precisão — `--coverage` no repo completo com
apenas este arquivo de teste em execução produz números de statements/lines
não confiáveis para `status.schema.ts` (artefato conhecido do instrumentador
v8 quando poucos arquivos são exercitados contra uma base instrumentada
inteira). Branches/functions do arquivo novo: 100%. Sem lógica de negócio no
schema (apenas definição declarativa Zod) — risco de cobertura não medida é
baixo.

### Bugs
Nenhum defeito de produção encontrado.

### Parecer
**APROVADO PELO QA.**

---

## Validação — T018 (issue #83), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #451, branch `feat/002-t018-markitdown-conversao-extracao-acl`, commit `a8ff244`

### Resumo executivo
`sanitizarConteudoExtracao` (Infrastructure, novo) + `MarkItDownConversaoExtracaoACL`
(Infrastructure, novo, implementa contrato de T011) do BC Extração. Nenhuma
outra task do BC previa a implementação real do ACL — criada junto com o unit
test de T018 por exigir uma implementação real para exercitar; réplica
mecânica byte-a-byte da lógica de sanitização já aprovada em spec-001
(`sanitizar-conteudo-documento.ts` / `markitdown-conversao.acl.ts`), instância
própria deste BC (ADR-002). `backend-reviewer` já aprovou (APPROVE WITH NITS,
2 NITs cosméticos não bloqueantes sobre o limite de 500ms do teste de DoS).

### Requisitos cobertos (T018, tasks.md)
- Unit test do `MarkItDownConversaoExtracaoACL` mockando saída do MarkItDown.
- Sanitização de conteúdo antes de compor prompt — mitigação de prompt
  injection (caracteres de controle usados para ofuscar instrução removidos,
  texto literal preservado, nunca interpretado).
- Mitigação de DoS: limite de tamanho de saída (50.000 chars) e limite de
  varredura de entrada (10x o limite de saída) — verificado empiricamente que
  o teste de 500ms não está frouxo (ver `qa/test-execution-report.md`).

### Achado verificado (não é defeito) — limite de 500ms do teste de DoS
Medido sob `--coverage`: implementação atual ~102ms, regressão simulada (sem o
limite de varredura de entrada) ~1676ms. Margem suficiente nos dois sentidos —
teste continua útil.

### Lacuna conhecida / risco residual (fora do escopo desta leva)
- BUG-001 (severidade BAIXA, P3, spec 002) segue `PRONTO PARA RETESTE`, não
  relacionado a T018.
- Par de spec-001 do teste de DoS (limite de 200ms) reproduziu-se como flaky
  sob `--coverage` no full-suite run desta validação (passou isolado) —
  confirma o relato do dev-back-end/backend-reviewer. Nenhum arquivo de
  spec-001 foi alterado nesta PR; nenhum BUG novo aberto por este achado.

### Suítes executadas e comandos
```bash
npx vitest run
# Test Files  67 passed | 6 skipped (73)
#      Tests  322 passed | 27 skipped (349)

npx vitest run --coverage
# mesmo resultado, exceto 1 falha isolada no par de spec-001 (ver acima)

npx tsc --noEmit
# sem erros

npx eslint src/bounded-contexts/extracao/infrastructure/sanitizar-conteudo-extracao.ts \
  src/bounded-contexts/extracao/infrastructure/markitdown-conversao-extracao.acl.ts \
  tests/bounded-contexts/extracao/infrastructure/sanitizar-conteudo-extracao.test.ts \
  tests/bounded-contexts/extracao/infrastructure/markitdown-conversao-extracao.acl.test.ts
# sem erros
```

### Cobertura (arquivos novos)
- `sanitizar-conteudo-extracao.ts`: 100% stmts/functions/lines, 96.29% branches.
- `markitdown-conversao-extracao.acl.ts`: 100% stmts/branches/functions/lines.

### Bugs
Nenhum defeito de produção encontrado.

### Parecer
**APROVADO PELO QA.**

---

## Validação — T015 (issue #80), primeira validação

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #429, branch `feat/002-t015-eventbridge-publisher`, commit `3580e09`

### Resumo executivo
`EventPublisher` (Domain, novo) + `EventBridgePublisher` (Infrastructure, novo)
do BC Extração. Réplica do contrato já usado em spec-001, instância própria
(nunca compartilha client entre BCs), `source` fixo `nexo.extracao`, mesmo bus
`nexo-dominio-bus`, erro descritivo (com fallback) quando `PutEventsCommand`
reporta `FailedEntryCount > 0`. `backend-reviewer` já aprovou (1 NIT cosmético
em `tasks.md`/T011, não bloqueante).

### Requisitos cobertos
- Publica com `source`/`detail-type`/bus corretos (contrato).
- Erro descritivo com `ErrorMessage` do EventBridge.
- Erro com fallback quando `ErrorMessage` ausente.

### Lacuna conhecida
Sem LocalStack neste worktree — sem teste de integração real contra
EventBridge. Mitigado por mock fiel ao shape do SDK; risco residual (retries,
throttling reais) não é do escopo de T015.

### Suítes executadas e comandos
```bash
npx vitest run
# Test Files  49 passed | 6 skipped (55)
#      Tests  224 passed | 27 skipped (251)

npx tsc --noEmit
# sem erros

npx eslint src/bounded-contexts/extracao/domain/gateways/event-publisher.ts \
  src/bounded-contexts/extracao/infrastructure/eventbridge.publisher.ts \
  tests/bounded-contexts/extracao/infrastructure/eventbridge.publisher.test.ts
# sem erros
```
Os 6 arquivos skipped são testes de integração Postgres/schema pré-existentes
(`describe.skipIf` sem `DATABASE_URL`), não relacionados a esta PR.

### Cobertura
`eventbridge.publisher.ts`: 3 branches exercitados (sucesso, erro com
`ErrorMessage`, erro sem `ErrorMessage`) — 100% das linhas e branches do
arquivo novo.

### Bugs
Nenhum. Nenhum defeito de produção encontrado.

### Parecer final
**APROVADO PELO QA** — critérios de aceite de T015 satisfeitos, suíte completa
sem regressão, typecheck e lint limpos.

---

## Reteste — T012 (issue #77), BUG-003 corrigido

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #423 (draft), branch `feat/002-t012-extracao-schema-drizzle`, commit `97bf2fc`

### Resumo executivo
Correção da migração `drizzle/0005_small_captain_america.sql` (BUG-003):
`ALTER COLUMN "id" SET DATA TYPE bigserial` (SQL inválido) substituído pela
expansão manual real de `bigserial` — `DROP DEFAULT` → `ALTER COLUMN ... TYPE
bigint USING NULL` → `CREATE SEQUENCE` própria → `SET DEFAULT nextval(...)` →
`SET NOT NULL`. Constraint de PK original não foi tocada. Único arquivo de
produção alterado é a migração; schema TS e teste de integração não mudaram.

### Reteste independente do QA (não baseado no relato do dev-back-end)
```bash
docker run -d --name qa-bug003-pg -e POSTGRES_USER=nexo -e POSTGRES_PASSWORD=nexo \
  -e POSTGRES_DB=nexo -p 0:5432 pgvector/pgvector:pg16
for f in drizzle/000{0,1,2,3,4,5,6}*.sql; do
  psql -h localhost -p <porta> -U nexo -d nexo -v ON_ERROR_STOP=1 -f "$f"
done
# todas as 7 migrações aplicaram sem erro

DATABASE_URL=postgresql://nexo:nexo@localhost:<porta>/nexo \
  npx vitest run tests/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.test.ts
# Test Files 1 passed (1) / Tests 7 passed (7)

DATABASE_URL=... npx drizzle-kit generate
# "No schema changes, nothing to migrate"

npx vitest run
# Test Files 38 passed | 4 skipped (42) / Tests 176 passed | 19 skipped (195)
```
`\d extracao.extracoes_orcamento_historico` confirmado: `id bigint not null
default nextval('extracao.extracoes_orcamento_historico_id_seq'::regclass)`,
PK `extracoes_orcamento_historico_pkey` intacta.

### Resultado: aprovados, falhos, ignorados e instáveis
7/7 no teste de integração alvo (antes: 2 passed/5 failed). 176 passed/19
skipped na suíte completa, sem `DATABASE_URL` — mesma baseline da leva
anterior, sem regressão.

### Bugs por severidade e status
- CRÍTICA (1): BUG-003 — **VALIDADO** pelo QA neste reteste.
- Herdados, não relacionados a esta correção: BUG-001 (BAIXA, PRONTO PARA
  RETESTE), BUG-002 (VALIDADO).

### Riscos residuais
Nenhum novo. BUG-001 (nit de encapsulamento, severidade BAIXA) segue aberto
para reteste em leva futura, fora do escopo desta correção.

### Parecer final
**APROVADO PELO QA**

Motivo: BUG-003 corrigido e validado de forma independente contra Postgres 16
real, reproduzindo o cenário exato que causava a falha original (baseline T002
→ aplicar 0005+0006). Sem regressão na suíte completa. Libera T013.

---

## Leva anterior (REPROVADA) — T012 (issue #77)

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #423 (draft), branch `feat/002-t012-extracao-schema-drizzle`, commit `27409c6`

### Resumo executivo
T012 evolui o schema Drizzle (baseline vazio da T002) para as colunas reais de
`extracao.extracoes_orcamento` e `extracao.extracoes_orcamento_historico`
(ADR-004: itens/condições comerciais em JSONB; histórico append-only via
trigger hand-authored, mesmo padrão da spec 001). O código TypeScript do
schema está correto e corresponde exatamente à migração commitada (`drizzle-kit
generate` não aponta diff pendente), e o teste de integração escrito pelo
dev-back-end é completo (CHECKs, índice, triggers, defaults). Porém a migração
gerada (`0005_small_captain_america.sql`) contém um statement SQL inválido
(`ALTER COLUMN ... SET DATA TYPE bigserial`) que quebra `drizzle-kit migrate`
em Postgres real a partir do baseline — confirmado rodando contra um Postgres
16 real via `docker compose`, não apenas por leitura de código. Isso derruba
o próprio teste de integração (5/7 falhas) e o step `db:migrate` do CI. Ver
BUG-003.

### Requisitos cobertos e não cobertos
Cobertos (estático + integração real):
- Schema TS ≡ migração commitada (sem diff pendente em `drizzle-kit generate`).
- Colunas, tipos e defaults de `extracoes_orcamento` conforme ADR-004
  (verificado com Postgres real, apesar da migração 0005 falhar — as colunas
  desta tabela específica migram com sucesso, só a mudança de tipo do `id`
  de `extracoes_orcamento_historico` quebra).
- CHECK de `status` e `referencia_classificacao_agente_origem` (verificado
  em Postgres real).

Não cobertos / bloqueado por BUG-003:
- Migração aplicando de ponta a ponta em Postgres real a partir do baseline.
- CHECKs e triggers de `extracoes_orcamento_historico` (agente_valido,
  sucesso_xor_insucesso, append-only UPDATE/DELETE) — o teste que os exercita
  falha antes de chegar à asserção de negócio, porque o INSERT básico já
  falha (coluna `id` não migrada).

### Suítes executadas e comandos
```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo
npx tsc --noEmit                      # OK
npx eslint src/.../extracao-orcamento.schema.ts tests/.../extracao-orcamento.schema.test.ts   # OK
npx drizzle-kit generate              # "No schema changes, nothing to migrate"
npx drizzle-kit migrate               # FAIL, exit 1
npx vitest run tests/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.test.ts
# 5 failed | 2 passed (7)
```

### Quantidade de testes por tipo
1 arquivo de teste de integração (Postgres real), 7 casos: 2 passaram, 5
falharam por BUG-003. Sem testes unitários nesta task (escopo é só schema +
migração, sem lógica de aplicação).

### Resultado: aprovados, falhos, ignorados e instáveis
- Sem `DATABASE_URL`: 7 skipped (comportamento correto, não quebra o restante
  da suíte).
- Com `DATABASE_URL` (Postgres real): 2 passed, 5 failed — determinístico,
  reproduzido 2x.
- `tsc --noEmit`: OK. `eslint`: OK.

### Cobertura inicial e final
N/A — task de schema/migração (DDL), sem lógica de aplicação; projeto não
mede cobertura de arquivos de schema Drizzle (mesmo critério já registrado em
`qa/coverage-baseline.md` para VOs/agregado desta spec).

### Local do allure-results e do relatório Allure
N/A nesta leva — sem execução via Vitest com reporter Allure habilitado
(gap ambiental pré-existente, ver `qa/coverage-baseline.md`); evidência
coletada via saída direta do `vitest run` e do `psql`.

### Bugs por severidade e status
- CRÍTICA (1): BUG-003 — migração 0005 (T012) quebra em Postgres real
  (`ALTER COLUMN ... SET DATA TYPE bigserial` inválido). ABERTO, bloqueante.
- Herdados de leva anterior, não relacionados a esta task: BUG-001 (BAIXA,
  PRONTO PARA RETESTE), BUG-002 (VALIDADO).

### Riscos residuais
- BUG-003 bloqueia merge e bloqueia T013 (repositório) — ver handoff.
- Ambiente de QA tinha Postgres nativo conflitando na porta 5432; contornado
  com remapeamento de porta local — não afeta CI, apenas retardou o
  diagnóstico (documentado em `qa/test-execution-report.md`).

### Limitações do ambiente
Nenhuma limitação bloqueante: Docker disponível, `docker-compose.yml` do
projeto usado para subir Postgres 16 real e validar de fato as constraints/
triggers/migração — não apenas compilação estática.

### Parecer final
**REPROVADO — DEVOLVIDO AO DEV-BACK-END**

Motivo: BUG-003 (CRÍTICA) — a migração gerada para T012 não aplica em
Postgres real a partir do baseline, quebrando `db:migrate` do CI e o próprio
teste de integração escrito para esta task. O schema TypeScript e o teste de
integração em si estão corretos e não precisam de alteração; o defeito está
exclusivamente no SQL da migração `0005_small_captain_america.sql`.

---

## Leva anterior — T004 (issue #69)

### SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #420 (draft), branch `feat/002-t004-eventbridge-rule-extrator-queue`, commit `5ecb355`

### Resumo executivo
T004 provisiona a regra EventBridge que roteia `OrcamentoClassificado`
(`source: nexo.ingestao-identificacao`) do bus `nexo-dominio-bus` para
`extrator-queue` (fila/DLQ da T003, já em produção). A lógica da regra em si
está correta (`eventPattern` com source/detailType certos, target `SqsQueue`,
`eventBus` importado por referência via `dominioBus: events.IEventBus`).
Porém o commit também introduziu, em `infra/bin/app.ts`, import e instanciação
de `ValidadorQueueStack` — stack de outro branch (spec 003, `feat/003-t003-validador-queue`),
cujo arquivo-fonte não existe na árvore deste commit. Isso quebra
`typecheck:infra` e `cdk synth` para todo o app CDK em qualquer checkout
limpo (CI incluso). Ver BUG-002.

### Requisitos cobertos e não cobertos
Cobertos (lógica da regra, por leitura de código + synth em worktree com o
arquivo de outro branch presente, reproduzindo o que o dev-back-end validou):
- `eventPattern.source: ['nexo.ingestao-identificacao']`
- `eventPattern.detailType: ['OrcamentoClassificado']`
- Target `SqsQueue(extratorQueue)`
- `eventBus` referenciando o bus único via prop `dominioBus` (não recria bus)

Não cobertos / bloqueado:
- Build/CI end-to-end do app CDK a partir de um checkout limpo — falha por
  BUG-002 (import de módulo inexistente na árvore commitada).

### Suítes executadas e comandos
```bash
# reprodução isolada, sem arquivos untracked de outro branch
git worktree add /tmp/qa-clean 5ecb355
cd /tmp/qa-clean && ln -s <repo>/node_modules node_modules
npm run typecheck:infra
npx cdk synth --app "npx tsx infra/bin/app.ts" ExtratorQueueStack

# no working tree principal (arquivo untracked da spec 003 presente)
npx eslint infra/lib/extrator-queue-stack.ts infra/bin/app.ts
```
Não existe suíte automatizada de CDK stack neste projeto (nem para o stack
irmão `classificador-queue-stack.ts`, spec 001) — gap pré-existente, não
introduzido por esta task.

### Quantidade de testes por tipo
N/A — task de infraestrutura (IaC), sem código de aplicação. Verificação por
typecheck + synth, não há suíte de unidade/integração aplicável nem pré-existente
para stacks CDK neste repositório.

### Resultado: aprovados, falhos, ignorados e instáveis
- `typecheck:infra` em worktree isolado: **FALHA** (TS2307, módulo inexistente).
- `cdk synth` em worktree isolado: **FALHA** (ERR_MODULE_NOT_FOUND, mesma causa).
- `eslint` no working tree principal (com arquivo untracked presente): OK, 0 erros.
- `typecheck:infra`/`cdk synth` no working tree principal (com arquivo untracked
  presente): OK — falso positivo, não reproduz o estado real do commit.

### Cobertura inicial e final
N/A — sem framework de cobertura aplicável a stacks CDK; sem regressão em
suítes de aplicação (nenhum arquivo de aplicação alterado nesta task).

### Local do allure-results e do relatório Allure
N/A nesta leva — task 100% de infraestrutura, sem testes de aplicação
executáveis via Vitest/Allure.

### Bugs por severidade e status
- CRÍTICA (1): BUG-002 — `infra/bin/app.ts` importa módulo inexistente na
  árvore commitada (escopo cruzado com branch da spec 003). ABERTO, bloqueante.
- Herdado de leva anterior, não relacionado a esta task: BUG-001 (BAIXA,
  PRONTO PARA RETESTE, ver handoff).

### Riscos residuais
- BUG-002 bloqueia merge — ver handoff para ação exata.
- Ausência de suíte automatizada para CDK stacks (`extrator-queue-stack.ts` e
  `classificador-queue-stack.ts`) — risco pré-existente, não introduzido nem
  agravado por esta task; registrado para visibilidade, não bloqueante.

### Limitações do ambiente
Verificação de infraestrutura feita por typecheck + `cdk synth` (sem
credenciais AWS, sem deploy real) — padrão já usado pelo backend-reviewer
nesta mesma PR. `.husky/pre-commit` (troca `pnpm exec` → `npx`) é ajuste de
ambiente local, não relacionado à lógica de negócio; observado, não gera bug.

### Parecer final
**REPROVADO — DEVOLVIDO AO DEV-BACK-END**

Motivo: BUG-002 (CRÍTICA) — o commit desta PR quebra `typecheck:infra` e
`cdk synth` de todo o app CDK em qualquer checkout limpo, por depender de um
arquivo de outro branch (spec 003) que nunca foi commitado nesta PR. A lógica
da regra EventBridge em si (escopo da T004) está correta, mas não pode ser
aprovada enquanto o arquivo `infra/bin/app.ts` deixar o build quebrado.

---

## Leva anterior — T001, T005-T011 (histórico, ver conteúdo original preservado no handoff)
Ver `specs/002-extracao-dados-orcamento/handoffs/qa-to-dev-back-end.md` §
"Leva anterior" e `bugs/BUG-001.md` para o parecer e evidências daquela leva
(PR #409, commit `82bb32b`, APROVADO COM RESSALVAS).
