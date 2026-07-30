# Handoff QA → dev-back-end — SPEC 002

## Leva atual — T012 (issue #77, PR #423, branch `feat/002-t012-extracao-schema-drizzle`, commit `27409c6`)

### Bugs
- CRÍTICA: `specs/002-extracao-dados-orcamento/bugs/BUG-003.md` — `drizzle/0005_small_captain_america.sql`
  emite `ALTER TABLE ... ALTER COLUMN "id" SET DATA TYPE bigserial`, SQL inválido
  (`bigserial` não existe como tipo em `ALTER COLUMN`). `drizzle-kit migrate` falha
  (exit 1) a partir do baseline T002; nenhuma coluna de T012 é criada. Quebra o
  step `pnpm run db:migrate` do CI (`.github/workflows/ci.yml:63`) e faz o próprio
  teste de integração já escrito (`extracao-orcamento.schema.test.ts`) falhar 5 de 7
  casos contra Postgres real.

### Parecer
REPROVADO — DEVOLVIDO AO DEV-BACK-END. Commit `27409c6` (PR #423) não pode avançar
enquanto BUG-003 estiver aberto — migração quebra CI e bloqueia T013.

### Comando exato que reproduz
```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo   # ajustar porta se houver Postgres nativo já em 5432
npx drizzle-kit migrate
# exit 1, sem mensagem clara na CLI; causa raiz:
docker exec -i <container_postgres> psql -U nexo -d nexo < drizzle/0005_small_captain_america.sql
# ERROR: type "bigserial" does not exist
```

### Testes relacionados
`tests/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.test.ts`
(já existente, sem alteração de asserção pelo QA) — roda contra Postgres real
quando `DATABASE_URL` está setado; 5/7 casos falham no commit atual.

### Impacto
Bloqueia `db:migrate` no CI para toda a spec 002 (e qualquer spec que rode
migração depois desta, ex. 003). Bloqueia T013 e qualquer teste de integração
que dependa do schema migrado. Impede provisionar o schema em Aurora/staging.

### Ordem recomendada
Bloqueante — corrigir a migração 0005 antes de qualquer outra ação neste PR
(hand-authoring do `ALTER COLUMN` para o equivalente real de `bigserial`, mesmo
padrão de correção manual já usado no trigger append-only de `0006`).

### Condições para reteste
Após a correção: `docker compose up -d postgres` limpo (baseline T002),
`npx drizzle-kit migrate` (exit 0), `npx vitest run
tests/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.test.ts`
com `DATABASE_URL` setado — 7/7 verdes. Confirmar também `npx drizzle-kit generate`
sem diff pendente.

### Commit/versão testada
`27409c6` (PR #423) — REPROVADO, aguardando correção

---

## Leva anterior — T004 (issue #69, PR #420, branch `feat/002-t004-eventbridge-rule-extrator-queue`, commit `7e7139c`)

### Bugs
- CRÍTICA: `specs/002-extracao-dados-orcamento/bugs/BUG-002.md` — **VALIDADO** no
  reteste do commit `7e7139c`. `infra/bin/app.ts` não importa mais
  `ValidadorQueueStack`; `typecheck:infra` e `cdk synth` (todos os stacks) passam
  em worktree isolado, sem depender de arquivo untracked de outro branch. Rule
  `OrcamentoClassificadoParaExtratorQueue` confirmada (source
  `nexo.ingestao-identificacao`, detail-type `OrcamentoClassificado`, target
  `extrator-queue`), sem regressão.

Nenhum outro bug (CRÍTICO/ALTO/MÉDIO/BAIXO) identificado nesta leva.

### Parecer
APROVADO PELO QA — commit `7e7139c` (PR #420) liberado para o próximo passo do
pipeline (revisão/merge).

### Comando exato que reproduz
```bash
git worktree add /tmp/qa-clean 5ecb355
cd /tmp/qa-clean
ln -s <repo>/node_modules node_modules
npm run typecheck:infra
# infra/bin/app.ts(8,37): error TS2307: Cannot find module '../lib/validador-queue-stack.ts'
```

### Testes relacionados
Não há suíte automatizada de CDK stack neste projeto (nem para `classificador-queue-stack.ts`,
gap pré-existente da spec 001, não introduzido por esta task). Verificação feita
por typecheck + synth em worktree isolado, conforme comando acima.

### Impacto
Bloqueia build/CI de todo o app CDK — não apenas `ExtratorQueueStack`. Merge
nesse estado quebra a main.

### Ordem recomendada
Bloqueante — corrigir antes de qualquer outra ação neste PR. Ação: remover de
`infra/bin/app.ts`, neste branch, o import e a instanciação de `ValidadorQueueStack`
(pertencem exclusivamente ao branch/PR da spec 003, T003).

### Condições para reteste
Após a correção: `git worktree add` em commit novo (isolado, sem arquivos untracked
de outros branches), `npm run typecheck:infra`, `npx eslint infra/`,
`npx cdk synth --app "npx tsx infra/bin/app.ts"` (sem stack específico, cobrindo
todos os stacks do app) — todos verdes. Em seguida reconfirmar o `eventPattern`
da regra `OrcamentoClassificadoParaExtratorQueue` (source `nexo.ingestao-identificacao`,
detail-type `OrcamentoClassificado`, target `ExtratorQueue`).

### Commit/versão testada
`7e7139c` (PR #420) — reteste validado

---

## Leva anterior — T001, T005-T011 (histórico, já reportada)

### Bugs abertos por severidade
- BAIXA: `specs/002-extracao-dados-orcamento/bugs/BUG-001.md` — getter
  `ExtracaoOrcamento.historico` retorna referência interna mutável (mesma
  classe de nit já corrigida para `itens` no commit 82bb32b). Status:
  PRONTO PARA RETESTE — não retestado ainda nesta sessão (fora do escopo desta
  leva, não há novo commit reportado para ele).

### Comando que reproduz (leitura de código, não requer execução de teste)
```ts
const extracao = ExtracaoOrcamento.criar(orcamentoId, refClass, refS3);
extracao.registrarTentativaExtrator(itens, condicoes);
extracao.historico.length = 0; // mutação externa não impedida
```

### Commit/versão testada
`82bb32b152fc2bee2a3133414d4aa0ae0ec9c1db` (PR #409, branch `feat/002-extracao`)
