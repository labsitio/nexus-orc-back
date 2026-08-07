# Relatório de execução — T001 (issue #6)

Commit testado: `11b1959` (PR #391, base `main`@`a8bb825`).
Ambiente: worktree isolado (`git worktree add`), Node 24.14.1 (nvm), pnpm
11.18.0 via corepack.

## Comandos e resultados

```
$ pnpm --version
11.18.0                              # == packageManager pinado no package.json

$ pnpm install
... Done in 685ms using pnpm v11.18.0
EXIT=0

$ pnpm exec tsc --noEmit            # baseline, src/index.ts real
EXIT=0

$ pnpm exec tsc --noEmit            # com src/smoke-invalid.ts injetado (temp)
src/smoke-invalid.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/smoke-invalid.ts(4,1): error TS2554: Expected 1 arguments, but got 0.
EXIT=2

$ pnpm exec tsc --noEmit            # com src/smoke-indexed.ts injetado (temp)
src/smoke-indexed.ts(2,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
EXIT=2
```

Arquivos temporários (`smoke-invalid.ts`, `smoke-indexed.ts`) removidos e
worktree destruído ao final; `git status` no repositório principal permanece
limpo — nenhum artefato de smoke check foi commitado.

## Conclusão
`strict`, `noUncheckedIndexedAccess` e o pin de `packageManager` funcionam
como esperado. Nenhum defeito de produção encontrado.

---

# Relatório de execução — T004/T006–T009 (issues #9, #11, #12, #13, #14)

Commit testado: `3b05061` (PR #394 draft, branch `feat/001-fundacao-domain`,
base `main`@`9466358`).
Ambiente: worktree do dev-back-end, Node 24.14.1 (via nvm local, sandbox de QA só
tinha Node 16 por padrão), pnpm 11.18.0 via `corepack prepare pnpm@11.18.0
--activate` (sandbox de QA não tinha corepack pnpm ativo por padrão).

## Comandos e resultados

```
$ pnpm install
✓ Lockfile passes supply-chain policies
+ vitest, @types/node, typescript resolvidos
pnpm-lock.yaml regenerado (+744 linhas — entradas de vitest ainda não
commitadas pelo dev-back-end, conforme sinalizado no handoff)
EXIT=0

$ pnpm exec tsc --noEmit
EXIT=0 (sem output — sem erro de tipo)

$ pnpm exec vitest run tests/bounded-contexts/ingestao-identificacao/domain
 Test Files  8 passed (8)
      Tests  40 passed (40)
EXIT=0

$ pnpm add -D @vitest/coverage-v8@4.1.10 allure-vitest@3.10.2   # infra de QA
EXIT=0

$ pnpm exec vitest run --coverage
 Test Files  8 passed (8)
      Tests  40 passed (40)
Statements 92.91% | Branches 100% (38/38) | Functions 84% | Lines 92.8%
EXIT=0
allure-results/ gerado com 40 arquivos *-result.json
```

## Conclusão
40/40 testes reais (vitest 4.1.10, não a 0.34 usada pelo dev-back-end) passando.
`tsc --noEmit` limpo. Branch coverage 100% nas invariantes de validação de
domínio. Nenhum defeito de produção encontrado. Ver `qa/coverage-final.md`
para análise das linhas de statement/function não cobertas (acessores
triviais, não invariantes).

---

# Relatório de execução — T016/T019 (issues #21, #24) — PR #402

Commit testado: `2fee2e2` (PR #402, branch `feat/001-c-us1`, base
`main`@`b1a2bf4`). Ambiente: worktree do dev-back-end (compartilhado com
agente paralelo na trilha 001-E), Node 24.18.1 (nvm), pnpm 11.18.0.

## Comandos e resultados

```
$ source ~/.nvm/nvm.sh && nvm use 24
Now using node v24.18.1

$ pnpm install --frozen-lockfile
Already up to date
EXIT=0

$ pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ pnpm run lint              # eslint .
EXIT=0 (sem output)

$ pnpm run test               # vitest run --passWithNoTests
Test Files  12 passed (12)
Tests       63 passed (63)
EXIT=0

$ pnpm exec vitest run --coverage
Test Files  12 passed (12)
Tests       63 passed (63)
Statements 92.52% | Branches 91.37% | Functions 90.32% | Lines 92.44%
EXIT=0
allure-results/ regenerado, 63 arquivos *-result.json, todos passed
```

## Conclusão
63/63 testes passando (11 no agregado `Orcamento.receber`/`Orcamento`, 4 no
`S3ArmazenamentoBrutoGateway`, 48 pré-existentes de outras trilhas — nenhuma
regressão). `tsc --noEmit` e `eslint .` limpos. `s3-armazenamento-bruto.gateway.ts`
com 100% de cobertura (statements/branches/functions). Nenhum defeito de
produção encontrado.

## Observação (não bloqueante)
O commit `24c6403` (T019) adicionou, além de `@aws-sdk/client-s3`
(dependência esperada desta task), `fastify` e `zod` a `package.json`/
`pnpm-lock.yaml` — dependências não usadas por nenhum arquivo do diff deste
PR (pertencem à trilha 001-E, em desenvolvimento paralelo no mesmo
worktree). Não quebra build/lint/teste; sinalizado ao dev-back-end como
possível arraste acidental de lockfile do worktree compartilhado, para
avaliar remoção em commit separado.

---

# Relatório de execução — T044–T047 (issues #49–#52) — PR #404

Commit testado: `56cf669` (PR #404, draft, branch `feat/001-e-us4-v2`, base
`main`@`6eaab14`).

## Comandos e resultados

```
$ source ~/.nvm/nvm.sh && nvm use 24
Now using node v24.18.1

$ pnpm install --frozen-lockfile
Already up to date
EXIT=0

$ pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ pnpm run lint              # eslint .
EXIT=0 (sem output)

$ npx vitest run --coverage
Test Files  12 passed (12)
Tests       68 passed (68)      # 66 pré-existentes + 2 novos (QA)
Statements 93.1% | Branches 94.82% | Functions 90.32% | Lines 93.02%
EXIT=0
```

## Testes adicionados por QA (sem alterar produção)
Em `tests/bounded-contexts/ingestao-identificacao/contract/status.controller.test.ts`:
1. Reforço do teste `200 PENDENTE_REVISAO_HUMANA` — passou a afirmar
   `historico[0]` (agente/nivelConfianca) e `resultadoAtual`, que antes só
   checava `status`.
2. Novo teste: `200 PENDENTE_REVISAO_HUMANA seguido de confirmação humana` —
   valida via HTTP (`app.inject`) que o histórico da tentativa do
   Classificador (40%) permanece intacto após `registrarConfirmacaoHumana`,
   com a nova entrada (HUMANO, 100%) anexada — mesmo critério do T045, mas
   exercitado na camada HTTP/serialização, não só no caso de uso.
3. Novo teste: `propaga (500) erro inesperado do repositório sem mascarar
   como 404` — cobre o branch de rethrow do controller (antes 75% branch,
   0 teste).

## Conclusão
68/68 testes passando (0 falhas, 0 regressões). `tsc --noEmit` e `eslint .`
limpos. Os 3 arquivos do diff de produção (T044/T046/T047) com 100%
statements/lines. Nenhum defeito de produção encontrado. Critérios de
aceite de US4 (3 estados consultáveis, 404 RFC 7807, histórico preservado
após confirmação humana) verificados tanto no nível de contrato quanto de
integração.

## Limitação de ambiente aceita
`DrizzleOrcamentoRepository` real (T011, issue #16) ainda não mergeado —
sem wiring de produção contra Aurora nesta task; esperado e fora de escopo
deste PR (confirmado pelo dev-back-end na invocação).

---

# Relatório de execução — T011 (issue #16) — PR #410

Commit testado: `2c65c3b` (PR #410, draft, branch
`001-t011-drizzle-orcamento-repository`, base `main`). Ambiente: worktree
dedicado `nexus-orc-back-issue-15` (repositório principal em uso por outro
agente, não tocado). Node 24.14.0 via `/c/nvm4w/nodejs` direto (node/pnpm/
corepack não estavam no PATH da sessão), pnpm 11.18.0. Postgres 16
(`pgvector/pgvector:pg16`) via `docker-compose.yml`, container
`nexus-orc-back-postgres-1` (estava parado, iniciado com `docker start`).

## Comandos e resultados

```
$ docker start nexus-orc-back-postgres-1
$ pnpm install --frozen-lockfile
Already up to date
EXIT=0

$ DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo pnpm run db:migrate
[✓] migrations applied successfully!
EXIT=0

$ pnpm run lint              # eslint .
EXIT=0 (sem output)

$ pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ DATABASE_URL=... pnpm run test     # vitest run --passWithNoTests
Test Files  14 passed (14)
Tests       79 passed (79)
EXIT=0

$ pnpm run test               # sem DATABASE_URL — confirma skip gracioso
Test Files  12 passed | 2 skipped (14)
Tests       68 passed | 10 skipped (78)
EXIT=0

$ DATABASE_URL=... pnpm exec vitest run --coverage
Test Files  14 passed (14)
Tests       79 passed (79)
Statements 94.2% | Branches 92% | Functions 90.54% | Lines 94.14%
EXIT=0
allure-results/ regenerado, 79 arquivos *-result.json, todos passed
```

## Testes criados por QA (sem alterar produção)
`tests/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-orcamento.repository.test.ts`
— 5 testes de integração contra Postgres real, formalizando os 4 cenários já
validados manualmente pelo autor do PR + 1 caso adicional (`buscarPorId`
para id inexistente, fechando o único branch residual que sobrava de
statements):
1. `buscarPorId` retorna `undefined` para id inexistente.
2. `salvar` RECEBIDO → recarregar → classificação de alta confiança → salvar
   → recarregar confirma `CLASSIFICADO` + 1 entrada de histórico.
3. Confiança baixa → `PENDENTE_REVISAO_HUMANA` → confirmação humana → salvar
   → recarregar confirma `CLASSIFICADO` + 2 entradas de histórico (2ª com
   `agente: HUMANO`).
4. Re-salvar o mesmo agregado sem transição nova não duplica histórico.
5. **Duas chamadas concorrentes de `salvar()` para o mesmo `orcamentoId`**
   (2 conexões Postgres reais e distintas, simulando retry de Lambda +
   invocação original) resultam em exatamente 1 entrada de histórico — prova
   automatizada do achado MAJOR corrigido pelo `backend-reviewer` (`SELECT
   ... FOR UPDATE`).

Nota técnica de limpeza: `salvar()` abre sua própria transação Drizzle, então
não pode ser aninhada sob um `BEGIN externo revertido ao final (padrão de
T010) — o `COMMIT` interno comprometeria o `BEGIN` externo. A limpeza por
teste usa `DELETE` explícito por `orcamentoId`, com
`session_replication_role = replica` só durante a limpeza para contornar o
trigger de append-only de `orcamentos_historico` (nunca em produção,
restaurado para `origin` no `finally`).

## Conclusão
79/79 testes passando (0 falhas, 0 regressões). `tsc --noEmit` e `eslint .`
limpos. Suíte sem `DATABASE_URL` pula corretamente as 10 integrações contra
Postgres (T010 + T011), demais 68 continuam passando — dev local sem Docker
não quebra. `drizzle-orcamento.repository.ts` sobe de 0%→100%
statements/lines/functions, 0%→88.09% branch. Nenhum defeito de produção
encontrado — os 4 cenários de validação manual do PR agora são automação
repetível e protegem a regressão de concorrência (achado MAJOR da revisão
anterior) daqui para frente.

---

# Relatório de execução — T050–T055 (issues #55–#60) — PR #416

Commit testado: `62339a1` (PR #416, draft, branch `feat/001-f-us5`, base
`main`). Trilha 001-F (US5 — confirmação humana e reprocessamento). Depende
de US2 (trilha 001-D, PR #413, já mergeada) para o estado
`PENDENTE_REVISAO_HUMANA`. Ambiente: worktree
`.claude/worktrees/agent-a502139ff15a39bc2`, Node 24.13.0, pnpm via
`corepack pnpm` (pnpm não estava no PATH direto neste worktree).

## Comandos e resultados

```
$ corepack pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ corepack pnpm run typecheck:infra  # tsc --noEmit -p infra/tsconfig.json
EXIT=0 (sem output)

$ corepack pnpm run lint             # eslint .
EXIT=0 (sem output)

$ corepack pnpm test                 # vitest run --passWithNoTests
Test Files  38 passed | 3 skipped (41)
Tests       176 passed | 12 skipped (188)
EXIT=0

$ corepack pnpm exec vitest run --coverage
Test Files  38 passed | 3 skipped (41)
Tests       176 passed | 12 skipped (188)
All files: Statements 86.14% | Branches 72.86% | Functions 80.44% | Lines 85.98%
EXIT=0

$ corepack pnpm exec cdk synth ConfirmarRevisaoHumanaLambdaRoleStack
EXIT=0 (synth limpo, 82 feature flags não configuradas — aviso informativo do CDK, não é erro)
```

Os 12 testes skipped são os mesmos de integração Drizzle/Postgres
(`drizzle-orcamento.repository.test.ts` e os dois `*.schema.test.ts`) que
dependem de `DATABASE_URL`/docker-compose local — pré-existentes, não
relacionados a esta trilha, mesma limitação já registrada nas rodadas T011.

## Critério de aceite (US5) verificado
- **200 confirma e transiciona para `CLASSIFICADO` com `agenteOrigem: HUMANO`,
  histórico anterior intacto**: `confirmar-revisao-humana.test.ts` (nível
  aplicação/agregado) e `revisao-humana.controller.test.ts` (nível HTTP,
  `app.inject`) — ambos afirmam `status`, `resultadoAtual.agenteOrigem`,
  `resultadoAtual.nivelConfianca === 100` e `historico` com 2 entradas
  (`CLASSIFICADOR` preservada + `HUMANO` anexada). Confirmado por leitura de
  `Orcamento.registrarConfirmacaoHumana` (`orcamento.aggregate.ts:157-169`):
  guarda de transição (`if (this._status !== "PENDENTE_REVISAO_HUMANA")`) e
  `this._historico.push(...)` (nunca reatribui/limpa o array).
- **409 quando não está `PENDENTE_REVISAO_HUMANA`**: `TransicaoInvalidaError`
  lançado pelo agregado, mapeado pelo controller para Problem Details 409 —
  testado no nível de agregado (não publica evento, não salva) e no nível
  HTTP (`Content-Type: application/problem+json`).
- **404 quando não existe**: `OrcamentoNaoEncontradoParaRevisaoHumanaError` —
  testado no caso de uso e via HTTP.
- **400 para body/params inválidos**: Zod (`revisaoHumanaBodySchema`) rejeita
  campos ausentes/vazios; `orcamentoIdParamSchema` (reaproveitado de
  `status.schema.ts`) rejeita `orcamentoId` não-UUID — testado em contract
  test isolado e via HTTP.
- **Reprocessamento só por ação humana explícita**: não há rota nem caso de
  uso que dispare reclassificação automática a partir de
  `PENDENTE_REVISAO_HUMANA`; a única transição de saída desse estado é
  `registrarConfirmacaoHumana`, acionada exclusivamente pelo endpoint deste
  PR.

## Cobertura dos arquivos do diff
- `confirmar-revisao-humana.ts`: **100%** statements/branches/functions/lines.
- `revisao-humana.controller.ts`: 96% statements/lines, **90% branch** — única
  linha não coberta é o rethrow de erro inesperado (`throw erro;`, fallback
  500 não mapeado), mesmo padrão já aceito em `status.controller.ts` nas
  rodadas T044–T047 (não é invariante de negócio, é o caminho de erro
  verdadeiramente inesperado do framework).
- `revisao-humana.schema.ts`: 100%.
- IAM (`confirmar-revisao-humana-lambda-role-stack.ts`): sem cobertura de
  linha via vitest (CDK stack, validado por `cdk synth` bem-sucedido, não por
  teste unitário — mesmo padrão das rodadas anteriores de IAM).

## Conclusão
176/176 testes passando (0 falhas, 0 regressões), `tsc --noEmit`
(app + infra) e `eslint .` limpos, `cdk synth` limpo para o novo stack.
Nenhum defeito de produção encontrado. Critérios de aceite de US5
(200/409/404/400, histórico preservado, reprocessamento só por ação humana)
verificados tanto no nível de caso de uso/agregado quanto de HTTP.

## Achado não-bloqueante (já sinalizado pelo backend-reviewer)
Mesmo padrão save-then-publish sem outbox de `ClassificarOrcamento` (US2,
PR #413) se repete em `ConfirmarRevisaoHumana` (linhas 56-60: `salvar()`
seguido de `eventPublisher.publicar()` sem transação/outbox). Já encaminhado
ao `arquiteto-back` pelo backend-reviewer; QA concorda que não bloqueia esta
entrega (mesmo risco arquitetural já aceito e rastreado em US2, decisão de
padrão é do arquiteto, não de código específico desta task).

---

# Relatório de execução — T020–T026 (issues #25–#31) — PR #426

Commit testado: `68d034f` (PR #426, branch `feat/001-c-us1`, base `main`).
US1 (Ingestão multi-canal) completa. Primeira validação de QA (não reteste).
Ambiente: worktree `.claude/worktrees/agent-a2007af5ce25cedb3`, Node 24.18.0,
pnpm 11.18.0 via `corepack pnpm`.

## Comandos e resultados

```
$ corepack pnpm install --frozen-lockfile
Already up to date
EXIT=0

$ corepack pnpm run typecheck        # tsc --noEmit
EXIT=0 (sem output)

$ corepack pnpm run typecheck:infra  # tsc --noEmit -p infra/tsconfig.json
EXIT=0 (sem output)

$ corepack pnpm run lint             # eslint .
EXIT=0 (sem output)

$ corepack pnpm test                 # vitest run --passWithNoTests
Test Files  46 passed | 6 skipped (52)
Tests       214 passed | 27 skipped (241)
EXIT=0

$ corepack pnpm exec vitest run --coverage
Test Files  46 passed | 6 skipped (52)
Tests       214 passed | 27 skipped (241)
All files: Statements 82.03% | Branches 71.38% | Functions 73.94% | Lines 82.22%
EXIT=0
allure-results/ gerado (46 arquivos executados, todos passed)

$ corepack pnpm exec cdk synth --quiet
Successfully synthesized to .../cdk.out
8 stacks (IngestaoIdentificacaoStorageStack, ReceberOrcamentoLambdaRoleStack,
DominioEventBusStack, ClassificadorQueueStack, ClassificadorLambdaRoleStack,
ConfirmarRevisaoHumanaLambdaRoleStack, ExtratorQueueStack, ValidadorQueueStack)
EXIT=0 (1 warning informativo de cross-stack-reference, não bloqueante)
```

## Tentativa de integração Postgres real (não bloqueante ao gate)
```
$ docker compose up -d postgres
Container ...-postgres-1 Started

$ DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo corepack pnpm run db:migrate
$ drizzle-kit migrate
...
[ELIFECYCLE] Command failed with exit code 1.
EXIT=1 (erro genérico de conexão, sem detalhe de causa — mesma limitação de
ambiente Windows já conhecida e sinalizada na invocação: `pg`/Postgres via
TCP falha do host, funciona via socket dentro do container; CI Linux não
reproduz)
```
Container derrubado (`docker compose down`) após a tentativa. Os 6
arquivos/27 casos de integração Drizzle/Postgres (incluindo
`drizzle-idempotency-key.repository.test.ts`, T020) seguem `skip`, mesma
limitação já registrada em rodadas anteriores (T011, T050-T055).

## Achados de segurança/resiliência verificados por leitura de código
- **Idempotência atômica** (`DrizzleIdempotencyKeyRepository.reservar`):
  única instrução `INSERT ... ON CONFLICT (chave) DO UPDATE ... WHERE
  expira_em <= now() RETURNING` — o lock de linha do Postgres sobre a chave
  única garante que só uma entre N chamadas concorrentes recebe a linha de
  `RETURNING`; as demais leem o `orcamentoId` já commitado pela vencedora via
  `SELECT` de fallback. Não é um check-then-act (leitura separada da
  escrita) — a exclusão mútua vem da própria instrução SQL, não de lógica de
  aplicação. Os 3 testes de integração cobrem a semântica sequencialmente
  (chave livre, chave conflitante dentro do TTL, chave expirada); não há um
  teste de 2 conexões simultâneas em `Promise.all` (diferente do padrão de
  T011 para `salvar()`), mas a garantia de atomicidade de uma única
  instrução SQL não depende desse tipo de teste para ser válida — registrado
  como risco residual de baixa severidade em `qa/test-plan.md`.
- **Object Lock × Lifecycle**: `RETENCAO_UPLOAD_PENDENTE_HORAS = 2` (PUT
  presigned de `gerarUrlUpload`) é menor que `EXPIRACAO_UPLOAD_PENDENTE_DIAS
  * 24 = 24` (lifecycle rule) — guarda em runtime no construtor do stack
  (`IngestaoIdentificacaoStorageStack`) lança erro se a invariante for
  violada; `cdk synth` confirma que os valores atuais não violam a guarda.
  Teste unitário do gateway confirma `ObjectLockMode: 'GOVERNANCE'` e
  `ObjectLockRetainUntilDate` ≈ `now + 2h` no comando assinado.
- **Referência confirmada nunca aponta para `pending-uploads/`**:
  `confirmarUpload` sempre executa `CopyObjectCommand` para o prefixo
  definitivo do canal antes de devolver a `ReferenciaS3` usada por
  `ReceberOrcamento` — confirmado por leitura de código e pelo teste de
  `confirmar-upload.controller.test.ts` (200 com o mesmo `orcamentoId`).
- **IAM least privilege**: `ReceberOrcamentoLambdaRole` concede apenas
  `s3:GetObject`/`s3:PutObject`/`s3:PutObjectRetention` sobre
  `arnForObjects('*')` do bucket — nenhum `s3:DeleteObject` em nenhuma
  policy statement, confirmado por inspeção do código-fonte da stack.

## Conclusão
214/214 testes reais passando (0 falhas, 0 regressões — mesmos números
declarados no corpo da PR), 27 skipped (integração Postgres sem
`DATABASE_URL`, limitação de ambiente pré-existente). `tsc --noEmit`
(app + infra) e `eslint .` limpos. `cdk synth` limpo (8 stacks). Nenhum
defeito de produção encontrado. Os 3 achados do `backend-reviewer` (2 MAJOR
+ 1 BLOCKER) verificados como corrigidos por leitura de código e cobertos
por teste automatizado onde o ambiente permitiu (mockado); a atomicidade do
admission gate de idempotência foi verificada por inspeção de código e
prova parcial (testes sequenciais), sem execução real contra Postgres nesta
rodada por limitação de ambiente.
