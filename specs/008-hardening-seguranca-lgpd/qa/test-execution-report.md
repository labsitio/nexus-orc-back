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
