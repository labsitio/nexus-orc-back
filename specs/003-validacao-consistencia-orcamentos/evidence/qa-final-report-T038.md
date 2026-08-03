# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T038

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #598 (draft)
- Branch: `148-contract-test-faixas-preco-categoria`
- Commits testados: `2b2c38b` (implementação inicial) + `4077746` (fix MINOR
  do backend-reviewer: reuso de `problemDetailsSchema`)
- Task: T038 [P] [US3] Contract test `POST`/`GET
  /v1/configuracoes/faixas-preco-categoria` (issue #148)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
Arquivo de produção novo: `src/bounded-contexts/validacao/interface/http/
faixa-preco-categoria.schema.ts` — apenas contrato Zod de borda
(`dinheiroSchema`, `faixaPrecoCategoriaRequestSchema`/`ResponseSchema`,
`listaFaixasPrecoCategoriaResponseSchema`), reexportando `problemDetailsSchema`
de `status.schema.ts` em vez de duplicá-lo (fix do commit `4077746`,
confirmado no código: `status.schema.ts` é a única definição real).

Escopo confirmado contra `tasks.md` (Phase 5, US3): T041 (Bedrock
categorizador), T043 (`DrizzleFaixaPrecoRepository.upsert`) e T044 (controller
HTTP) permanecem `[ ]` — não existe rota Fastify real para
`POST`/`GET /v1/configuracoes/faixas-preco-categoria` ainda. T038 é
explicitamente uma contract test escrita antes da borda real, mesmo padrão já
aceito em `decisao-humana.contract.test.ts` (T032, antes de T035/T036) e
`status.contract.test.ts` (T020, antes de T026) — confirmado lendo os três
arquivos lado a lado, mesma estrutura de nota de fronteira de escopo no
cabeçalho do teste.

O teste valida: (a) forma do contrato Zod (categoria não vazia,
`valorCentavos` inteiro não negativo, moeda não vazia); (b) para o critério de
aceite "faixa configurável, válida antes de persistir", exercita diretamente
`FaixaPreco.de` (T007, já implementado) — único ponto de produção que hoje
aplica a regra de negócio (moeda igual, mínimo <= máximo) — e confirma que
`FaixaPrecoInvalidaError` é o que o controller (T044) mapeará para 400 Problem
Details. Não há duplicação de regra de validação no teste: a asserção usa a
mensagem real lançada pelo VO (`(erroCapturado as Error).message`), não um
literal fixo, então o teste quebra se a mensagem de domínio mudar.

Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
Cobertos (escopo de T038):
- forma do contrato de request/response (`categoria`, `precoMinimo`,
  `precoMaximo` em centavos + moeda);
- rejeição de categoria vazia, `valorCentavos` negativo/não inteiro, moeda
  vazia;
- schema de lista para `GET`;
- regra de domínio "faixa válida" (mínimo <= máximo, mesma moeda) via VO real,
  ligando o contrato de borda ao único ponto de produção que já valida isso;
- 401 sem autenticação Cognito (forma do Problem Details, sem middleware real
  — middleware ainda não existe, fora do escopo de T038).

Não coberto / fora do escopo desta task, não lacuna:
- rota HTTP real via `app.inject` — depende de T044 (controller), ainda `[ ]`;
- persistência real (`upsert`) — depende de T043, ainda `[ ]`;
- papel administrativo Cognito real (403 para papel de comprador) — depende
  de T044 aplicar o middleware; hoje só a forma do Problem Details é
  validada.
- Quando T043/T044 forem implementadas, este teste MUST ser reescrito para
  `app.inject` real reusando os mesmos schemas — nota já deixada no
  cabeçalho do próprio arquivo de teste pelo dev-back-end.

## 4. Suítes executadas e comandos
Ambiente: `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 24`
(Node do sistema é incompatível, exigido >=24).

- `npx vitest run tests/bounded-contexts/validacao/contract/faixa-preco-categoria.contract.test.ts`
  → 10 testes passed, 0 falhas.
- `npx vitest run tests/bounded-contexts/validacao` (regressão completa do
  BC) → 61 arquivos passed, 6 skipped (integração Postgres/Drizzle sem
  `DATABASE_URL` local, pré-existente, não relacionado a T038); 338 testes
  passed, 30 skipped, 0 falhas.
- `npx eslint src/bounded-contexts/validacao/interface/http/faixa-preco-categoria.schema.ts tests/bounded-contexts/validacao/contract/faixa-preco-categoria.contract.test.ts`
  → sem achados.
- `npx tsc --noEmit -p tsconfig.json` → 5 erros pré-existentes, todos em
  outro bounded context (`ingestao-identificacao`) e em
  `cognito-jwt-verifier.ts`, por dependências (`@aws-sdk/s3-request-presigner`,
  `aws-lambda`, `aws-jwt-verify`) ausentes localmente — confirmado
  reproduzível na `main` antes desta branch, não introduzido por T038; zero
  erros nos arquivos desta task.
- CI do PR #598 (`gh run view`): job `ci` → FAILURE, mas a causa é
  `pnpm audit --audit-level=high` reportando 1 vulnerabilidade `high` em
  `brace-expansion` (dependência transitiva de `eslint`/`minimatch`),
  confirmado reproduzindo o mesmo `conclusion: failure` em execução mais
  recente da própria `main` (`gh run list --branch main --workflow=CI`) — não
  relacionado ao diff desta task, condição ambiental pré-existente do
  repositório.

## 5. Quantidade de testes por tipo
- Contrato (Zod, escopo desta task): 10 no arquivo `faixa-preco-categoria.contract.test.ts`.
- Regressão do BC `validacao` completo (pré-existente, não alterada por esta
  task): 328 testes adicionais (338 − 10), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T038): 10
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 338 passed, 30 skipped (integração
  Postgres/Drizzle, ambiental), 0 falhas

## 7. Cobertura inicial e final
`faixa-preco-categoria.schema.ts` é puramente declarativo (definições de
schema Zod, sem branch lógico próprio); a suíte completa do BC `validacao`
reporta:
- Statements: 26.63% (740/2778)
- Branches: 25.31% (362/1430)
- Functions: 26.14% (234/895)
- Lines: 26.84% (732/2727)

Percentual global do BC não é indicador direto desta task pontual (CRUD
transaction script ainda sem borda real implementada) — não havia
`coverage-baseline.md` registrado para comparação incremental. O código de
regra de negócio relevante (`FaixaPreco.de`, `faixa-preco.vo.ts`) já tem
cobertura própria em `faixa-preco.vo.test.ts` (5 testes, pré-existente, T007),
exercitado adicionalmente aqui pelo ângulo de contrato de borda. Nenhum
threshold foi reduzido; nenhum arquivo excluído da medição para inflar
percentual.

## 8. Allure
Não gerado nesta execução: reporter Allure do projeto (`pnpm test`)
ambientalmente incompatível com a versão local do vitest (mesma condição
`project_allure_vitest_incompat` já registrada em relatórios QA anteriores da
mesma spec — T035, T029). Execução e evidência usam `vitest run` com output
completo capturado acima. Sem dados sensíveis: os únicos valores usados no
teste são categorias sintéticas (`embalagens`, `informática`) e valores
monetários fictícios em centavos.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Nenhum introduzido por esta task. O teste MUST ser reescrito para
  `app.inject` real quando T043/T044 existirem (nota já presente no próprio
  arquivo) — risco de drift entre contrato e implementação real da rota até
  lá, mitigado pela reexecução planejada nessa fase futura, não uma lacuna
  desta task.
- Falha de CI do PR #598 é ambiental (vulnerabilidade transitiva pré-existente
  em `eslint`/`minimatch`, replicada na `main`) — não bloqueante para o
  escopo desta task, mas caberá ao dev-back-end/DevOps decidir sobre bump de
  dependência ou ajuste de `audit-level` em outra frente, fora do escopo de
  QA de T038.

## 11. Limitações do ambiente
- `pnpm test` (Allure) quebra por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run`.
- 6 arquivos de teste de integração Postgres/Drizzle skipped por ausência de
  `DATABASE_URL` local — não relacionado a T038 (schema de borda puramente
  declarativo, sem dependência de banco).
- Job `ci` do GitHub Actions em FAILURE por `pnpm audit`, condição
  pré-existente na `main`, não introduzida por esta task.

## 12. Parecer final
APROVADO PELO QA
