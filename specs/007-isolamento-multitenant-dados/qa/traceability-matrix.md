# Matriz de rastreabilidade — 007-isolamento-multitenant-dados

Escopo desta entrada: T002, T003 (demais tasks ainda não implementadas).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T002 | `TenantContext` existe no Shared Kernel, carrega `TenantId` | unitário | carrega o TenantId informado | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ |
| T002 | nunca estado global mutável (imutabilidade do objeto) | unitário | é imutável em runtime (congelado) — `Object.freeze` + `readonly` | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ |
| T002 | nunca estado global mutável (sem singleton/módulo compartilhado) | unitário | cada chamada produz uma instância independente | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ (teste adicionado pelo QA) |
| T002 | Shared Kernel restrito, sem lógica de negócio, sem import de framework/ORM/SDK (ADR-004) | inspeção estática | único import é `TenantId` (sibling no shared-kernel); sem código de módulo com estado | `src/shared-kernel/tenant/tenant-context.ts` (revisão manual + grep) | PASS | verificado nesta validação |

Observação: a garantia "request-scoped" completa (uma instância por requisição) depende do `TenantContextMiddleware` (T005, ainda não implementado) — fora do escopo desta task. O que é verificável em T002 e foi verificado: o tipo em si não guarda estado em módulo/singleton, o que é pré-condição necessária para T005 cumprir o requisito.

## T003 — lint rule/checklist de exceção de import cross-BC (ADR-004)

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T003 | `npx eslint .` no repo atual passa limpo (nenhuma violação pré-existente) | estático/lint | executar `npx eslint .` na raiz do repo | eslint.config.mjs + eslint-rules/no-cross-bounded-context-import.mjs | PASS | saída vazia, exit 0 (verificado nesta validação) |
| T003 | import relativo cross-BC entre BCs irmãos é detectado como erro pela regra `nexo-boundaries/no-cross-bounded-context-import` | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `../../extracao/domain/extracao-orcamento.aggregate` via `import` estático | fixture QA descartável (`__qa_tmp_cross_bc_relative.ts`, removida após verificação) | PASS | 1 erro reportado com `messageId: crossBcImport` |
| T003 | import same-BC passa limpo | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `./orcamento.aggregate` (mesmo BC) | fixture QA descartável (`__qa_tmp_same_bc.ts`, removida após verificação) | PASS | nenhum erro reportado |
| T003 | import de `src/shared-kernel/tenant/` passa limpo (exceção ADR-004) | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `../../../shared-kernel/tenant/tenant-id.vo` | fixture QA descartável (`__qa_tmp_shared_kernel.ts`, removida após verificação) | PASS | nenhum erro reportado |
| T003 (adversarial adicional) | `export ... from` cross-BC também é bloqueado | adversarial/lint | fixture com `export { ExtracaoOrcamento } from '../../extracao/domain/extracao-orcamento.aggregate'` | fixture QA descartável (`__qa_tmp_cross_bc_export_from.ts`, removida após verificação) | PASS | 1 erro reportado |
| T003 (adversarial adicional) | `require()` cross-BC também é bloqueado | adversarial/lint | fixture com `require('../../extracao/domain/extracao-orcamento.aggregate')` | fixture QA descartável (`__qa_tmp_cross_bc_require.ts`, removida após verificação) | PASS | 1 erro reportado (mais 1 erro pré-existente `@typescript-eslint/no-require-imports`, não relacionado à regra sob teste) |
| T003 (adversarial adicional) | `import()` dinâmico cross-BC também é bloqueado | adversarial/lint | fixture com `import('../../extracao/domain/extracao-orcamento.aggregate')` dentro de função async | fixture QA descartável (`__qa_tmp_cross_bc_dynamic_import.ts`, removida após verificação) | PASS | 1 erro reportado |
| T003 | checklist de PR documenta a exceção e referencia o comando/regra correta | inspeção estática | revisão manual de `.github/pull_request_template.md` | `.github/pull_request_template.md` | PASS | nome da regra e caminho do arquivo confirmados batendo com `eslint.config.mjs` |

Observação: fixtures adversariais foram criadas, executadas isoladamente com `npx eslint <arquivo>` e removidas ao final da validação — nenhuma permanece no repositório (`git status` limpo após a checagem). Nenhum código de produção foi alterado nesta validação.

## T004 — runbook Cognito custom attribute `custom:tenant_id`

| Task | Critério de aceite | Nível | Cenário | Arquivo | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T004 | Comando `add-custom-attributes` sintaticamente correto (shorthand AWS CLI, `Name` sem prefixo `custom:`) | inspeção estática/técnica | comparação com sintaxe documentada da AWS CLI para `SchemaAttributeType` | `infra/cognito-custom-attribute-tenant-id.md` | PASS | revisão manual nesta validação |
| T004 | `Mutable=false` satisfaz "imutável pós-onboarding" | inspeção estática | leitura do parâmetro no comando e da justificativa no runbook | idem | PASS | idem |
| T004 | Passo de idempotência (`describe-user-pool` antes de `add-custom-attributes`) presente e com query correta (`SchemaAttributes[?Name=='custom:tenant_id']`, com prefixo `custom:` — coerente, pois o schema já retorna o atributo prefixado) | inspeção estática | leitura do "Passo 0" | idem | PASS | idem |
| T004 | IAM policy = exatamente as ações usadas no runbook (`AddCustomAttributes`, `DescribeUserPool`), sem ação além dessas, restrita ao ARN do pool | inspeção estática | comparação ação-a-ação entre comandos do runbook e `Action` da policy | idem | PASS | idem — nenhuma ação sobrando nem faltando |
| T004 | `tasks.md` e o runbook não afirmam execução real ocorrida | inspeção estática | leitura da seção "Status" do runbook e da linha T004 em `tasks.md` | `infra/cognito-custom-attribute-tenant-id.md`, `tasks.md` | PASS | ambos hedgeiam explicitamente ("não foi feita por este agente"), rastreiam gap na issue #469 |
| T004 | Rastreabilidade do gap de execução para quem pegar T005 | inspeção estática | verificação da issue #469 (estado, corpo, pré-requisito de T005 declarado) | issue #469 (GitHub) | PASS | issue OPEN, label `spec-007`, corpo declara explicitamente "Pré-requisito para T005 ... funcionar em produção" |

Observação: T004 não produz código de produção nem teste automatizado — entregável é documentação operacional (runbook). Cobertura de código não se aplica; verificação foi por inspeção técnica do comando/policy contra a sintaxe e semântica reais da API Cognito, e por confirmação de rastreabilidade (issue #469) do gap de execução real.

## T005 — `TenantContextMiddleware` (plugin Fastify)

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T005 | Sem header `Authorization` -> 401 Problem Details | integração (Fastify inject) | requisição sem header | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | Token JWT inválido/expirado -> 401 | integração | `verify()` rejeita | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | Claim `custom:tenant_id` ausente no payload -> 401 | integração | `verify()` resolve sem a claim | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | Claim presente mas não é UUID v7 válido -> 401 | integração | `verify()` resolve com claim `'nao-e-uuid'` | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | Claim válida -> 200 e `request.tenantContext` populado com o `TenantId` correto | integração | `verify()` resolve com UUID v7 válido | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | `tenantId` forjado em query string é ignorado — só a claim do JWT é usada | adversarial/integração | `?tenantId=<outro-uuid>` com claim válida diferente | tests/interface/shared/tenant-context.middleware.test.ts | PASS | allure-results/ |
| T005 | Helper `extrairBearerToken`/`criarVerificadorJwtCognito` (ADR-007) — comportamento isolado do parsing/config | unitário | prefixo Bearer presente/ausente; config do verifier; delegação de `verify()` | tests/interface/shared/cognito-jwt-verifier.test.ts | PASS | allure-results/ |
| T005 | Refactor do helper compartilhado não quebrou `auth-cognito.middleware.ts` (spec 001, já em uso) | regressão/integração | 5 cenários pré-existentes (sem header; sem prefixo Bearer; token inválido; token válido; config) | tests/bounded-contexts/ingestao-identificacao/interface/http/auth-cognito.middleware.test.ts | PASS | allure-results/ |

Observação (NIT do backend-reviewer, não bloqueante): `tenant-context.middleware.test.ts` não tem cenário próprio de header `Authorization` sem prefixo `Bearer` (ex. `Basic xyz`, ou `Bearer` sem espaço). Risco avaliado como baixo e aceito sem exigir novo teste nesta validação — o parsing é feito pelo mesmo `extrairBearerToken` (ADR-007), já coberto (a) no nível unitário isolado (`cognito-jwt-verifier.test.ts`, caso "retorna undefined sem o prefixo Bearer") e (b) no nível de integração no middleware irmão que consome o mesmo helper (`auth-cognito.middleware.test.ts`, caso "401 Problem Details com Authorization sem prefixo Bearer"), com o mesmo código-caminho (`if (!token)` idêntico em ambos os middlewares). Não há branch de código exclusivo de `tenant-context.middleware.ts` para esse caso que ficasse sem cobertura. Registrado como risco residual aceito, não como lacuna do gate.

Cobertura (`npx vitest run tests/interface/shared tests/bounded-contexts/ingestao-identificacao/interface/http --coverage`, escopo restrito aos arquivos tocados por T005): `src/interface/shared/tenant-context.middleware.ts`, `src/interface/shared/cognito-jwt-verifier.ts` e `src/bounded-contexts/ingestao-identificacao/interface/http/auth-cognito.middleware.ts` — 97,56% statements, 100% branches, 100% functions, 97,56% lines. Única linha não coberta é `title: z.string()` dentro da definição de `problemDetailsSchema` (`src/interface/shared/problem-details.schema.ts`) — o esquema Zod é construído no import do módulo mas nenhum teste chama `.parse()`/`.safeParse()` sobre ele (os testes montam o objeto `ProblemDetails` manualmente); os middlewares hoje só usam o tipo inferido, não a validação em runtime. Sem risco funcional para T005 (o schema é contrato de tipo consumido por `type ProblemDetails`, não por validação ativa nesta task) — registrado como observação, não como defeito.
