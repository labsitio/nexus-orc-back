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
