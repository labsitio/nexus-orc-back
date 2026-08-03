# Test Plan — T007 (RLS Aurora, PR #511)

## Escopo
- Migration `drizzle/0012_rls_orcamentos_tenant_isolation.sql`: coluna `tenant_id`
  (expand/contract), índice btree, RLS + FORCE + política `tenant_isolation`
  em `orcamentos`/`orcamentos_historico`.
- `orcamento.schema.ts`: atributo `tenantId` + índices Drizzle.
- `drizzle-orcamento.repository.ts`: `set_config('app.current_tenant_id', ...)`
  parametrizado no início de toda transação (`salvar`/`buscarPorId`).

## Fora de escopo (tasks futuras, não bloqueiam T007)
- T008 (`DrizzleTenantScopedRepositoryBase`, `tenantId` real do `TenantContext`).
- T009 (checklist de infra: nenhuma role Lambda com `BYPASSRLS`).
- T010 (suíte adversarial completa: query param forjado na Interface, etc. —
  Interface/Application deste BC ainda não propagam tenantId real).
- T014/T016/T018 (propagação do tenantId real via Domain/Application).

## Risco central identificado
A role local de dev/CI usada via `DATABASE_URL` (`nexo`, docker-compose) é
**SUPERUSER com BYPASSRLS=true** (confirmado: `select rolsuper, rolbypassrls
from pg_roles where rolname='nexo'` → `t | t`). Superuser sempre ignora RLS,
mesmo com `FORCE ROW LEVEL SECURITY`. Consequência: o teste de catálogo já
existente (`orcamento.schema.test.ts`, verifica `pg_class.relrowsecurity` /
`relforcerowsecurity` / `pg_policies`) prova que a migration *configurou* RLS,
mas não prova *enforcement* — passaria de forma idêntica mesmo que a política
nunca existisse. Nenhum teste do PR original exercitava a política com uma
conexão real sem `BYPASSRLS`.

## Estratégia adotada
1. Validar estruturalmente a migration contra Postgres real (docker-compose):
   coluna NOT NULL, ausência de DEFAULT residual, índices, RLS habilitada/forçada,
   política presente — via psql direto (`pg_attribute`, `pg_indexes`, `pg_class`,
   `pg_policies`).
2. Sanity-check isolado do padrão expand/contract (tabela-scratch com linha
   pré-existente, mesmas duas sentenças ALTER da migration) — confirma backfill
   sem erro e ausência de DEFAULT residual.
3. Escrever suíte adversarial nova (`tests/security/isolamento-multitenant/
   rls-enforcement.test.ts`) que cria uma role dedicada `NOSUPERUSER NOBYPASSRLS`
   (mesmo perfil exigido pela T009/ADR-003 para a role de Lambda em produção) e
   exercita a política tenant_isolation com conexões reais.
4. Rodar toda a suíte existente (unit + integração) para confirmar ausência de
   regressão funcional no BC Ingestão & Identificação.
5. Typecheck + lint dos arquivos alterados.

## Ambiente
- Postgres real via docker-compose (serviço já ativo neste worktree),
  `DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo`, migrado via
  `pnpm db:migrate`.
- Bug de ambiente pré-existente confirmado independentemente: `allure-vitest@3.10.2`
  não encontra o runner do `vitest@4.1.10` (`Vitest failed to find the runner`),
  reproduzido em teste puro sem dependência de banco (`tests/shared-kernel/tenant/
  tenant-id.vo.test.ts`) e também no arquivo adversarial novo — não é regressão
  desta PR. Contornado localmente com `--reporter=default` (ignora o reporter
  `allure-vitest/reporter` do `vitest.config.ts`) para obter resultado de teste;
  Allure não pôde ser gerado neste ambiente por essa mesma causa.
