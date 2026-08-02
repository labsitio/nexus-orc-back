# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T027

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #548
- Branch: `003-t027-auth-cognito-status`
- Commit testado: `ddc3cd0`
- Task: T027 [US1] Interface: autenticação Cognito (JWT) no endpoint de
  status, mesmo esquema das specs 001/002 (issue #137)
- Primeira validação (sem BUG-XXX prévio)
- Revisão prévia de código: backend-reviewer, APPROVE

## 2. Resumo executivo
`criarAutenticacaoCognito` (novo, `validacao/interface/http/auth-cognito.middleware.ts`)
é um `preHandlerHookHandler` Fastify que reutiliza o verifier compartilhado
`src/interface/shared/cognito-jwt-verifier.ts` — mesma infraestrutura já
usada em `extracao` e `ingestao-identificacao`. Comparado byte-a-byte com
`extracao/interface/http/auth-cognito.middleware.ts`: lógica idêntica
(extrai Bearer, 401 Problem Details sem header, 401 Problem Details com
token inválido/expirado via `verifier.verify`, chama o handler em caso de
sucesso); só difere o comentário de topo (referencia T027 em vez de
T025/#90) e o path de import do `ProblemDetails` local ao BC. O teste novo
(`tests/bounded-contexts/validacao/interface/http/auth-cognito.middleware.test.ts`)
espelha exatamente o já existente em `extracao`, mudando só o import do SUT
e o nome do `describe`.

`route-opts.ts` e `status.controller.ts` só tiveram comentário atualizado
(de "T027, ainda não implementado" para "T027, `criarAutenticacaoCognito`")
— o mecanismo de injeção via `opts.preHandler` já existia desde T026 (#136)
e não muda nesta task. Sem alteração de contrato HTTP, sem alteração de
schema de resposta.

Nenhum defeito de produção encontrado. Nenhum enfraquecimento de asserção
foi necessário. Nenhum teste adicional foi necessário além dos 5 já
entregues pelo dev-back-end (1 de configuração do verifier + 4 de
comportamento HTTP) — cobrem os 4 critérios de aceite do esquema Cognito
(401 sem header, 401 sem Bearer, 401 token inválido/expirado, 200 com token
válido) e a config do `CognitoJwtVerifier` (`userPoolId`/`clientId`/
`tokenUse: 'access'`).

## 3. Requisitos cobertos e não cobertos
Cobertos (mesmo esquema Cognito JWT das specs 001/002, plan.md):
- 401 Problem Details quando `Authorization` ausente, `verify` não é
  chamado;
- 401 Problem Details quando `Authorization` não usa prefixo `Bearer`
  (`Basic xyz`), `verify` não é chamado;
- 401 Problem Details quando o token é inválido/expirado (`verify` rejeita),
  chamado com o token extraído;
- 200 e handler protegido é alcançado quando o token é válido;
- `CognitoJwtVerifier.create` configurado com `userPoolId`, `clientId`,
  `tokenUse: 'access'` — mesmo shape das specs 001/002.

Não coberto / fora do escopo desta task, não lacuna:
- wiring do `preHandler` na composição raiz do handler Lambda real (que
  User Pool/Client ID de produção é usado) — responsabilidade da
  composição raiz de deploy, fora do escopo de T027 (mesmo padrão de
  `extracao`/`ingestao-identificacao`, onde o middleware também é testado
  isoladamente e injetado depois na composição raiz);
- IAM role dedicada (T028) — task distinta, downstream.

## 4. Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/validacao/interface/http/auth-cognito.middleware.test.ts --coverage --coverage.include='src/bounded-contexts/validacao/interface/http/auth-cognito.middleware.ts' --reporter=default`
  → 1 arquivo, 5 testes, todos passando.
- `npx vitest run --reporter=default tests/bounded-contexts/validacao` (regressão do BC completo)
  → 26 suites passando, 3 skipped (integração Postgres real, sem
  `DATABASE_URL`/LocalStack local — `describe.skipIf`, padrão já usado em
  tasks anteriores), 132 testes passando, 15 skipped, 0 falhas.
- `npx tsc --noEmit` → sem erros.
- `npx eslint src/bounded-contexts/validacao/interface/http/auth-cognito.middleware.ts src/bounded-contexts/validacao/interface/http/route-opts.ts src/bounded-contexts/validacao/interface/http/status.controller.ts tests/bounded-contexts/validacao/interface/http/auth-cognito.middleware.test.ts` → sem achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest, conhecida
  — `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Unitário (Interface, com `aws-jwt-verify` mockado via `vi.hoisted`,
  requisição real via `app.inject` do Fastify): 5 — config do verifier;
  401 sem header; 401 sem Bearer; 401 token inválido/expirado; 200 token
  válido. Nenhum teste adicional criado pelo QA — os 5 já entregues são
  suficientes e corretos para o escopo de T027.
- Regressão do BC completo (pré-existente, não alterada por esta task): 127
  testes (132 - 5 novos), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T027): 5
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 132 passed, 15 skipped (26 suites), 0 falhas

## 7. Cobertura inicial e final
Não havia baseline anterior (arquivo novo nesta task). Medida via
`vitest run --coverage` (v8) restrita a `auth-cognito.middleware.ts`:
- Statements: 100% (11/11)
- Branches: 100% (2/2)
- Functions: 100% (2/2)
- Lines: 100% (11/11)

Threshold de cobertura do projeto não foi reduzido; nenhum arquivo foi
excluído da medição para inflar percentual.

## 8. Allure
Não configurado nesta execução: `pnpm test` (que dispara o reporter Allure
do projeto) está ambientalmente quebrado
(`project_allure_vitest_incompat`), condição pré-existente, não introduzida
por T027. Execução e evidência desta validação usam
`vitest run --reporter=default` com output completo capturado acima; sem
dados sensíveis — os únicos dados usados nos testes são tokens JWT
sintéticos (`token-invalido`, `token-valido`) e IDs de user pool/client
fictícios (`us-east-1_teste`, `client-teste`).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Wiring real do `preHandler` na composição raiz do Lambda (User Pool/
  Client ID de produção) não é exercitado por este teste unitário — mesmo
  padrão de risco aceito nas specs 001/002 (o middleware é testado isolado;
  a composição raiz de deploy não tem suíte automatizada neste
  repositório). Risco pré-existente, não introduzido por T027.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- Testes de integração com Postgres/LocalStack real (15, em outros
  arquivos do BC) foram skipped nesta execução por ausência de
  `DATABASE_URL`/LocalStack local — não relacionado a T027 (middleware não
  tem dependência de banco nem de fila).

## 12. Parecer final
APROVADO PELO QA
