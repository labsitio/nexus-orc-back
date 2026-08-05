# Matriz de Rastreabilidade — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados
Branch: `feat/656-isolamento-estrutural-002-003-005`
Commit testado: `9a14721` (submetido) → `3049998` (após correção de gap de teste pelo QA)

| # | Critério de aceite (issue #656) | Evidência / comando | Resultado |
|---|---|---|---|
| 1 | RLS habilitada e forçada (`ENABLE`/`FORCE ROW LEVEL SECURITY`) + policy `tenant_isolation` nas 3 tabelas e _historico | `psql -c "select policyname from pg_policies where tablename='extracoes_orcamento'"` etc. (manual) confirmou; `npx drizzle-kit migrate` aplicou `drizzle/0020_t656_isolamento_estrutural_002_003_005.sql` sem erro; **gap fechado pelo QA**: schema.test.ts dos 3 BCs não tinha assert de catálogo `pg_class.relrowsecurity/relforcerowsecurity` + `pg_policies` (só existia em 001/004) — adicionado, `npx vitest run` nos 3 arquivos → 27/27 passando | PASSA |
| 2 | `tenant_id` NOT NULL nas 3 tabelas e históricos | `select is_nullable from information_schema.columns where column_name='tenant_id'` (psql) → `NO` nas 6 tabelas; teste automatizado já existente em extracao/validacao, **adicionado pelo QA** em `decisao-workflow.schema.test.ts` (faltava) | PASSA |
| 3 | Os 3 repositórios Drizzle estendem `DrizzleTenantScopedRepositoryBase`; nenhuma query sem escopo de tenant | `grep -n "extends DrizzleTenantScopedRepositoryBase" src/bounded-contexts/{extracao,validacao,orquestracao}/infrastructure/persistence/drizzle-*.repository.ts` → 3 hits; leitura completa dos 3 arquivos — todo acesso via `this.transacaoTenantScoped`, nenhum `this.db.transaction` direto | PASSA |
| 4 | Os 4 controllers HTTP extraem `TenantContext` e rejeitam cross-tenant (404, nunca 403) | Leitura de `extracao/interface/http/{status,revisao-humana}.controller.ts` e `validacao/interface/http/{status,decisao-humana}.controller.ts` — todos: 401 se `request.tenantContext` ausente, 404 (nunca 403) em `TenantDivergenciaError`/não encontrado | PASSA |
| 5 | Teste de isolamento cross-tenant por BC (extração/validação via HTTP; orquestração via repositório/RLS) | `npx vitest run tests/bounded-contexts/extracao/contract/tenant-isolation.test.ts tests/bounded-contexts/validacao/contract/tenant-isolation.test.ts` → 8/8 passando (404 cross-tenant, 200 mesmo tenant, 401 sem contexto); orquestração coberta por `tests/security/isolamento-multitenant/repositorio-tenant-scoped-adversarial.test.ts` (mecanismo genérico `DrizzleTenantScopedRepositoryBase`, mesma classe base usada por `DrizzleDecisaoWorkflowRepository`) + RLS de catálogo (critério 1) | PASSA |
| 6 | `tenantId` obrigatório nos 3 agregados; `tsc --noEmit` limpo, sem `any`/`as` de conveniência/`@ts-ignore` | `grep -n "tenantId" .../extracao-orcamento.aggregate.ts .../orcamento-validacao.aggregate.ts .../decisao-workflow.aggregate.ts` — tipo `TenantId` não opcional nos 3; `npx tsc --noEmit` → 0 erros; `npx eslint .` → 0 erros/avisos; grep manual por `as any`/`@ts-ignore` nos arquivos alterados de produção → nenhum hit de conveniência | PASSA |
| 7 | Suíte completa verde | `npx vitest run` (Postgres local 5433, migração 0020 aplicada) → **178/178 arquivos, 1073/1073 testes passando**, 0 fail, 0 skip inesperado | PASSA |
| 8 | Nota de amendment ADR-008 em `plan.md` e T047 em `tasks.md` | `plan.md` linha 333 — bloco "Amendment 2026-08-05 (issue #656 — isolamento estrutural de 002/003/005)"; `tasks.md` linha 153 — T047 marcada `[x]` com resumo de entrega | PASSA |

## Achado do QA (gap de teste fechado, não é defeito de produção)

`schema.test.ts` de `extracao`/`validacao`/`orquestracao` só validava
`tenant_id NOT NULL` — nenhuma asserção de catálogo Postgres
(`pg_class.relrowsecurity`/`relforcerowsecurity`, `pg_policies`) provando RLS
habilitada/forçada/policy presente, diferente do padrão já usado por
`orcamento.schema.test.ts` (001) e `indice-orcamento-completo.schema.test.ts`
(004). RLS em si estava corretamente aplicada pela migração 0020 (confirmado
manualmente via `psql`) — o gap era puramente de regressão automatizada: se
uma migração futura remover a política por engano, nada acusaria. QA
adicionou 3 `it()` (1 por BC) espelhando o padrão de 001/004, e completou a
asserção de NOT NULL que faltava em `decisao-workflow.schema.test.ts`.
Nenhuma alteração de produção. Commit `3049998`, pushado para
`feat/656-isolamento-estrutural-002-003-005`.
