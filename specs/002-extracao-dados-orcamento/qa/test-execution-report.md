# Test Execution Report — SPEC 002

## Leva T018 (issue #83, PR #451, commit `a8ff244`)

### Escopo
`sanitizarConteudoExtracao` (Infrastructure, novo) + `MarkItDownConversaoExtracaoACL`
(Infrastructure, novo, implementa contrato de T011) do BC Extração — réplica
mecânica do padrão já aprovado em spec-001 (`sanitizar-conteudo-documento.ts` /
`markitdown-conversao.acl.ts`), instância própria deste BC (ADR-002).

### Comando e resultado
```bash
npx vitest run
```
- 67 arquivos passaram, 6 skipped (integração Postgres, mesma limitação
  pré-existente sem `DATABASE_URL`) — **322 testes passaram, 27 skipped, 0 falhas.**
- `sanitizar-conteudo-extracao.test.ts`: 7/7 PASS.
- `markitdown-conversao-extracao.acl.test.ts`: 6/6 PASS.
- Sem regressão nas demais suítes.

```bash
npx vitest run --coverage
```
- Mesmo resultado, exceto **1 falha isolada**: `sanitizar-conteudo-documento.test.ts`
  (par de **spec-001**, não tocado por esta PR) — teste de mitigação de DoS com
  limite de 200ms falhou sob `--coverage` no full-suite run, e passou quando
  executado isoladamente. Achado pré-existente já relatado pelo dev-back-end/
  backend-reviewer; nenhum arquivo de spec-001 alterado nesta PR, portanto sem
  BUG novo aberto por esta leva — registrado apenas como risco residual.

### Verificação empírica do limite de 500ms (DoS) do par novo (spec-002)
Medido via probe descartável (removido após a medição, não versionado):
- Implementação atual (com limite de varredura de entrada) sob `--coverage`:
  ~102ms para documento adversarial de 10M caracteres de controle.
- Regressão simulada (mesma lógica, sem o limite de varredura de entrada) sob
  `--coverage`: ~1676ms para o mesmo documento.
- Conclusão: teste com 500ms tem margem (~5x acima do normal, ~3x abaixo da
  regressão) — não está frouxo a ponto de nunca falhar por engano, continua
  detectando regressão real de complexidade.

### Estático
- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos alterados/novos (produção + teste) — sem erros.

### Cobertura dos arquivos novos
- `sanitizar-conteudo-extracao.ts`: 100% stmts/functions/lines, 96.29% branches
  (1 branch não coberto, mesmo padrão residual do par de spec-001).
- `markitdown-conversao-extracao.acl.ts`: 100% stmts/branches/functions/lines.

### Resultado
**PASS.** Nenhum defeito de produção encontrado. Critérios de aceite de T018
(`tasks.md`) satisfeitos: unit test do ACL mockando saída do MarkItDown, com
sanitização de conteúdo antes de compor prompt (mitigação de prompt injection),
mesmo padrão de spec-001.

---

## Leva T015 (issue #80, PR #429, commit `3580e09`)

### Escopo
`EventPublisher` (Domain, novo, réplica do contrato de spec-001) +
`EventBridgePublisher` (Infrastructure) do BC Extração — instância própria
deste BC, mesmo bus `nexo-dominio-bus`.

### Comando e resultado
```bash
npx vitest run
```
- 49 arquivos passaram, 6 skipped (integração Postgres/schema sem `DATABASE_URL`
  — pré-existente, não relacionado a esta PR) — **224 testes passaram, 0 falhas**.
- `eventbridge.publisher.test.ts` (extração): 3/3 PASS.
- Sem regressão nas demais suítes (BC Ingestão & Identificação, BC Validação,
  BC Extração).

### Estático
- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos 3 arquivos alterados/novos — sem erros.

### Ambiente
Sem LocalStack neste worktree. Teste é unitário com `EventBridgeClient` mockado
(`send` fake) — sem chamada real a `PutEventsCommand`. Suficiente para validar
o contrato do publisher (mapeamento de campos e tratamento de erro), não
substitui um teste de integração contra EventBridge real/LocalStack.

### Resultado
**PASS.** Nenhum defeito de produção encontrado.

---

## Leva T012 (issue #77, PR #423, commit `27409c6`)

### Escopo
Schema Drizzle `extracao.extracoes_orcamento` / `extracao.extracoes_orcamento_historico`
(ADR-004) + migração `0005_small_captain_america.sql` (gerada) +
`0006_extracoes_orcamento_historico_append_only.sql` (trigger hand-authored).

### Ambiente
- `docker compose up -d postgres` (Postgres 16, `pgvector/pgvector:pg16`, mesmo
  `docker-compose.yml` do projeto).
- Limitação de ambiente local: máquina de QA tem um Postgres nativo (não-Docker)
  também escutando em `127.0.0.1:5432`; conexões via driver `pg`/Node em
  `localhost:5432` foram roteadas para esse Postgres nativo em vez do container
  (`role "nexo" does not exist`), enquanto `docker exec ... psql` (dentro do
  container) conectava corretamente. Contornado remapeando a porta do container
  (`POSTGRES_PORT=55432 docker compose up -d postgres`) — não afeta CI (sem esse
  conflito de porta).

### Execução
1. Estático: `npx tsc --noEmit` — sem erros. `npx eslint` nos arquivos alterados
   — sem erros. `npx drizzle-kit generate` — **"No schema changes, nothing to
   migrate"** (schema TS já corresponde à migração commitada, sem diff pendente).
2. Migração real: `npx drizzle-kit migrate` contra Postgres limpo (baseline
   T002 aplicado) — **falha, exit 1**. Causa raiz isolada rodando
   `drizzle/0005_small_captain_america.sql` direto via `psql`: `ERROR: type
   "bigserial" does not exist` no primeiro statement (`ALTER COLUMN "id" SET
   DATA TYPE bigserial`). Nenhuma coluna nova de T012 é criada em nenhuma das
   duas tabelas.
3. Teste de integração (`extracao-orcamento.schema.test.ts`, `DATABASE_URL`
   setado, Postgres real): **5 de 7 casos falham** — os 2 que só tocam
   `extracoes_orcamento` (não `extracoes_orcamento_historico`) passam; os 5
   que inserem em `extracoes_orcamento_historico` falham com
   `null value in column "id" ... violates not-null constraint`, porque a
   coluna nunca foi migrada de `uuid` para `bigserial`.
4. Sem `DATABASE_URL`: suíte é corretamente pulada (`describe.skipIf`) — 7
   testes skipped, suíte geral não quebra.

### Resultado
**REPROVADO** — ver `bugs/BUG-003.md` (CRÍTICA). Migração gerada por
`drizzle-kit generate` não é aplicável em Postgres real a partir do baseline
T002; quebra `pnpm run db:migrate` do CI (`.github/workflows/ci.yml:63`) e o
próprio teste de integração escrito para esta task.

### Comandos usados (reprodutíveis)
```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo
npx drizzle-kit generate   # confirma: sem diff pendente
npx drizzle-kit migrate    # falha, exit 1
npx vitest run tests/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.test.ts
```

---

# Test Execution Report — SPEC 002 (leva T001, T005-T011)

## Comando
`pnpm run test` (equivalente a `vitest run --passWithNoTests`), Node 24, mesmo
comando usado pelo workflow `.github/workflows/ci.yml`.

## Execução de referência (CI, mesmo commit)
- Repositório: labsitio/nexus-orc-back
- PR: #409, branch `feat/002-extracao`
- Run: https://github.com/labsitio/nexus-orc-back/actions/runs/30571782437
  (`ci`, conclusão `success`, 1m01s)
- Commit mesclado testado: `82bb32b152fc2bee2a3133414d4aa0ae0ec9c1db` (via merge
  commit `45a879d`)
- Resultado: **27 arquivos de teste, 130 testes, 100% aprovados, 0 falhas.**
- Dos 27 arquivos, 14 pertencem ao BC Extração (esta leva) somando **56
  testes**, todos aprovados:
  - `extracao-orcamento.aggregate.test.ts` — 9
  - `events/domain-events.test.ts` — 3
  - `value-objects/condicoes-comerciais.vo.test.ts` — 2
  - `value-objects/item-orcamento.vo.test.ts` — 2
  - `value-objects/campo-extraido.vo.test.ts` — 4
  - `value-objects/tentativa-extracao.vo.test.ts` — 3
  - `value-objects/referencia-classificacao.vo.test.ts` — 3
  - `value-objects/referencia-s3.vo.test.ts` — 4
  - `value-objects/orcamento-id.vo.test.ts` — 3
  - `value-objects/nivel-confianca.vo.test.ts` — 8
  - `value-objects/dinheiro.vo.test.ts` — 4
  - `value-objects/periodo-validade.vo.test.ts` — 2
  - `value-objects/descricao-produto.vo.test.ts` — 2
  - `value-objects/quantidade.vo.test.ts` — 7
- Os 13 arquivos restantes (BC Ingestão & Identificação, spec 001) também
  passaram integralmente — sem regressão introduzida por esta PR.

## Execução local (este worktree)
`pnpm run test` (e variações com `--pool=forks`, cache limpo) falhou de forma
ambiental antes de rodar qualquer teste, com erro do reporter `allure-vitest`
("Vitest failed to find the runner"), afetando igualmente as 14 suítes de
Extração e as 13 de Ingestão — não isolado ao código desta PR. Não reproduzido
no CI (mesmo commit, mesma versão de Node). Classificado como **problema de
ambiente local**, não como defeito de produção nem de teste.

## Typecheck e lint (executado localmente com sucesso)
- `pnpm run typecheck` (`tsc --noEmit`) — sem erros.
- `pnpm exec eslint src/bounded-contexts/extracao tests/bounded-contexts/extracao` — sem erros.

## Falhas classificadas
Nenhuma falha de teste. 1 achado de code review (não é falha de teste) —
ver `bugs/BUG-001.md` (getter `historico` sem cópia defensiva, severidade BAIXA).
