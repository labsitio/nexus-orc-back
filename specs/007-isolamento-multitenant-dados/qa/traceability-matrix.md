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

## T006 — tabela `sftp_tenant_mapping` + resolução de `tenantId` no trigger SFTP

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T006 | Migration cria `sftp_tenant_mapping` com PK composta `(servidor_id, usuario)`, `tenant_id uuid not null` | inspeção estática | leitura de `drizzle/0010_sftp_tenant_mapping.sql` e do schema Drizzle correspondente | `drizzle/0010_sftp_tenant_mapping.sql`, `src/.../schema/sftp-tenant-mapping.schema.ts` | PASS | revisão manual nesta validação — SQL gerado bate com `primaryKey({ columns: [servidorId, usuario] })` |
| T006 | Repositório resolve `tenantId` por `(servidorId, usuario)` | integração (Postgres real) | insere mapeamento, resolve pelo par exato | tests/.../drizzle-sftp-tenant-mapping.repository.test.ts | SKIP (sem `DATABASE_URL` no ambiente desta validação) | `skipIf(!DATABASE_URL)` confirmado — suíte correta para CI, que provisiona Postgres antes de rodar |
| T006 | Retorna `undefined` se não encontrado | integração | par servidor/usuário inexistente | idem | SKIP (idem) | idem |
| T006 | Não confunde usuários diferentes do mesmo servidor | integração | dois usuários no mesmo `servidorId`, mapeamentos distintos, resolve cada um corretamente | idem | SKIP (idem) | idem |
| T006 | Gateway S3 extrai as duas tags corretas (`aws:transfer:server-id`/`aws:transfer:user-name`) e delega ao repositório | unit (S3Client mockado) | `TagSet` com ambas as tags presentes | tests/.../s3-sftp-tenant-resolver.gateway.test.ts | PASS | 3/3 testes verdes; `resolverTenantId` chamado com `('s-123', 'fornecedor-x')` |
| T006 | Gateway retorna `undefined` sem sequer chamar o repositório quando tags ausentes (evita lookup desnecessário) | unit adversarial | `TagSet: []` | idem | PASS | `expect(mapeamento.resolverTenantId).not.toHaveBeenCalled()` — asserção explícita de não-chamada |
| T006 | Gateway retorna `undefined` quando tags presentes mas par não mapeado | unit | repositório mockado retornando `undefined` | idem | PASS | idem |
| T006 | Handler SFTP resolve `tenantId` ANTES de `ReceberOrcamento.executar` | unit | espiona `resolver()` e a ordem de chamadas via handler | tests/.../sftp-upload.handler.test.ts | PASS | 1 novo teste dedicado (T006) — `resolver` chamado com a `referenciaBruta` correta |
| T006 | Mapeamento ausente não lança erro, apenas `console.warn` (log-only) | unit | `resolverTenantFake()` sempre `undefined` | idem | PASS | 1 novo teste — `resolves.toBeUndefined()`, `salvar` ainda chamado 1x |
| T006 | Nenhuma regressão nos 5 cenários pré-existentes do handler (idempotência/redelivery, múltiplos registros, prefixo `sftp-incoming/`, `versionId` ausente, referência do próprio evento) | regressão/unit | suíte completa do handler | idem | PASS | 7/7 testes verdes (5 pré-existentes + 2 novos T006), nenhum teste alterado para acomodar T006 além da assinatura de 2 args |
| T006 | Integração multicanal (4 canais) mantém o mesmo shape de `OrcamentoRecebido` | integração | `PORTAL_WEB`/`API_REST`/`APP_MOBILE`/`SFTP` publicam payload com mesmo shape | tests/.../receber-orcamento-multicanal.integration.test.ts | PASS | 1/1 teste verde — chamada com 2 args (`resolverTenant` fake) sem alterar shape do evento |
| T006 (adversarial adicional, QA) | `npx eslint .` limpo no diff | estático/lint | `npx eslint .` na raiz do repo | — | PASS | saída vazia, exit 0 |
| T006 (adversarial adicional, QA) | `npx tsc --noEmit -p .` sem erro novo introduzido pelo diff (fora do gap conhecido de dependências) | estático/typecheck | `npx tsc --noEmit -p .` filtrado por `sftp\|tenant` | — | PASS (com ressalva de ambiente) | único erro relacionado é `Cannot find module 'aws-lambda'` em `sftp-upload.handler.ts` e no próprio teste — gap de dependência de ambiente já reportado em ciclos anteriores desta spec, não introduzido por T006 (o mesmo módulo já era importado antes deste diff para tipar `S3Event`/`S3Handler`) |

Cobertura (`npx vitest run <suíte T006> --coverage`, escopo restrito aos arquivos tocados por T006): `S3SftpTenantResolverGateway` — 100% statements/functions/lines, 83,33% branches (única branch não coberta: `versionId` opcional do `GetObjectTaggingCommand` — não afeta a lógica de resolução testada, apenas o parâmetro passado ao SDK). `DrizzleSftpTenantMappingRepository` — 0% nesta execução local (suíte de integração pulada por ausência de `DATABASE_URL`; comportamento esperado e correto do `skipIf`, não uma lacuna de teste — a suíte existe e cobre os 3 critérios de aceite do repositório, roda no CI que provisiona Postgres). `sftp-tenant-mapping.schema.ts` — 50% statements/lines (arquivo é puramente declarativo — chamada a `pgTable`/`primaryKey` do Drizzle; a "função" não coberta é o callback do índice de PK, exercitado implicitamente pela migration gerada e pelos testes de integração quando rodam com banco real). `criarHandlerSftpUpload` não apareceu isolado no relatório desta execução por particularidade do glob de `--coverage.include` do provider v8 nesta versão do Vitest — cobertura funcional confirmada pelos 7/7 testes verdes da suíte do handler (comportamento observável, não métrica de linha).

Nenhum defeito de produção encontrado em T006. Nenhum teste foi enfraquecido, ignorado ou teve asserção reduzida nesta validação.

## T014 — `tenantId` opcional + imutabilidade no agregado `Orcamento`

PR #627, branch `feat/277-tenantid-agregado`, commit `3285164` (issue #277).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T014 | `Orcamento` expõe `tenantId` a partir do valor recebido em `Orcamento.receber(...)` | unitário | cria com `tenantId` e lê o getter | tests/bounded-contexts/ingestao-identificacao/domain/orcamento-tenant.test.ts | PASS | vitest run — 909 passed, 1 expected fail |
| T014 | `atualizarTenantId` sempre lança `TenantIdImutavelError`, mesmo padrão de `IndiceOrcamento` (Busca & Indexação) | unitário/adversarial | chama `atualizarTenantId(tenantForjado)` pós-criação | idem | PASS | `toThrow(TenantIdImutavelError)` (classe, não string — nit do backend-reviewer aplicado) |
| T014 | `tenantId` opcional nesta PR (expand/contract, não quebra #279/#280/#281 que ainda constroem `Orcamento` sem tenantId) | inspeção estática | leitura de `OrcamentoProps.tenantId?: TenantId` e comentário de rastreabilidade no código | `src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.ts` (linhas 39-56, 146-153) | PASS | decisão de escopo confirmada com o dev-back-end antes desta validação; não é lacuna |
| T014 | Teste de contrato T011 (cross-tenant 404) passa a exercitar `tenantId` real, mas segue RED por desenho (aguarda T017/T018) | regressão | suíte completa | tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts | PASS (1 `it.fails` esperado, não regrediu) | `2 passed \| 1 expected fail` — o `it.fails` do T011 permanece o único RED da suíte, nenhum novo RED introduzido |
| T014 | Nenhuma regressão no restante do BC Ingestão & Identificação nem no monorepo | regressão | suíte completa | — | PASS | `909 passed \| 1 expected fail \| 99 skipped` (176 arquivos) |
| T014 | `npx tsc --noEmit` sem erro | estático/typecheck | typecheck completo do monorepo | — | PASS | saída vazia, exit 0 |
| T014 | `npx eslint` limpo nos 2 arquivos do diff | estático/lint | lint restrito aos arquivos alterados | `orcamento.aggregate.ts`, `orcamento-tenant.test.ts` | PASS | saída vazia, exit 0 |

Cobertura (`npx vitest run --coverage`, escopo restrito a `orcamento.aggregate.ts`): 91,89% statements/lines, 100% branches, 89,47% functions. As 3 linhas não cobertas (111, 123, 131 — getters `referenciaExterna`/`resultadoAtual`/`historico`) são pré-existentes, não tocadas por este diff, e não relacionadas a `tenantId` (o caminho de `tenantId`/`atualizarTenantId`/`TenantIdImutavelError` está 100% coberto pelo teste promovido). Nenhuma redução de cobertura introduzida.

Nenhum defeito de produção encontrado em T014. A opcionalidade de `tenantId` é decisão de estratégia (expand/contract) documentada no código, na PR e na issue #277 — confirmada com o dev-back-end antes desta validação, não é lacuna a reportar como bug.

## T015 — `tenantId` opcional nos Domain Events de 001 (envelope + 4 eventos)

PR #629, branch `feat/278-tenantid-eventos`, commits `ad6c19c` + `cb99bf9` (issue #278).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T015 | `tenantId?: string` presente no payload serializado dos 4 eventos (`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`, `OrcamentoReclassificadoPorRevisaoHumana`) | unitário/manual (script `tsx`) | instancia `OrcamentoRecebido` com `tenantId` explícito e serializa via `JSON.stringify` | `src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.ts` | PASS | `{"tenantId":"tenant-abc", ..., "schemaVersion":1}` — campo presente quando informado |
| T015 | `schemaVersion` permanece `1` nos 4 eventos e no envelope (`DomainEventEnvelope.schemaVersion: 1`) | estático/inspeção | leitura de `readonly schemaVersion = 1 as const` nos 4 arquivos | os 4 arquivos de evento + `domain-event.ts` | PASS | `grep schemaVersion` confirma `= 1 as const` em todos, sem alteração |
| T015 | Testes existentes que cobrem os 4 eventos continuam passando sem alteração de asserção | regressão | suíte completa + subset dos 4 arquivos de teste citados no handoff | `domain-events.test.ts`, `eventbridge.publisher.test.ts`, `classificar-orcamento.integration.test.ts` | PASS | `16 passed \| 1 expected fail` (subset) |
| T015 | Teste de contrato T011 (cross-tenant 404) segue RED por desenho, não vira verde com esta mudança (aguarda #280/#281) | regressão | suíte completa + execução isolada | `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts` | PASS (1 `it.fails` esperado, não regrediu) | `2 passed \| 1 expected fail` na execução isolada; `909 passed \| 1 expected fail \| 99 skipped` na suíte completa |
| T015 | Nenhuma regressão no restante do BC nem no monorepo | regressão | suíte completa | — | PASS | `909 passed \| 1 expected fail \| 99 skipped` (157 arquivos passaram, 19 skip) — idêntico ao baseline pré-mudança |
| T015 | `npx tsc --noEmit` sem erro nos 5 arquivos do diff | estático/typecheck | typecheck completo do monorepo | — | PASS (erros restantes são pré-existentes em `src/dev/`, módulo `@aws-sdk/client-sqs` ausente, não relacionados a este diff) | saída sem novos erros |
| T015 | `npx eslint` limpo nos 5 arquivos do diff | estático/lint | lint restrito aos arquivos alterados | `domain-event.ts` + os 4 eventos | PASS | saída vazia, exit 0 |

**Achado de atenção (não bloqueante, registrado para rastreabilidade):** o parâmetro
`tenantId?: string` foi inserido na posição do construtor **antes** de `ocorreuEm`
(que tem valor padrão), deslocando a assinatura posicional. Nenhum call site de
produção ou de teste hoje passa `ocorreuEm` explicitamente (todos usam o valor
padrão `new Date()`), então não há quebra observável nesta PR. Risco residual: um
futuro call site que passe `ocorreuEm` explicitamente por posição, sem também passar
`tenantId`, cairia no parâmetro `tenantId` em vez de `ocorreuEm` — mas o TypeScript
acusa erro de tipo nesse caso (`Date` não é atribuível a `string`), então o compilador
protege este cenário específico e a inversão não passaria despercebida em build.
Confirmado por verificação manual (`npx tsc --noEmit`, sem novos erros nos 5 arquivos).
Não é defeito de produção nesta PR; registrado apenas como ponto de atenção para as
PRs de #279/#280/#281, que devem confirmar a ordem de argumentos ao integrar.

Nenhum defeito de produção encontrado em T015. A opcionalidade de `tenantId` e a
manutenção de `schemaVersion: 1` são decisão de estratégia (expand/contract, ADR-008)
documentada no código, em `tasks.md` (T015, T034/#297) e no corpo da PR #629 — não é
lacuna a reportar como bug.

## T040 — `tenantId` opcional nos Domain Events de 002 (envelope + 2 eventos)

PR #630, branch `feat/582-tenantid-eventos-002`, commits `30f31ea` + `7085e35` (issue #582).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T040 | `tenantId?: string` ausente por padrão nos 2 eventos (`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`) | unitário | instancia cada evento sem `tenantId` e verifica `undefined` | `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` | PASS | `evento.tenantId` é `undefined` nos 2 casos |
| T040 | `tenantId?: string` presente e preservado quando informado | unitário | instancia cada evento com `tenantId` explícito e verifica o valor e `schemaVersion` | `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` | PASS | `evento.tenantId` == valor informado; `schemaVersion` continua `1` |
| T040 | `schemaVersion` permanece `1` nos 2 eventos e no envelope | estático/inspeção + unitário | leitura de `readonly schemaVersion = 1 as const` + asserção existente em `domain-events.test.ts` | `domain-event.ts`, `orcamento-extraido.event.ts`, `orcamento-extraido-pendencia-confirmada.event.ts` | PASS | teste existente `schemaVersion 1` continua verde sem alteração de asserção |
| T040 | Nenhum call site de produção afetado (`extrair-dados-orcamento.ts`, `confirmar-revisao-humana-extracao.ts` continuam com 3 args posicionais) | regressão | grep dos 2 únicos call sites + suíte completa | — | PASS | grep confirma 3 args (`orcamentoId`, `itens`, `condicoesComerciais`); suíte completa sem regressão |
| T040 | Teste de contrato T011 (cross-tenant 404, BC 001) segue RED por desenho, não vira verde com esta mudança | regressão | suíte completa | `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts` | PASS (1 `it.fails` esperado, não regrediu) | `909 passed \| 1 expected fail \| 99 skipped` (baseline) → `913 passed \| 1 expected fail \| 99 skipped` (pós 4 testes novos); nenhum "expected to fail but passed" |
| T040 | Nenhuma regressão no restante do BC Extração nem no monorepo | regressão | suíte completa | — | PASS | delta de exatamente +4 testes (os adicionados), 157 arquivos passaram, 19 skip |
| T040 | `npm run typecheck` sem erro | estático/typecheck | typecheck completo do monorepo | — | PASS | saída vazia, exit 0 |
| T040 | `npx eslint` limpo no arquivo de teste alterado | estático/lint | lint restrito ao arquivo alterado | `domain-events.test.ts` | PASS | saída vazia, exit 0 |

Nenhum defeito de produção encontrado em T040. A opcionalidade de `tenantId` e a
manutenção de `schemaVersion: 1` são decisão de estratégia (expand/contract, ADR-008),
mesmo padrão de T014/T015, documentada no código e no corpo da PR #630 — não é
lacuna a reportar como bug.

## T016 — `ReceberOrcamento` exige `tenantId` obrigatório do `TenantContext` (nunca do body)

PR #633 (draft), branch `feat/279-tenantid-receber-orcamento`, commit `f27939d` (issue #279).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T016 | `ReceberOrcamento.executar` exige `tenantId: TenantId` (não mais opcional) e o propaga a `Orcamento.receber(...)` | estático/inspeção + unitário | leitura de `ReceberOrcamentoParams.tenantId: TenantId` (sem `?`) + teste existente que passa `tenantId` e verifica propagação | `receber-orcamento.ts`, `tests/.../application/receber-orcamento.test.ts` | PASS | tipo obrigatório confirmado; suíte verde |
| T016 | `confirmar-upload.controller.ts` lê `tenantId` exclusivamente de `request.tenantContext.tenantId`, nunca do body | contrato/integração (Fastify inject) | requisição com `preHandler` de tenant válido, body sem campo `tenantId` | `tests/.../contract/confirmar-upload.controller.test.ts` | PASS | 200 com `tenantId` do JWT propagado a `ReceberOrcamento` |
| T016 (guardrail de segurança) | Schema Zod de `confirmar-upload` (`confirmarUploadRequestSchema`) não declara campo `tenantId` — `z.object()` sem `.passthrough()` descarta silenciosamente qualquer `tenantId` enviado no body por um cliente malicioso, que nunca chega ao controller nem ao caso de uso | inspeção estática + análise de contrato Zod | leitura de `confirmar-upload.schema.ts` (campos: `canal`, `nomeArquivo`, `referenciaExterna` — sem `tenantId`) e confirmação do modo padrão `strip` do Zod (`z.object()` sem `.passthrough()`/`.strict()` remove chaves desconhecidas do `.data` parseado) | `confirmar-upload.schema.ts` | PASS | campo ausente do schema; `body.data` nunca contém `tenantId` mesmo que o body bruto o inclua — o controller só lê `tenantContext.tenantId` (linha 101), nunca `body.data.tenantId` (nem existiria) |
| T016 | `request.tenantContext` ausente -> 401 Problem Details, `ReceberOrcamento.executar` nunca chamado | contrato/integração (Fastify inject) | POST sem `preHandler` de tenant, body válido | `tests/.../contract/confirmar-upload.controller.test.ts` ("401 Problem Details quando request.tenantContext está ausente") | PASS | `statusCode === 401`, `content-type: application/problem+json` |
| T016 | `sftp-upload.handler.ts` propaga o `tenantId` já resolvido por `SftpTenantResolverGateway` (T006) a `ReceberOrcamento` | unitário | `resolverTenant.resolver()` retorna `TenantId` válido | `tests/.../interface/events/sftp-upload.handler.test.ts` ("resolve tenantId via resolverTenant.resolver...") | PASS | `receberOrcamento.executar` chamado com o `tenantId` resolvido |
| T016 | Mapeamento usuário/servidor ausente (`resolverTenant.resolver()` retorna `undefined`) não lança erro, apenas `console.warn` + pula o registro (`continue`), sem chamar `ReceberOrcamento` | unitário/adversarial | `resolverTenant` mockado retornando `undefined` para 1 registro do lote | `tests/.../interface/events/sftp-upload.handler.test.ts` ("não lança erro quando o mapeamento usuário/servidor está ausente...") | PASS | `receberOrcamento.executar` não chamado para o registro afetado; handler não lança |
| T016 | Lote S3 com múltiplos registros: registro sem mapeamento é pulado, demais registros do mesmo lote continuam sendo processados (não trava o batch inteiro) | regressão/unitário | suíte completa do handler (5 cenários pré-existentes de idempotência/redelivery/múltiplos registros + 2 novos T016) | idem | PASS | nenhuma regressão nos cenários pré-existentes de multi-registro |
| T016 | Nenhum outro caller de produção (`upload-url.controller.ts`, `composition/ingestao-identificacao.ts`) chama `ReceberOrcamento.executar` diretamente — nada além dos 2 sites reais precisou mudar para compilar | inspeção estática | `grep -rn "receberOrcamento.executar\|ReceberOrcamento(" src` (fora de teste) | — | PASS | únicos 2 call sites de `.executar()` são `confirmar-upload.controller.ts` e `sftp-upload.handler.ts`; `composition/ingestao-identificacao.ts` só instancia a classe, não chama `.executar()` |
| T016 | Teste de contrato T011 (cross-tenant 404) segue RED por desenho, não vira verde com esta mudança (aguarda #280/#281 — validação de tenant no repositório/controller de consulta) | regressão | suíte completa + inspeção do arquivo (não tocado neste diff) | `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts` | PASS (1 `it.fails` esperado, não regrediu) | `913 passed \| 1 expected fail \| 99 skipped` (baseline) → `914 passed \| 1 expected fail \| 99 skipped` (pós 1 teste novo, o 401); `git diff HEAD~1 HEAD` confirma o arquivo do `it.fails` intocado |
| T016 | Nenhuma regressão no restante do BC Ingestão & Identificação nem no monorepo | regressão | suíte completa | — | PASS | `914 passed \| 1 expected fail \| 99 skipped` (157 arquivos passaram, 19 skip) |
| T016 | `npx eslint` limpo nos 3 arquivos de produção do diff | estático/lint | lint restrito aos arquivos alterados | `receber-orcamento.ts`, `confirmar-upload.controller.ts`, `sftp-upload.handler.ts` | PASS | saída vazia, exit 0 |
| T016 | `npx tsc --noEmit` sem erro novo introduzido pelo diff | estático/typecheck | typecheck completo do monorepo | — | PASS (erros restantes são pré-existentes em `src/dev/`, módulo `@aws-sdk/client-sqs` ausente e `any` implícito, introduzidos pelo commit `69712ce`, não relacionados a este diff) | nenhum erro em nenhum dos 3 arquivos do diff |

Cobertura (`npx vitest run --coverage`, escopo restrito aos 3 arquivos tocados por T016):
`receber-orcamento.ts` — 100% statements/branches/functions/lines. `sftp-upload.handler.ts`
— 100% statements/branches/functions/lines. `confirmar-upload.controller.ts` — 100%
statements/functions/lines, 90,9% branches (10/11); a única branch não coberta é o
`Array.isArray(valor)` de `idempotencyKeyDoHeader` — já documentada em comentário no
próprio código como defesa sem caminho real de teste via HTTP (Node normaliza headers
repetidos numa string única por RFC 7230; `string[]` só ocorre para `set-cookie`),
pré-existente, não introduzida por este diff.

Nenhum defeito de produção encontrado em T016. O guardrail de segurança (nunca aceitar
`tenantId` do body) está estruturalmente garantido em dois níveis independentes: (1) o
schema Zod de `confirmar-upload` não declara o campo, então mesmo um body malicioso com
`tenantId` é descartado no parse; (2) o controller lê exclusivamente
`request.tenantContext.tenantId`, nunca `body.data`. Nenhum teste automatizado envia
`tenantId` no body para provar o descarte — verificado por inspeção do schema e do
código do controller nesta validação; risco residual baixo (mudar isso exigiria alguém
adicionar `.passthrough()` ao schema E trocar a fonte lida pelo controller, dois erros
independentes simultâneos), mas registrado como lacuna de asserção automatizada abaixo.
