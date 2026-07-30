# QA Final Report — SPEC 002-extracao-dados-orcamento

## Leva atual — T012 (issue #77)

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
