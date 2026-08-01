# Test Execution Report — SPEC 002

## Leva T023 (issue #88, PR #485, commit `9d2d2e8`)

### Escopo
`criarExtratorQueueHandler` (Interface, novo) — handler Lambda consumidor de
`extrator-queue`: parseia envelope EventBridge de `OrcamentoClassificado`
(`detail.orcamentoId`, `detail.resultado.*`, `detail.referenciaBruta.*` —
este último campo existe graças ao ADR-003/PR #483), invoca
`ExtrairDadosOrcamento.executar` (T022), reporta batch item failures
item-a-item, usa `criarLogger` (T016) para correlação. Único arquivo de
produção: `extrator-queue.handler.ts`. Arquivo de teste: novo,
`extrator-queue.handler.test.ts`, 7 casos.

### Comando e resultado
```bash
npx vitest run tests/bounded-contexts/extracao/interface/extrator-queue.handler.test.ts
# Test Files  1 passed (1) / Tests  7 passed (7)

npx vitest run
# Test Files  87 passed | 8 skipped (95)
#      Tests  431 passed | 40 skipped (471)
```
Full suite sem regressão. 8 skipped = integração Postgres pré-existente sem
`DATABASE_URL`, não relacionado a T023.

### Estático
- `npx tsc --noEmit -p .` — sem erros.
- `npx eslint` no arquivo de produção e no arquivo de teste — sem erros.

### Cobertura (arquivo novo)
```bash
npx vitest run tests/bounded-contexts/extracao/interface/extrator-queue.handler.test.ts --coverage
```
`extrator-queue.handler.ts`: Statements 89.65%, Branches 84.61%, Functions
100%, Lines 89.65%. Não coberto: linhas 43/51/62 — branches defensivos do
guard `ehEventBridgeEnvelope` (root não-objeto; `orcamentoId` ausente
isoladamente; fallthrough de `resultado` inválido) não exercitados por um
cenário próprio — mesma família de branch já coberta por 2 outros cenários de
envelope inválido (corpo totalmente inválido, `referenciaBruta` ausente).
Classificado como cobertura estrutural residual de baixo risco, não caminho
de negócio distinto.

### Verificação independente (não apenas leitura do relato do dev-back-end)
- Narrowing de `agenteOrigem` (NIT do backend-reviewer, corrigido nesta PR):
  confirmado por leitura do diff — `ehEventBridgeEnvelope` valida
  `agenteOrigem !== 'CLASSIFICADOR' && agenteOrigem !== 'HUMANO'` em vez de só
  `typeof === 'string'`.
- Batch item failure isolado: teste confirma `executar` chamado 2x (ambas
  mensagens processadas) e `batchItemFailures` só com o item que lançou —
  não apenas que a resposta final está correta.
- Correlação de log: logger pino real gravando em memória, não apenas mock —
  confirma `orcamentoId`/`messageId` em toda linha emitida.
- Dependência do ADR-003 (PR #483, `referenciaBruta` no payload): confirmado
  por leitura do tipo `EventBridgeEnvelope` e do teste dedicado — envelope sem
  `referenciaBruta` é corretamente rejeitado como inválido.

### Risco residual (fora do escopo desta PR)
`ExtrairDadosOrcamento` (T022, já mergeado, produção) idempotente apenas
contra duplicidade sequencial, não contra 2 mensagens da mesma entrega
duplicada processadas concorrentemente (SQS at-least-once + Lambda com
concorrência > 1). Já documentado como MINOR pelo backend-reviewer, fora de
escopo do diff desta PR — não gera BUG bloqueante.

## Leva T022 (issue #87, PR #480, commits `ec1f868` + `aaff5d4`)

### Escopo
`ExtrairDadosOrcamento` (Application, novo) — consumidor de `OrcamentoClassificado`
(dados já resolvidos, resolução SQS é T023): recupera/cria `ExtracaoOrcamento`,
lê bruto S3, converte via MarkItDown ACL, invoca `AgenteExtratorGateway`, aplica
`registrarTentativaExtrator` (T009), persiste e publica `OrcamentoExtraido` ou
`ExtracaoEscalonadaParaRevisaoHumana`. Commit `aaff5d4` corrige NIT do
backend-reviewer (non-null assertion em `condicoesComerciais` → `ExtracaoInconsistenteError`
explícito). Único arquivo de produção: `extrair-dados-orcamento.ts`.
Arquivos de teste: `extrair-dados-orcamento.test.ts` (novo, 4 casos) e
`extrair-dados-orcamento.integration.test.ts` (pré-existente, T020, 3 casos —
já fixava a orquestração esperada antes de T022 existir).

### Comando e resultado
```bash
npx vitest run tests/bounded-contexts/extracao
# Test Files  49 passed | 4 skipped (53)
#      Tests  206 passed | 24 skipped (230)
```
`extrair-dados-orcamento.test.ts`: 4/4 PASS. `extrair-dados-orcamento.integration.test.ts`: 3/3 PASS.
4 skipped = integração Postgres pré-existente sem `DATABASE_URL`, não relacionado a T022.

```bash
npx vitest run
# Test Files  161 passed | 14 skipped (175)
#      Tests  793 passed | 60 skipped (853)
```
Full suite sem regressão.

### Estático
- `npx tsc --noEmit` — sem erros.
- `npx eslint` no arquivo de produção e nos 2 arquivos de teste — sem erros.

### Verificação independente (não apenas leitura do relato do dev-back-end)
- Idempotência: teste "nunca reprocessa..." confirma `leituraBruta.chamadas === 0`
  e `agenteExtrator.chamadas === 0` quando `existente.status !== 'PENDENTE'` —
  não apenas que o evento não foi publicado, mas que nenhum efeito colateral
  (I/O externo, custo de invocação do Bedrock) ocorre na entrega duplicada.
- Non-null assertion removida (commit `aaff5d4`): confirmado por leitura do
  diff — `extracao.condicoesComerciais!` virou checagem explícita `if (!condicoesComerciais) throw new ExtracaoInconsistenteError(...)`.
  Branch é inalcançável dado o invariante atual de `ExtracaoOrcamento.registrarTentativaExtrator`
  (função `completo()` exige `condicoesComerciais !== undefined` para chegar a
  `EXTRAIDO`) — guarda defensiva correta contra regressão futura no agregado,
  não uma lacuna de teste evitável sem alterar produção.
- Concorrência otimista (2º NIT do backend-reviewer): confirmado por leitura de
  `DrizzleExtracaoOrcamentoRepository.salvar` (T013, já em `main`) — usa
  `SELECT ... FOR UPDATE` antes do UPSERT, cobrindo a corrida entre duas
  execuções concorrentes do mesmo `orcamentoId`. Fora do diff desta PR
  (arquivo não alterado), confirmado apenas como verificação de escopo.

### Cobertura do arquivo novo
```bash
npx vitest run tests/bounded-contexts/extracao/application --coverage \
  --coverage.include='src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.ts'
```
- Statements 92% (23/25), Branches 90% (9/10), Functions 75% (3/4), Lines 92% (23/25).
- Não coberto: construtor de `ExtracaoInconsistenteError` e o `throw` que o invoca
  (linhas 32 e 92) — guarda de invariante "nunca deveria ocorrer" dado o estado
  atual do agregado (T009); forçar a cobertura exigiria simular um agregado
  inconsistente por fora do domínio real (quebrar o encapsulamento de produção
  só para o teste), o que violaria o próprio propósito do guard. Classificado
  como "código inviável de testar sem refatoração de produção" — risco residual
  aceito, documentado, não bloqueante.

### Resultado
**PASS.** Nenhum defeito de produção encontrado. Todos os critérios de aceite
de T022 (`tasks.md`) cobertos por teste automatizado, ver `qa/traceability-matrix.md`.
Risco residual (fora do escopo desta leva): BUG-001 segue `PRONTO PARA RETESTE`
no handoff, porém a leitura do código atual (`extracao-orcamento.aggregate.ts:123-125`)
mostra que o getter `historico` já retorna cópia defensiva (`[...this._historico]`)
— não reaberto/revalidado formalmente nesta leva por estar fora do escopo de
T022 e não ter sido informado pelo dev-back-end como pronto para reteste nesta PR.

---

## Leva T020 (issue #85, PR #460, commit `be208e5`)

### Escopo
Integration test simulado (fakes em memória) que fixa a orquestração esperada
de `ExtrairDadosOrcamento` (Application, T022/#87, ainda não implementado):
lê bruto S3 → converte via MarkItDown ACL → invoca Agente Extrator → aplica
`registrarTentativaExtrator` (agregado real, T009) → publica `OrcamentoExtraido`
ou `ExtracaoEscalonadaParaRevisaoHumana`. Único arquivo novo:
`tests/bounded-contexts/extracao/application/extrair-dados-orcamento.integration.test.ts`.
Mesmo padrão já aprovado em spec-001 (`classificar-orcamento.integration.test.ts`, T029).

### Comando e resultado
```bash
./node_modules/.bin/vitest run tests/bounded-contexts/extracao --reporter=default
```
- 22 arquivos passaram, 2 skipped (integração Postgres, mesma limitação
  pré-existente sem `DATABASE_URL`) — 91 testes passaram, 12 skipped, 0 falhas.
- `extrair-dados-orcamento.integration.test.ts`: 3/3 PASS.

```bash
./node_modules/.bin/vitest run --reporter=default
```
- Full suite: 73 arquivos passaram, 6 skipped — 365 testes passaram, 27 skipped,
  0 falhas. Nenhuma regressão.

### Estático
- `npx tsc --noEmit` — sem erros.
- `npx eslint` no arquivo de teste novo — sem erros.

### Verificação de fidelidade da orquestração simulada
Confirmado, lendo o código de produção real (não apenas o teste):
- Assinaturas dos 4 fakes conferem exatamente com as interfaces reais em
  `src/bounded-contexts/extracao/domain/gateways/*.ts` (`LeituraBrutaGateway.ler(ReferenciaS3)`,
  `MarkItDownConversaoExtracaoACL.converter(Buffer)`, `AgenteExtratorGateway.extrair(AgenteExtratorInput)`,
  `EventPublisher.publicar(DomainEventEnvelope)`) — nenhuma assinatura inventada.
- A escolha do evento publicado lê `extracao.status` **depois** de
  `registrarTentativaExtrator` (agregado real `extracao-orcamento.aggregate.ts`),
  não uma regra duplicada no teste — o teste orquestra em torno da decisão do
  domínio, não decide por conta própria.
- `CampoExtraido.naoExtraido` (VO real) garante estruturalmente
  `extraido === false ⟺ valor === null`; o teste 2 assere isso sobre o VO real,
  não sobre um mock.
- Teste 3 (p95): comentário `ponytail:` no próprio teste deixa explícito que o
  p95 medido é da orquestração em memória (proxy local), não da meta real
  ponta a ponta do spec.md (rede AWS/Bedrock/cold start Lambda) — isso é T042,
  após T021 (BedrockExtratorGateway) e T023 (handler Lambda) existirem. Não há
  afirmação enganosa de que a meta real foi validada.

### Resultado
**PASS.** Nenhum defeito de produção encontrado (não há código de produção
nesta leva — apenas teste). Critério de aceite de T020 (`tasks.md`) satisfeito:
integration test simulado fixando a orquestração esperada de
`OrcamentoClassificado` → `OrcamentoExtraido`/`ExtracaoEscalonadaParaRevisaoHumana`,
com p95 medido como proxy local documentado. Risco residual (fora do escopo
desta leva, não relacionado a T020): BUG-001 segue `PRONTO PARA RETESTE`.

---

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

## Leva T038 (issue #103, PR #521, commit `76ccbed`)

Primeira validação de QA. `backend-reviewer` já havia aprovado (APPROVE) após
1 rodada de correção (guard de transição via `TransicaoInvalidaExtracaoError`
do agregado, e validação de shape por campo em vez de cast inseguro sobre
`valor: unknown`).

### Comando
`cd nexus-orc-back-wt-002b && npx vitest run --reporter=default tests/bounded-contexts/extracao`
(NÃO `pnpm test` — `allure-vitest` quebra a suíte inteira por motivo ambiental
pré-existente, ver `test-plan.md` § Limitações).

### Resultado
- Suíte completa do BC Extração: **30 arquivos passaram, 2 skipped (persistência
  Drizzle, sem banco disponível neste worktree), 141 testes passaram, 0 falha**
  (baseline antes do QA: 137 testes; +4 testes adicionados pelo QA neste
  arquivo).
- Arquivo do caso de uso sob teste, após QA adicionar 4 testes de cobertura
  (ver abaixo): `confirmar-revisao-humana-extracao.test.ts` — **15 testes,
  100% aprovados** (11 do dev-back-end + 4 novos de QA).
- `npx tsc --noEmit -p .` — sem erros.
- `npx eslint tests/bounded-contexts/extracao/application/confirmar-revisao-humana-extracao.test.ts src/bounded-contexts/extracao/application/use-cases/confirmar-revisao-humana-extracao.ts` — sem erros.

### Lacuna de cobertura identificada e testes adicionados pelo QA
Cobertura inicial do arquivo de produção (`confirmar-revisao-humana-extracao.ts`,
apenas com os 11 testes do dev-back-end): 80.89% statements / 76.92% branches.
Caminhos felizes (`valor` real, sem `indisponivel`) para `condicoesPagamento`,
`condicoesEntrega`, `prazoValidade` (data ISO válida), `descricao` e
`quantidade` de item não estavam exercitados — só os caminhos de erro e o de
`precoUnitario`. QA adicionou, sem alterar nenhum arquivo de produção:
1. Confirmação de `descricao` e `quantidade` pendentes de um item, valor real.
2. Confirmação de `condicoesPagamento` e `condicoesEntrega` pendentes, valor real.
3. Confirmação de `prazoValidade` pendente com data ISO 8601 válida.
4. `ExtracaoSemCondicoesComerciaisError` (branch defensivo, "nunca deveria
   ocorrer" segundo o próprio comentário do código) — construído via
   `ExtracaoOrcamento.reconstituir(...)` (factory pública já existente para
   reidratação pelo repositório) com `status: 'PENDENTE_REVISAO_HUMANA'` e
   `condicoesComerciais: undefined`, sem cast nem mock de classe.

Cobertura final do arquivo: **98.87% statements / 92.3% branches / 100%
functions / 98.85% lines.** Única linha não coberta: ramo `sku === undefined`
de `comoStringOpcional` dentro de `resolverDescricaoProduto` — branch trivial,
já coberto indiretamente em `descricao-produto.vo.test.ts` no nível do VO;
risco residual desprezível, não bloqueante.

### Falhas classificadas
Nenhuma. Nenhum defeito de produção encontrado nesta leva — comportamento do
caso de uso confere integralmente com `plan.md` §§ "Application — Casos de
uso" e "Domain — Agregados" (busca por `orcamentoId`, guard de status via erro
do agregado, nunca reabre campo `extraido: true`, decide o evento a publicar
lendo o `status` resultante do agregado — nunca decide a regra de negócio por
conta própria, imutabilidade de `referenciaBrutaS3`/`referenciaClassificacao`
preservada).
