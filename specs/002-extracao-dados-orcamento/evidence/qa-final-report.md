# QA Final Report — SPEC 002-extracao-dados-orcamento

## Leva atual — T004 (issue #69)

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
