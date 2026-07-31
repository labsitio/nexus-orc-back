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
