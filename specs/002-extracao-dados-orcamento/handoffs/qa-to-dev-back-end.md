# Handoff QA → dev-back-end — SPEC 002

## Leva atual — T004 (issue #69, PR #420, branch `feat/002-t004-eventbridge-rule-extrator-queue`, commit `5ecb355`)

### Bugs abertos por severidade
- CRÍTICA: `specs/002-extracao-dados-orcamento/bugs/BUG-002.md` — `infra/bin/app.ts`
  importa `../lib/validador-queue-stack.ts`, arquivo que não existe em nenhum
  commit deste branch (pertence ao branch irmão `feat/003-t003-validador-queue`,
  fora do escopo da T004). Checkout limpo do commit quebra `typecheck:infra` e
  `cdk synth` para todos os stacks.

Nenhum outro bug (ALTO/MÉDIO/BAIXO) identificado nesta leva.

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
`5ecb355` (PR #420)

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
