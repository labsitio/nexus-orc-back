# Test Execution Report

Ambiente: Node 24.18.1 (via nvm, `PATH` prefixado — corepack sob Node 18
falha com bug de host-defined-options, conforme aviso do dev-back-end).
Worktree: `.claude/worktrees/agent-a9de78167017bc4ee`. Commit testado:
`64ef79c` (branch `feat/008-hardening`, PR #407).

## (a) Layout de pastas — PASS

```
$ find src/platform -type f | sort
src/platform/conformidade/application/.gitkeep
src/platform/conformidade/domain/.gitkeep
src/platform/conformidade/infrastructure/.gitkeep
src/platform/conformidade/infrastructure/persistence/schema/platform.schema.ts
src/platform/conformidade/interface/.gitkeep
src/platform/shared-value-objects/domain/.gitkeep
```

Confere com `plan.md` (Project Structure, linhas 178-195): `src/platform/`
como categoria irmã de `bounded-contexts/`, com os 4 subdiretórios de
`conformidade/` e `shared-value-objects/domain/`. Subpastas mais profundas
(`value-objects/`, `events/`, `use-cases/`, `http/`) ainda não existem — não
são exigidas por T001, entram nas Phases 2-5.

## (b) Schema Drizzle — PASS

`pnpm typecheck` limpo (`tsc --noEmit`, sem saída/erro).

`platform.schema.ts` define as 5 tabelas exigidas com atributos batendo com
`plan.md` (Domain, linha 96; Infrastructure, linhas 139-140):
- `solicitacoes_esquecimento`: id, titular_referencia, registrada_em,
  prazo_limite, status, contextos_esperados (jsonb).
- `confirmacoes_anonimizacao` (append-only, FK para solicitacao): id,
  solicitacao_id (FK + índice), bounded_context, orcamento_id,
  campos_anonimizados (jsonb), confirmado_em.
- `politicas_retencao`: categoria (PK), prazo_em_dias, base_legal,
  atualizada_em.
- `trilha_auditoria_acesso` (append-only): id, orcamento_id (índice), ator,
  acao, ocorreu_em.
- `contextos_com_dado_pessoal`: bounded_context (PK), possui_dado_pessoal.

Migrações presentes e consistentes: `drizzle/0000_platform_conformidade_baseline.sql`
(baseline das 5 tabelas) + `drizzle/0001_platform_conformidade_indices.sql`
(os 2 índices adicionados após o nit do backend-reviewer). `drizzle/schema.ts`
(barrel) exporta o novo módulo.

## (c) Lint/typecheck — PASS

```
$ pnpm typecheck
$ tsc --noEmit
(sem erros)

$ pnpm exec eslint src/platform
(sem erros, sem warnings)
```

## Regressão — suíte existente

Suíte roda com `pnpm test` (`vitest run --passWithNoTests`). Resultado
**idêntico** nos dois pontos comparados — falha de infraestrutura
preexistente, não regressão introduzida por este PR:

```
$ pnpm test   # no commit cb343f5 (imediatamente antes de T001)
Test Files  12 failed (12)
     Tests  no tests
Error: Vitest failed to find the runner. [...]
 ❯ allure-vitest/src/setup.ts:15:0

$ pnpm test   # no commit 64ef79c (HEAD do PR #407)
Test Files  12 failed (12)
     Tests  no tests
Error: Vitest failed to find the runner. [...]
 ❯ allure-vitest/src/setup.ts:15:0
```

Causa aparente (hipótese, sem correção — fora da autoridade do QA): o
reporter `allure-vitest/reporter` configurado em `vitest.config.ts` via
array `reporters` parece incompatível com a versão instalada do runner
(`allure-vitest@3.10.2` / `vitest@4.1.10`), falhando na inicialização de
`setup.ts` antes de qualquer teste rodar. Como o comportamento é idêntico
entre baseline e HEAD do PR — mesmos 12 arquivos, mesmo erro, mesma
stack — não é atribuível às mudanças de T001-T003. Registrado como
limitação de ambiente preexistente, não como defeito deste PR.

## T005 — VO `PoliticaRetencao` (PR #437, commit `4db548f`)

Ambiente: Node 24, worktree `.claude/worktrees/agent-ae5e601a6ab865f53`.

```
$ npx vitest run tests/platform/shared-value-objects/politica-retencao.vo.test.ts
 ✓ tests/platform/shared-value-objects/politica-retencao.vo.test.ts (9 tests) 7ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Casos cobertos: prazoEmDias positivo aceito; prazoEmDias 0/-1/-100 rejeitados
(`PrazoEmDiasInvalidoError`); prazoEmDias não inteiro (1.5) rejeitado (mesmo
erro); baseLegal vazia e whitespace-only rejeitadas (`BaseLegalInvalidaError`);
atualizadaEm inválida (`new Date('data-invalida')`) rejeitada
(`AtualizadaEmInvalidaError`); `equals` comparando os 4 campos. Todos os 3
erros de domínio herdam de `ErroDominio`, conferido por leitura de código.
Critério de aceite da task ("teste unit cobrindo rejeição de `prazoEmDias <=
0`") satisfeito e ampliado.

`npx tsc --noEmit` e `npx eslint` no arquivo de produção e no teste: sem erro.

**Nota sobre o reporter `allure-vitest`**: ao contrário da limitação registrada
na Fase 1 (`Vitest failed to find the runner`), a suíte completa roda hoje sem
esse erro — `npm test`/`npx vitest run` (config completa, com reporter Allure
ativo) executam normalmente e geram `allure-results/` (245 arquivos, incluindo
os 9 resultados de `PoliticaRetencao`). O bug do reporter não se reproduziu
nesta validação; não investigado a fundo por estar fora do escopo de T005.

### Regressão completa (HEAD `4db548f`)

```
$ npx vitest run --reporter=default
 Test Files  7 failed | 48 passed | 6 skipped (61)
      Tests  230 passed | 27 skipped (257)
```

Os 7 arquivos falhos são pré-existentes e não relacionados a este diff —
falham na importação de dependências ausentes em outros módulos:
`@aws-sdk/client-eventbridge` (BC extracao), `pino` e
`@opentelemetry/instrumentation-aws-lambda` (BC ingestao-identificacao).
Nenhum deles importa ou depende de `politica-retencao.vo.ts`. Nenhuma
regressão introduzida por T005.

### Cobertura

`npx vitest run --coverage` isolado no arquivo de teste do VO: os 9 testes
exercitam os 3 `if` de validação (branch positivo e negativo de cada um) e o
`equals`. A linha do arquivo `politica-retencao.vo.ts` não aparece
individualmente na tabela text do relatório v8 (mostra apenas a agregação da
pasta `.../shared-value-objects/domain` e o arquivo `categoria-documento.vo.ts`
— possível comportamento do reporter ao omitir arquivo 100% coberto); a
cobertura funcional de todos os ramos foi confirmada por leitura de código +
execução dos 9 casos, não por essa tabela. Registrado como limitação de
ferramental de relatório, não como lacuna de teste.

## T006 — VO `DadoAnonimizado` (PR #439, commit `dcb1190`)

Ambiente: Node 24, worktree `.claude/worktrees/agent-aa3475b21e7b08a8a`.

```
$ npx vitest run --reporter=default tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts
 ✓ tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts (10 tests) 11ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Casos cobertos: props válidas com `MASCARAMENTO` e `REMOCAO`; **irreversibilidade**
(`Object.keys(dado)` restrito a `[campoOriginal, metodo, aplicadoEm,
solicitacaoId]`, ausência de `valor`/`valorOriginal`, `(dado as any).valorOriginal`
`undefined`); `campoOriginal`/`solicitacaoId` vazios ou whitespace-only
rejeitados (`it.each`); `metodo` fora de `MASCARAMENTO|REMOCAO` rejeitado;
`aplicadoEm` inválida (`Invalid Date`) rejeitada; `equals` por valor (positivo
e negativo). Critério de aceite da task ("teste unit garantindo que a API do
VO não expõe getter de valor original") satisfeito — reforçado pela leitura de
código: `private constructor`, sem método/setter que aceite o dado original de
volta, `campoOriginal` guarda apenas o nome do campo, nunca o valor.

`npx tsc --noEmit` e `npx eslint` no arquivo de produção e no teste: sem erro
nos arquivos do PR (ver ressalva de ambiente abaixo).

### Regressão completa (HEAD `dcb1190`)

```
$ npx vitest run --reporter=default
 Test Files  7 failed | 50 passed | 6 skipped (63)
      Tests  242 passed | 27 skipped (269)
```

Os 7 arquivos falhos são pré-existentes e não relacionados a este diff —
`Cannot find module` para `@aws-sdk/client-eventbridge`,
`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-lambda`, `pino`,
`@opentelemetry/instrumentation-aws-lambda` em módulos de outros BCs
(`extracao`, `ingestao-identificacao/infrastructure`). Confirmado via
`git show --stat dcb1190`: o diff deste PR contém apenas `tasks.md` (checkbox)
+ `dado-anonimizado.vo.ts` + `dado-anonimizado.vo.test.ts`. `node_modules` do
worktree está incompleto para essas dependências (declaradas em `package.json`,
ausentes em disco) — mesmo sintoma reproduzido por `npx tsc --noEmit`. Nenhuma
regressão introduzida por T006.

### Cobertura

```
$ npx vitest run --coverage --reporter=default tests/platform/shared-value-objects
```

Diretório `src/platform/shared-value-objects/domain` (3 VOs): Statements
97.61% | Branch 100% | Functions 94.44% | Lines 97.61%. Assim como em T005, a
tabela text do reporter v8 não lista `dado-anonimizado.vo.ts`/
`politica-retencao.vo.ts` individualmente (mostra apenas a agregação do
diretório e o arquivo `categoria-documento.vo.ts`) — mesma limitação de
ferramental já registrada. Cobertura funcional confirmada por leitura de
código + execução dos 10 casos.

## T007 — VO `ReferenciaTitular` (PR #441, commit `47c19bc`)

Ambiente: Node 24, worktree `.claude/worktrees/agent-a0d48660cf561881c`.

```
$ npx vitest run --reporter=default tests/platform/conformidade
 tests/platform/conformidade/referencia-titular.vo.test.ts (7 tests) 6ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Casos cobertos: valor valido aceito; normalizacao (lowercase + trim de
espacos nas bordas); rejeicao de vazio/whitespace-only (`it.each`); rejeicao
acima de 320 chars; aceite de exatamente 320 chars (limite); `equals`
comparando pelo valor ja normalizado (positivo e negativo). Criterio de
aceite da task ("VO ReferenciaTitular... identifica o titular de forma
estavel entre BCs... sem expor a modelagem interna de nenhum BC", `plan.md`
L106) satisfeito: VO e opaco por design — `de(valor)` nao interpreta formato
(e-mail, CNPJ+contato ou outro), apenas normaliza para correlacao estavel.

`npx tsc --noEmit -p .` e `npx eslint . --ext .ts`: sem erro nos arquivos do
diff (erros pre-existentes de modulos ausentes, ver regressao completa
abaixo).

### Regressao completa (HEAD `47c19bc`)

```
$ npx vitest run --reporter=default
 Test Files  7 failed | 51 passed | 6 skipped (64)
      Tests  249 passed | 27 skipped (276)
```

Os 7 arquivos falhos sao os mesmos ja registrados em T005/T006 — `Cannot
find package` para `pino`, `@opentelemetry/instrumentation-aws-lambda` e
demais pacotes AWS/observability em modulos de `bounded-contexts/extracao` e
`bounded-contexts/ingestao-identificacao/infrastructure`. Confirmado via
`git show 47c19bc --stat`: o diff contem apenas os 3 arquivos citados no
handoff (VO, erro base, teste) — nenhum deles toca modulos de
extracao/ingestao-identificacao. Nenhuma regressao introduzida por T007.

### Cobertura

```
$ npx vitest run --coverage --coverage.reporter=json tests/platform/conformidade
```

`coverage/coverage-final.json` filtrado por caminho: `referencia-titular.vo.ts`
com 9/9 statements cobertos (100%). A tabela texto do reporter v8 (`--coverage`
sem `--coverage.reporter=json`) nao lista o arquivo individualmente — mesma
limitacao de ferramental ja registrada em T005/T006, contornada lendo o JSON
bruto em vez da tabela agregada.

## T009 — `EventPublisher`/`EventBridgePublisher` do componente Conformidade (PR #447, commit `37ada19`)

Ambiente: Node 24.14.0, worktree `.claude/worktrees/agent-a77c638eab34392f5`,
gerenciador `pnpm` (repositório é monorepo pnpm — `package-lock.json` npm
untracked no worktree é resíduo local, não do commit; ignorado).

**Nota sobre o reporter `allure-vitest`**: reproduzido novamente o
`Vitest failed to find the runner` ao rodar `pnpm exec vitest run <arquivo>`
ou `pnpm vitest run` (config completa com `reporters: ["default", ["allure-vitest/reporter", ...]]`).
Mesmo workaround já registrado em T006/T007: `--reporter=default` sobrepõe o
reporter da config e a suíte roda normalmente. Comportamento intermitente
entre commits já documentado — não investigado a fundo (fora da autoridade
de correção do QA sobre `vitest.config.ts`), reafirmado como limitação de
ambiente preexistente, não introduzida por T009.

```
$ pnpm vitest run --reporter=default tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts
 ✓ tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts (3 tests) 9ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Casos cobertos pelo teste já entregue pelo dev-back-end (não estendido pelo
QA — cobre integralmente o critério de aceite da task): (1) publicação
bem-sucedida asserta `EventBusName`, `Source = 'nexo.conformidade'`,
`DetailType` = nome do evento e `Detail` serializado corretamente (JSON
válido, contém `detailType`/`schemaVersion`); (2) erro descritivo quando
`FailedEntryCount > 0` com `ErrorMessage` presente; (3) mensagem de fallback
`"motivo desconhecido"` quando o EventBridge não informa `ErrorMessage`.

`pnpm exec tsc --noEmit` (raiz do monorepo): sem erro.
`pnpm exec eslint src/platform/conformidade tests/platform/conformidade`: sem
erro/warning.

### Regressão completa (HEAD `37ada19`)

```
$ pnpm vitest run --reporter=default
 Test Files  60 passed | 6 skipped (66)
      Tests  293 passed | 27 skipped (320)
```

Nenhuma falha em toda a suíte — inclusive os 3 arquivos de teste
(`confirmar-upload.controller`, `upload-url.controller`,
`auth-cognito.middleware`) que o dev-back-end reportou como falha
pré-existente por timeout: passaram nesta execução (607ms e demais dentro do
esperado). Os 6 arquivos `skipped` são suítes de integração de persistência
(Drizzle/schema) que exigem Aurora local, marcadas `describe.skip`
deliberadamente — não são falhas. Nenhuma regressão introduzida por T009.

### Cobertura

```
$ pnpm vitest run --reporter=default --coverage --coverage.reporter=json tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts
```

`coverage/coverage-final.json` filtrado por caminho —
`src/platform/conformidade/infrastructure/eventbridge.publisher.ts`:
Statements 7/7 (100%) | Branches 4/4 (100%) | Functions 2/2 (100%). Os 4
branches cobertos correspondem aos 2 `if`/`??` de tratamento de erro
(`FailedEntryCount` truthy/falsy × `ErrorMessage` presente/ausente).
Nenhuma lacuna de cobertura para este arquivo.

### Observação sobre a redação da task (não é defeito)

`tasks.md` T009 pede "reaproveitar (import, não reimplementar)" o padrão de
001. O código entregue declara interface (`EventPublisher`) e classe
(`EventBridgePublisher`) locais em `platform/conformidade/`, sem import de
`bounded-contexts/ingestao-identificacao` nem de `bounded-contexts/extracao`.
Comparação com o já implementado em 002 (`extracao`) confirma que este é o
padrão real e consistente do repositório: cada Bounded Context/componente
declara sua própria cópia local do par interface+classe (mesmo shape, `source`
e mensagem de erro contextualizados) — nunca import cross-contexto de código
de Domain/Infrastructure, conforme a própria convenção #5 de 001 (reafirmada
no ADR-004 desta spec: "a convenção de 001, item 5, proíbe código
compartilhado por import direto entre contextos"). `plan.md` desta spec tem
uma frase na Project Structure (linha 190, "reaproveita implementação de
001") que sugere import, mas a seção Application (linha 135) descreve apenas
"mesma interface... nenhum caso de uso novo introduz mecanismo de publicação
alternativo" — sem exigir import literal. Todos os critérios de aceite
técnicos e verificáveis (mesma interface, mesmo bus, `source` correto,
sem mecanismo alternativo, sem SDK vazando para Domain) estão satisfeitos.
Registrado como ambiguidade de redação entre `tasks.md` e `plan.md`, não como
defeito de implementação — sem impacto no gate desta task.

## T011 -- Teste de infraestrutura: SCP bloqueia segregacao de ambientes (commit `8baa2ee`)

Entrega e um script bash de infraestrutura, sem suite vitest a executar.
Validacao de QA feita por 4 verificacoes estaticas/sintaticas e mock logico
isolado (nao executa contra AWS real -- ver limitacao de ambiente).

### Permissao de execucao

    $ git ls-files -s infra/scripts/verificar-scp-segregacao-ambientes.sh
    100755 5be375df... 0 infra/scripts/verificar-scp-segregacao-ambientes.sh

PASS -- modo 100755 confirmado.

### Sintaxe bash

    $ bash -n infra/scripts/verificar-scp-segregacao-ambientes.sh
    (sem saida -- sintaxe OK)

### Validacao do workflow YAML

    $ npx --yes js-yaml .github/workflows/verificar-scp-segregacao-ambientes.yml
    (JSON parseado sem erro)

Inspecao programatica confirma chave `on` do YAML parseado contendo
exclusivamente `workflow_dispatch` -- nunca dispara em push/pull_request.

### Mock isolado de `assert_bloqueado` e da guarda de producao

Script de QA (scratchpad, nao versionado no repositorio) extrai a funcao
`assert_bloqueado` do script real via `awk` e a `SCP_DENY_REGEX` real via
`grep`, e executa 3 casos com comandos fake:

    === Caso A: sucesso inesperado (simula vazamento) ===
    CRITICO [teste]: a acao NAO foi bloqueada -- teve sucesso...
    Executando limpeza best-effort do recurso criado: echo LIMPEZA_EXECUTADA
    LIMPEZA_EXECUTADA
    RESULTADO_FINAL=1

    === Caso B: explicit deny de SCP ===
    OK [teste]: bloqueado pela SCP (explicit deny).
    RESULTADO_FINAL=0

    === Caso C: outro erro (nao SCP) ===
    FALHA [teste]: comando falhou, mas nao por explicit deny de SCP...
    RESULTADO_FINAL=1

    === Caso D: guarda conta de producao ===
    FALHA: credenciais atuais pertencem a conta de producao (999999999999)
    - abortando por seguranca.
    exit code guarda (esperado 1): 1

Todos os 4 casos produziram o resultado esperado. Confirma, de forma
independente da correcao ja validada pelo backend-reviewer: (1) sucesso
inesperado e tratado como CRITICO com limpeza best-effort efetivamente
invocada; (2) explicit deny de SCP e o unico caminho que resulta em OK;
(3) outro erro nao e confundido com bloqueio por SCP; (4) a guarda de
conta de producao aborta antes de qualquer chamada destrutiva.

### Limitacao de ambiente

Nao ha credenciais AWS reais nem contas dev/hml/prod provisionadas neste
ambiente (T013/T014/T015 pendentes) -- execucao real do script contra AWS
nao pode ser exercitada neste QA. `shellcheck` e `python3`/`pyyaml` tambem
indisponiveis no ambiente Windows/Git Bash usado; contornado com `bash -n`
e `js-yaml` via `npx`, suficientes para o escopo desta verificacao.
