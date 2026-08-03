# Traceability Matrix — Phase 1 (Setup)

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T001 | Pastas `src/platform/conformidade/{domain,application,infrastructure,interface}` e `src/platform/shared-value-objects/domain/` conforme `plan.md` (Project Structure) | Diff estrutural manual vs. `plan.md` linhas 178-195 | PASS | `find src/platform -type f`; ver `test-execution-report.md` |
| T002 | Schema Drizzle inicial com as 5 tabelas (`solicitacoes_esquecimento`, `confirmacoes_anonimizacao`, `politicas_retencao`, `trilha_auditoria_acesso`, `contextos_com_dado_pessoal`), atributos conforme `plan.md` (Domain/Infrastructure) | Leitura de `platform.schema.ts` linha a linha vs. `plan.md` linhas 96, 139-140 (Domain/Infrastructure); `pnpm db:generate` sem erro | PASS | `src/platform/conformidade/infrastructure/persistence/schema/platform.schema.ts`; `drizzle/0000_platform_conformidade_baseline.sql`, `drizzle/0001_platform_conformidade_indices.sql` |
| T002 (nit corrigido) | Índices em `orcamento_id`/`solicitacao_id` (apontado pelo backend-reviewer) | Leitura do schema: `confirmacoes_anonimizacao_solicitacao_id_idx`, `trilha_auditoria_acesso_orcamento_id_idx` presentes | PASS | mesmo arquivo, linhas 40, 61 |
| T003 | `tsc --strict`/ESLint cobrem `src/platform/**` sem config nova | `pnpm typecheck`; `pnpm exec eslint src/platform` | PASS | `test-execution-report.md` |
| — (regressão) | Suíte existente do repositório não quebra com a inclusão do schema `platform` | `pnpm test` no baseline (`cb343f5`) e no HEAD do PR (`64ef79c`) | PASS (mesmo resultado nos dois pontos — falha preexistente de infraestrutura de testes, não regressão) | `test-execution-report.md` |

Nenhum RF/RN/RNF funcional de `spec.md` é aplicável nesta fase — Phase 1 é
scaffolding sem lógica de negócio. Rastreabilidade funcional (US1-US4) só
passa a existir a partir da Phase 2/3.

## T005 — VO `PoliticaRetencao`

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T005 | VO `PoliticaRetencao` (`categoria`, `prazoEmDias` positivo, `baseLegal`, `atualizadaEm`) com teste unit cobrindo rejeição de `prazoEmDias <= 0` (#306) | Leitura de `politica-retencao.vo.ts` vs. shape exigido; `npx vitest run tests/platform/shared-value-objects/politica-retencao.vo.test.ts` | PASS | `src/platform/shared-value-objects/domain/politica-retencao.vo.ts`; `tests/platform/shared-value-objects/politica-retencao.vo.test.ts` (9 testes); `test-execution-report.md` |
| T005 (ampliado) | `prazoEmDias` não inteiro, `baseLegal` vazia/whitespace, `atualizadaEm` inválida também rejeitados, cada um com erro de domínio próprio (`PrazoEmDiasInvalidoError`, `BaseLegalInvalidaError`, `AtualizadaEmInvalidaError`, todos `ErroDominio`) | Leitura do VO + execução dos 9 casos (`it.each` para múltiplos valores inválidos) | PASS | idem |
| — (regressão) | Suíte do repositório não quebra com a inclusão do VO | `npx vitest run --reporter=default` completo (HEAD `4db548f`) | PASS (7 arquivos falhando por dependência ausente pré-existente — `@aws-sdk/client-eventbridge`, `pino`, `@opentelemetry/instrumentation-aws-lambda` — fora de escopo deste diff) | `test-execution-report.md` |

## T006 — VO `DadoAnonimizado`

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T006 | VO `DadoAnonimizado` (`campoOriginal`, `metodo: MASCARAMENTO\|REMOCAO`, `aplicadoEm`, `solicitacaoId`, sem construtor que aceite valor original de volta) com teste unit garantindo que a API não expõe getter de valor original (#307) | Leitura de `dado-anonimizado.vo.ts` vs. shape exigido em `plan.md` L107/L158; `npx vitest run tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts` | PASS | `src/platform/shared-value-objects/domain/dado-anonimizado.vo.ts`; `tests/platform/shared-value-objects/dado-anonimizado.vo.test.ts` (10 testes); `test-execution-report.md` |
| T006 (irreversibilidade) | VO deliberadamente sem construtor/getter que devolva o dado original — impede reconstrução acidental do dado pessoal (`plan.md` L158) | Teste explícito checando `Object.keys(dado)` + `(dado as any).valorOriginal === undefined`; leitura de código confirmando `private constructor` sem método de reconstrução | PASS | idem |
| — (regressão) | Suíte do repositório não quebra com a inclusão do VO | `npx vitest run --reporter=default` completo (HEAD `dcb1190`) | PASS (7 arquivos falhando por dependência ausente pré-existente — mesmos módulos de T005 — confirmado fora do diff via `git show --stat dcb1190`) | `test-execution-report.md` |

## T007 — VO `ReferenciaTitular`

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T007 | VO `ReferenciaTitular` em `src/platform/conformidade/domain/value-objects/referencia-titular.vo.ts` — identifica titular de dado pessoal de forma estável entre BCs sem expor modelagem interna (#308, `plan.md` L106) | Leitura de `referencia-titular.vo.ts` vs. `plan.md` L106; `npx vitest run tests/platform/conformidade/referencia-titular.vo.test.ts` | PASS | `src/platform/conformidade/domain/value-objects/referencia-titular.vo.ts`; `tests/platform/conformidade/referencia-titular.vo.test.ts` (7 testes); `test-execution-report.md` |
| T007 (opacidade) | VO não interpreta formato do valor (aceita e-mail, CNPJ+contato ou qualquer texto), apenas normaliza para correlação estável | Leitura de código: `de(valor)` não valida formato, apenas normaliza case/trim; `equals`/`toString` operam sobre o valor normalizado | PASS | idem |
| T007 (normalização) | Mesma referência lógica com capitalização/espaços diferentes produz o mesmo VO | Teste `normaliza para minúsculas e remove espaços nas bordas`; teste `equals compara pelo valor normalizado` | PASS | idem |
| T007 (validação) | Rejeita valor vazio/whitespace-only e acima de 320 caracteres, aceita exatamente 320 | `it.each` para vazio/espaços; teste de 321 chars rejeitado; teste de 320 chars aceito | PASS | idem |
| — (erro de domínio local) | Novo `ErroDominio` base do módulo `conformidade/domain` (não existia antes de T007) segue mesmo padrão dos demais módulos (`shared-value-objects`, `ingestao-identificacao`, `extracao`, `validacao`) — cada domínio declara localmente, sem import cross-BC (ADR-004) | `diff` entre `conformidade/domain/errors/erro-dominio.ts` e `shared-value-objects/domain/errors/erro-dominio.ts` — mesmo shape, apenas docstring distinta | PASS | `src/platform/conformidade/domain/errors/erro-dominio.ts` |
| — (regressão) | Suíte do repositório não quebra com a inclusão do VO | `npx vitest run --reporter=default` completo (HEAD `47c19bc`) | PASS (7 arquivos falhando por dependência ausente pré-existente — mesmos módulos de T005/T006, confirmado não relacionado ao diff) | `test-execution-report.md` |

## T009 — `EventPublisher`/`EventBridgePublisher` do componente Conformidade

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T009 | Mesma interface `EventPublisher` da convenção de 001 (`publicar(evento): Promise<void>`) | Diff de shape entre `platform/conformidade/domain/gateways/event-publisher.ts` e `bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.ts` — assinatura idêntica | PASS | `src/platform/conformidade/domain/gateways/event-publisher.ts` |
| T009 | Publica no mesmo bus `nexo-dominio-bus` | Teste 1 (`publica no bus informado...`) assert `entrada.EventBusName === 'nexo-dominio-bus'`; `eventBusName` injetado via construtor, mesma convenção de 001/002 (nunca hardcoded) | PASS | `tests/platform/conformidade/infrastructure/eventbridge.publisher.test.ts` |
| T009 | `source` fixo `nexo.conformidade` | Teste 1 assert `entrada.Source === 'nexo.conformidade'`; leitura de código confirma constante `SOURCE` não configurável externamente | PASS | idem |
| T009 | `detail-type` = nome do evento | Teste 1 assert `entrada.DetailType === 'SolicitacaoEsquecimentoRegistrada'` | PASS | idem |
| T009 | Sem mecanismo de publicação alternativo | Leitura de código: único método público `publicar`, único caminho de saída (`PutEventsCommand`) | PASS | `src/platform/conformidade/infrastructure/eventbridge.publisher.ts` |
| T009 | Sem SDK AWS vazando para Domain | `domain/gateways/event-publisher.ts` não importa `@aws-sdk/*`; import do SDK confinado a `infrastructure/eventbridge.publisher.ts` | PASS | ambos arquivos |
| T009 | Erro descritivo quando `FailedEntryCount > 0` | Teste 2 (`ErrorMessage` presente) e Teste 3 (fallback "motivo desconhecido" quando ausente) | PASS | idem |
| T009 (nota de convenção) | Task pede "reaproveitar (import, não reimplementar)" o padrão de 001 | Leitura de código: `platform/conformidade` declara sua própria interface+classe locais (não importa de `bounded-contexts/ingestao-identificacao` nem de `extracao`) — mesmo padrão que 002/`extracao` já usa em relação a 001 (cada BC com cópia local, nunca import cross-contexto), reafirmado por ADR-004 desta spec ("a convenção de 001, item 5, proíbe código compartilhado por import direto entre contextos"). Shape idêntico ao de 001/002, `source` e mensagem de erro contextualizados — divergência entre a redação literal da task ("import") e a convenção real do repositório (cópia local por isolamento de contexto), não um defeito de implementação | OBSERVAÇÃO — ver `qa-final-report.md`, seção Riscos residuais | `plan.md` L190 ("reaproveita implementação de 001") vs. L135 ("mesma interface... nenhum caso de uso novo introduz mecanismo de publicação alternativo") vs. ADR-004 |
| — (regressão) | Suíte completa do repositório não quebra com a inclusão do publisher | `pnpm vitest run --reporter=default` completo (HEAD `37ada19`) | PASS — 60 arquivos passaram, 6 skipped (pré-existentes, sem infraestrutura de banco/rede local), 0 falhas | ver `test-execution-report.md`, seção T009 |

## T011 — Teste de infraestrutura: SCP bloqueia segregação de ambientes

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T011 | Script executável (permissão do arquivo) | `git ls-files -s infra/scripts/verificar-scp-segregacao-ambientes.sh` | PASS — modo `100755` | `infra/scripts/verificar-scp-segregacao-ambientes.sh` |
| T011 | Guarda contra rodar na conta de produção antes de qualquer chamada destrutiva | Leitura de código (linhas 49-56, antes de `aws rds`/`aws s3api` que só aparecem a partir da linha 109); mock isolado com `CURRENT_ACCOUNT_ID == AWS_PROD_ACCOUNT_ID` | PASS — aborta com `exit 1` antes de qualquer ação | script, seção guarda de conta |
| T011 | `assert_bloqueado`: sucesso inesperado da ação bloqueada é tratado como CRÍTICO e dispara limpeza best-effort | Mock isolado: função extraída via `awk`, comando fake retornando exit 0 | PASS — `CRÍTICO`, `RESULTADO=1`, comando de limpeza efetivamente invocado | mock QA (scratchpad, não versionado) |
| T011 | `assert_bloqueado`: explicit deny de SCP é tratado como OK | Mock isolado: comando fake com mensagem real de erro AWS contendo a frase de SCP | PASS — `OK`, `RESULTADO=0` | idem |
| T011 | `assert_bloqueado`: outro erro (não SCP) não é confundido com bloqueio por SCP | Mock isolado: comando fake com `ValidationException` sem a frase de SCP | PASS — `FALHA`, `RESULTADO=1` | idem |
| T011 (nit corrigido) | Regex de explicit-deny restrita a SCP, não genérica para AccessDenied/outra política IAM | Regex real (`SCP_DENY_REGEX`) extraída do script via `grep` e usada no mock — não casa com `ValidationException` do caso "outro erro" | PASS | script, variável `SCP_DENY_REGEX` |
| T011 (nit corrigido) | Sufixo de nome de recurso com nanossegundos evita colisão | Leitura de código (`date +%s%N`) | PASS | script, variável `SUFIXO` |
| T011 | Workflow YAML sintaticamente válido | `npx --yes js-yaml .github/workflows/verificar-scp-segregacao-ambientes.yml` | PASS — parse sem erro | `.github/workflows/verificar-scp-segregacao-ambientes.yml` |
| T011 | Workflow dispara apenas via `workflow_dispatch` (nunca push/pull_request) | Inspeção programática da chave `on` do YAML parseado | PASS — `on` contém exclusivamente `workflow_dispatch` | idem |
| T011 | README documenta pré-requisitos (T013/T014/T015) e uso (variáveis, comando, saída esperada) | Leitura comparada ao script e ao workflow | PASS — consistente entre os 3 arquivos | `infra/scripts/README.md` |
| — (limitação de ambiente) | Execução real do script contra AWS dev/hml/prod | Não executável neste ambiente — sem credenciais AWS reais nem contas dev/hml/prod provisionadas (T013/T014/T015 pendentes) | NÃO EXECUTADO — limitação de ambiente, não defeito | ver `qa-final-report.md`, seção "Limitações do ambiente" |

## T012 — Teste de contrato: `sts:AssumeRole` restrito por conta (PR #512)

| Task | Critério de aceite | Verificação | Resultado | Evidência |
|---|---|---|---|---|
| T012 | Script executável (permissão do arquivo) | `git ls-tree -l pr-512 infra/scripts/verificar-contrato-assume-role-por-conta.sh` | PASS — modo `100755` (achado do backend-reviewer, revisão 1, corrigido) | `infra/scripts/verificar-contrato-assume-role-por-conta.sh` |
| T012 | Guarda contra rodar na conta de produção antes de qualquer `sts:assume-role` | Leitura de código (guarda antes do loop de `assert_assume_role_bloqueado`); execução fim a fim com `aws` fake e `AWS_PROD_ACCOUNT_ID` == conta corrente | PASS — aborta com `exit 1` antes de qualquer AssumeRole | script, seção guarda de conta; `test-execution-report.md` |
| T012 | `assert_assume_role_bloqueado`: AssumeRole cross-conta com sucesso é CRÍTICO e a saída (`Credentials`) é redigida antes do log | Mock isolado: função extraída via `awk`, comando fake retornando exit 0 com `Credentials` fake | PASS — `CRÍTICO`, `RESULTADO=1`, saída filtrada para `{}` via `jq del(.Credentials)` — nenhum `AccessKeyId`/`SecretAccessKey`/`SessionToken` no log | mock QA (scratchpad, não versionado); `test-execution-report.md` |
| T012 | `assert_assume_role_bloqueado`: `AccessDenied` é tratado como OK | Mock isolado: comando fake com mensagem real `AccessDenied` | PASS — `OK`, `RESULTADO=0` | idem |
| T012 | `assert_assume_role_bloqueado`: outro erro (não `AccessDenied`) não é confundido com bloqueio esperado | Mock isolado: comando fake com `ValidationException` sem `AccessDenied` | PASS — `FALHA`, `RESULTADO=1` | idem |
| T012 (nit corrigido) | Falha explícita se `OUTRAS_DEPLOY_ROLE_ARNS` não resultar em nenhuma role testada (evita falso positivo silencioso) | Execução fim a fim com `OUTRAS_DEPLOY_ROLE_ARNS` só-espaços (zero palavras após word-splitting) | PASS — `FALHA: ... nenhuma verificação foi executada`, exit 1 | `test-execution-report.md` |
| T012 | Fluxo feliz: 2 roles de outros ambientes, ambas bloqueadas por `AccessDenied` | Execução fim a fim do script completo com `aws` fake determinístico | PASS — `OK` para as 2 roles, `RESULTADO: ... restrição por conta confirmada`, exit 0 | `test-execution-report.md` |
| T012 | Workflow YAML sintaticamente válido | `npx --yes js-yaml .github/workflows/verificar-contrato-assume-role-por-conta.yml` | PASS — parse sem erro | `.github/workflows/verificar-contrato-assume-role-por-conta.yml` |
| T012 | Workflow dispara apenas via `workflow_dispatch` (nunca push/pull_request) | Inspeção do JSON parseado, chave `on` | PASS — `on` contém exclusivamente `workflow_dispatch` | idem |
| T012 | README documenta pré-requisitos (T013/T015) e uso (variáveis, comando, saída esperada) | Leitura comparada ao script e ao workflow | PASS — consistente entre os 3 arquivos, mesmo padrão de T011 | `infra/scripts/README.md` |
| — (limitação de ambiente) | Execução real do script contra AWS dev/hml/prod | Não executável neste ambiente — sem credenciais AWS reais nem contas dev/hml/prod provisionadas (T013/T015 pendentes) | NÃO EXECUTADO — limitação de ambiente, não defeito | ver `qa-final-report.md`, seção "Limitações do ambiente" |
