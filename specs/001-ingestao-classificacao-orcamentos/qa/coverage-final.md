# Coverage Final — T004/T006–T009

Comando: `pnpm exec vitest run --coverage` (vitest 4.1.10, `@vitest/coverage-v8`
4.1.10, escopo `src/**`).

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   92.91 |      100 |      84 |    92.8 |
 domain            |   81.81 |      100 |   68.75 |   81.81 |
  orcamento.aggregate.ts |   81.81 |      100 |   68.75 |   81.81 | 92-112
 .../value-objects |   95.45 |      100 |   89.65 |   95.31 |
  canal.vo.ts      |      75 |      100 |      60 |      75 | 32-36
  nivel-confianca.vo.ts |   85.71 |      100 |      80 |   85.71 | 30
-------------------|---------|----------|---------|---------|-------------------
Statements   : 92.91% ( 118/127 )
Branches     : 100% ( 38/38 )
Functions    : 84% ( 42/50 )
Lines        : 92.8% ( 116/125 )
```

## Análise das linhas não cobertas

Todas as linhas não cobertas são acessores triviais e métodos utilitários
sem decisão (nenhuma delas é invariante de validação):

- `orcamento.aggregate.ts:92-112` — `reconstituir()` (usado só pelo
  repositório, ainda não implementado, T011) e getters (`id`, `canal`,
  `recebidoEm`, `referenciaBruta`, `referenciaExterna`, `resultadoAtual`,
  `historico`). Classificação: **integração dependente de ambiente ainda não
  implementada** (repositório é T011) + **risco ainda não testado, mas
  trivial** (getters sem lógica).
- `canal.vo.ts:32-36` — `equals()`/`toString()`. Classificação: **risco
  ainda não testado, mas trivial** (comparação/serialização sem decisão de
  negócio).
- `nivel-confianca.vo.ts:30` — `equals()`. Mesma classificação.

**Branch coverage é 100%** — todos os 12 pontos de `throw new ErroDominio`
(as invariantes de validação exigidas pelo critério de aceite de T006) estão
cobertos por teste que força o valor inválido e espera o erro. O critério
literal de T006 ("100% cobertura de unit test das invariantes") está
satisfeito: a lacuna de statements/functions é em acessores, não em
invariantes.

## Threshold
Não havia threshold configurado (T003 ainda não existe). QA não configurou
threshold nesta task — decisão de piso mínimo de cobertura para CI é do
dev-back-end/arquiteto em T003, para não antecipar decisão fora do escopo de QA.

---

# Coverage Final — T016/T019 (issues #21, #24) — PR #402

Comando: `pnpm exec vitest run --coverage` (vitest 4.1.10, `@vitest/coverage-v8`,
escopo `src/**`, Node 24.18.1). Suíte completa (12 arquivos, 63 testes — inclui
trilha 001-E em desenvolvimento paralelo no mesmo worktree, fora do escopo
deste PR mas coexistente e passando).

```
Statements   : 92.52% ( 161/174 )
Branches     : 91.37% ( 53/58 )
Functions    : 90.32% ( 56/62 )
Lines        : 92.44% ( 159/172 )
```

## Arquivo do diff desta task
`s3-armazenamento-bruto.gateway.ts`: **100%** statements (12/12), branches
(4/4), functions (3/3) — confirmado via `coverage/coverage-final.json`
(o resumo em texto do vitest agrupa/omite da tabela arquivos com 100% de
cobertura nesta versão do reporter; não é ausência de instrumentação).

## Variação vs. baseline
Queda de statements/functions face à rodada anterior (92.91%→92.52%,
84%→90.32% funções sobe) explicada pela adição de `interface/http` e
`application` (trilha 001-E, fora de escopo) e `shared-kernel/database/client.ts`
(T005, 0% coberto, pré-existente e fora de escopo — sem teste de integração
com Aurora nesta task). Nenhuma linha nova do diff deste PR (#402) está
descoberta.

## Threshold
Ainda não configurado no projeto (decisão pendente de T003/dev-back-end,
mesma observação de rodadas anteriores).

---

# Coverage Final — T044–T047 (issues #49–#52) — PR #404

Comando: `npx vitest run --coverage` (vitest 4.1.10, `@vitest/coverage-v8`,
escopo `src/**`, Node 24.18.1). Suíte completa: 12 arquivos, 68 testes (66
pré-existentes + 2 novos de QA).

```
Statements   : 93.1%  ( 162/174 )
Branches     : 94.82% ( 55/58 )
Functions    : 90.32% ( 56/62 )
Lines        : 93.02% ( 160/172 )
```

## Arquivos do diff desta task
- `status.schema.ts`: 100% statements/lines/branches (já assim no baseline).
- `consultar-status-orcamento.ts`: 100% statements/lines/branches (já assim
  no baseline).
- `status.controller.ts`: **100%** statements/lines (era 94.11%), **91.66%**
  branch (era 75%). Único branch restante: linha 20 (`?? null` da
  serialização de `motivoInsucesso`/`resultado`), caminho trivial de
  nullish-coalescing sem decisão de negócio — classificado como risco
  residual trivial, não bloqueante.

## Variação vs. baseline
92.52%→93.1% statements, 91.37%→94.82% branches, 92.44%→93.02% lines,
funções estável (90.32%). Ganho concentrado no branch de rethrow do
controller (linha 62) e na cobertura de histórico/resultadoAtual do estado
`PENDENTE_REVISAO_HUMANA` e do fluxo pós-confirmação humana, adicionados por
QA.

## Threshold
Ainda não configurado no projeto (mesma observação de rodadas anteriores).

---

# Coverage Final — T011 (issue #16) — PR #410

Comando: `pnpm exec vitest run --coverage` (vitest 4.1.10,
`@vitest/coverage-v8`, escopo `src/**`, Node 24.14.0, `DATABASE_URL` setado
para Postgres real). Suíte completa: 14 arquivos, 79 testes (74 pré-existentes
+ 5 novos de QA).

```
Statements   : 94.2%  ( 195/207 )
Branches     : 92%    ( 92/100 )
Functions    : 90.54% ( 67/74 )
Lines        : 94.14% ( 193/205 )
```

## Arquivo do diff desta task
`drizzle-orcamento.repository.ts`: **100%** statements/lines/functions (era
0%), **88.09%** branch (era 0%). Linhas de branch residuais: 53, 150,
160-162 — todas o caminho `motivoInsucesso`/`insucesso()`, nunca produzido
pelo Domain hoje (`Orcamento.registrarTentativaClassificador` sempre chama
`TentativaClassificacao.sucesso()`, mesmo para confiança abaixo do limiar —
mesma observação já registrada na rodada de T044–T047 sobre o VO
`TentativaClassificacao`). Classificado como **risco ainda não testado por
ser inalcançável no comportamento atual do sistema** — não é lacuna de teste
de T011; corrigir exigiria o Domain produzir `insucesso()` em algum fluxo
real, decisão fora do escopo desta task/agente.

## Variação vs. baseline
81.15%→94.2% statements, 55%→92% branches, 75.67%→90.54% functions,
80.97%→94.14% lines — ganho concentrado no arquivo do diff (0%→100/88.09%),
que antes zerava a média do projeto por ser um arquivo grande e totalmente
descoberto.

## Threshold
Ainda não configurado no projeto (mesma observação de rodadas anteriores) —
QA não configurou threshold nesta task, decisão de piso mínimo cabe ao
dev-back-end/arquiteto (T003).

---

# Coverage Final — T050–T055 (issues #55–#60) — PR #416

Comando: `corepack pnpm exec vitest run --coverage` (vitest 4.1.10,
`@vitest/coverage-v8`, escopo `src/**`, Node 24.13.0, sem `DATABASE_URL` —
12 testes Drizzle/Postgres pulados, fora de escopo desta trilha). Suíte
completa: 38 arquivos, 176 testes.

```
All files: Statements 86.14% | Branches 72.86% | Functions 80.44% | Lines 85.98%
```

## Arquivos do diff desta task
- `confirmar-revisao-humana.ts`: **100%** statements/branches/functions/lines
  (13/13 linhas, 2/2 branches, 3/3 funções).
- `revisao-humana.controller.ts`: 96% statements/lines (24/25), **90%**
  branch (9/10). Linha não coberta: rethrow de erro inesperado no `catch`
  final (fallback 500 não mapeado) — mesmo padrão de gap já aceito em
  `status.controller.ts` (rodada T044–T047), não é invariante de negócio.
- `revisao-humana.schema.ts`: 100%.
- `confirmar-revisao-humana-lambda-role-stack.ts` (CDK): fora do escopo do
  vitest coverage — validado via `cdk synth` bem-sucedido, mesmo padrão das
  demais IAM roles desta trilha (T026/T035/T048).

## Variação vs. baseline
Cobertura global do projeto cai frente às rodadas anteriores (93%→86%
statements) por incluir arquivos de outras trilhas paralelas mergeadas
recentemente com cobertura menor (`extracao-orcamento.aggregate.ts` 87.5%,
`drizzle-orcamento.repository.ts` 0% sem `DATABASE_URL`, `client.ts` 0%) —
nenhum deles pertence ao diff desta task. Nenhuma linha nova do diff deste
PR (#416) está descoberta além do rethrow já justificado.

## Threshold
Ainda não configurado no projeto (mesma observação de todas as rodadas
anteriores).

---

# Coverage Final — T020–T026 (issues #25–#31) — PR #426

Comando: `corepack pnpm exec vitest run --coverage` (vitest 4.1.10,
`@vitest/coverage-v8`, escopo `src/**`, Node 24.18.0, sem `DATABASE_URL` —
6 arquivos/27 casos de integração Drizzle/Postgres pulados, mesma limitação
de ambiente registrada em `qa/test-plan.md`). Suíte completa: 46 arquivos
passed, 6 skipped (52), 214 testes passed, 27 skipped (241) — números
idênticos aos declarados no corpo da PR.

```
All files: Statements 82.03% | Branches 71.38% | Functions 73.94% | Lines 82.22%
```

## Arquivos do diff desta task (lidos de `coverage/coverage-final.json`, não
da tabela resumida do reporter texto — nomes truncados nela colidem
visualmente, ex. `s3-armazenamento-bruto.gateway.ts` vs.
`bedrock-classificador.gateway.ts` aparecem ambos como `...or.gateway.ts`)
- `receber-orcamento.ts`: **100%** statements/branches/functions/lines (14/14, 6/6).
- `upload-url.controller.ts`: **100%** (10/10, 3/3).
- `s3-armazenamento-bruto.gateway.ts`: **100%** (35/35, 12/12) — inclui os 2
  métodos novos desta PR (`gerarUrlUpload`, `confirmarUpload`), com teste
  dedicado afirmando `ObjectLockMode`/`ObjectLockRetainUntilDate` no PUT
  presigned e `CopySource`/`Key` do `CopyObjectCommand`.
- `sftp-upload.handler.ts`: **100%** (11/11, 4/4).
- `auth-cognito.middleware.ts`: **100%** (12/12, 4/4).
- `confirmar-upload.controller.ts`: 96% statements (24/25), 88.9% branch
  (8/9) — única linha não coberta é a defesa `Array.isArray(valor)` em
  `idempotencyKeyDoHeader` (linha 18), sem caminho real via HTTP (Node
  normaliza headers repetidos numa única string, RFC 7230 — `string[]` só
  ocorre para `set-cookie`), já documentado no comentário do próprio código.
  Classificado como **risco residual trivial** (defesa de tipo sem
  invariante de negócio), não bloqueante.
- `idempotency-key.repository.ts` (interface) e
  `drizzle-idempotency-key.repository.ts` (implementação): 0% via vitest
  nesta rodada — os 3 testes de integração real contra Postgres
  (`drizzle-idempotency-key.repository.test.ts`) seguem `skip` sem
  `DATABASE_URL` (limitação de ambiente, ver `qa/test-plan.md`); a
  correção lógica do admission gate foi verificada por inspeção de código
  (instrução SQL única `INSERT ... ON CONFLICT ... WHERE expira_em <= now()
  RETURNING`) e pela suíte de `receber-orcamento.test.ts`, que exercita o
  contrato do repositório via fake que simula o resultado real da corrida.
- `idempotency-key.schema.ts`: sem execução de linha via vitest (schema
  Drizzle puro, sem lógica) — validado por `tsc --noEmit` e pelo `db:migrate`
  gerado (`drizzle/0007_daffy_bulldozer.sql`), mesmo padrão de schemas
  anteriores (T012).
- `receber-orcamento-lambda-role-stack.ts` / `ingestao-identificacao-storage-
  stack.ts` (CDK): fora do escopo do vitest coverage — validados via
  `cdk synth --quiet` (8 stacks, synth limpo), mesmo padrão de todas as
  rodadas de IAM/storage anteriores.

## Variação vs. baseline
Queda global frente à rodada anterior (86.14%→82.03% statements,
72.86%→71.38% branches) explicada por: (1) os arquivos novos de persistência
desta PR (`drizzle-idempotency-key.repository.ts`, 0% sem `DATABASE_URL`)
entrando no denominador do projeto; (2) `client.ts` (shared-kernel, 0%,
pré-existente, fora de escopo). Nenhuma linha nova do diff de aplicação/
interface/gateway desta PR está descoberta além da defesa trivial já
justificada — mesmo padrão de queda "aparente" já registrado nas rodadas
T011 e T050-T055 (arquivo de persistência 0% sem banco disponível zera a
média do projeto sem indicar regressão real de teste).

## Threshold
Ainda não configurado no projeto (mesma observação de todas as rodadas
anteriores) — decisão de piso mínimo para CI segue fora do escopo de QA.
