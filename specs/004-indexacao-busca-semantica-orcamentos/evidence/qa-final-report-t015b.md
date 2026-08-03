# QA Final Report — T015b (RLS + tenant_id em indices_orcamento)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T015b (ADR-005 retrofit, BLOCKER apontado no PR #176)
- PR: #534 (labsitio/nexus-orc-back), branch feat/004-t015b-rls-indices-orcamento
- Commit HEAD testado: 1639750 (worktree C:\Users\jonas\ai\projects\nexus-orc-back-wt-004-t015b)
- Primeira validação de QA (não é reteste de BUG)

## Resumo executivo
Migração 0016 replica exatamente o padrão aprovado em 0013 (spec 007/T007):
`tenant_id UUID NOT NULL` via expand/contract (DEFAULT provisório removido em
seguida) + `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` em
`busca_indexacao.indices_orcamento` e `indices_orcamento_historico`. Schema
Drizzle e testes correspondentes atualizados. Segunda revisão do
backend-reviewer já é APPROVE, incluindo o teste adversarial que faltava na
primeira rodada. Nenhum defeito de produção encontrado.

## Testes executados
Ambiente: Postgres real via docker-compose (`nexus-orc-back-wt-004-t015b-postgres-1`,
pgvector/pgvector:pg16, porta 5432), já migrado até 0016.

Comando: `DATABASE_URL="postgresql://nexo:nexo@localhost:5432/nexo" pnpm exec vitest run --reporter=default`
(evitado `pnpm test` puro — incompatibilidade ambiental conhecida do allure-vitest).

1. Suíte alvo (isolada):
   - `tests/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento-completo.schema.test.ts` — 9 testes
   - `tests/security/isolamento-multitenant/rls-enforcement-busca-indexacao.test.ts` — 5 testes
   - Resultado: 14/14 passando, nenhum skip (confirmado pela contagem — describe.skipIf só pularia silenciosamente sem DATABASE_URL).

2. Regressão completa: `pnpm exec vitest run --reporter=default` (sem filtro)
   - 128 arquivos de teste, 692 testes — todos passando, 0 falhas, 0 skips.

3. `pnpm exec tsc --noEmit` — sem erros.
4. `pnpm exec eslint src tests drizzle` — sem findings.

## Cobertura dos requisitos (T015b)
- tenant_id NOT NULL em ambas as tabelas: coberto (schema.ts + migração + inserts nos testes passam tenantId obrigatoriamente).
- RLS habilitada (ENABLE + FORCE) e policy tenant_isolation presentes: coberto via checagem de catálogo (pg_class/pg_policies) em indice-orcamento-completo.schema.test.ts.
- Enforcement real cross-tenant (não apenas catálogo): coberto pelo teste adversarial rls-enforcement-busca-indexacao.test.ts, usando role dedicada sem BYPASSRLS — mesmo padrão do teste equivalente da spec 007 (rls-enforcement.test.ts, orcamentos). Cobre:
  - sessão sem set_config falha explicitamente (fail-closed);
  - tenant A não vê linha de tenant B (indices_orcamento);
  - tenant A vê apenas a própria linha, mesma tabela com dado de dois tenants;
  - isolamento também em indices_orcamento_historico (política replicada);
  - FORCE ROW LEVEL SECURITY bloqueia mesmo o dono da tabela sem tenant configurado.
- Migração expand/contract sem quebrar ambiente com linha existente: coberto pelo padrão DEFAULT provisório + DROP DEFAULT, idêntico ao já validado em 0013 (spec 007).
- Regressão de CHECKs/FK/trigger append-only preexistentes (T015): mantidos e passando, adaptados apenas para incluir tenantId nos inserts.

Nenhuma lacuna de requisito identificada para o escopo desta task.

## Bugs encontrados
Nenhum. Nenhum defeito de produção identificado.

## Riscos residuais
- DEFAULT provisório de tenant_id (`00000000-0000-7000-8000-000000000000`) é o
  mesmo placeholder de 0013; T018/T029 (fora do escopo de T015b) são
  responsáveis por propagar o tenantId real via `OrcamentoValidadoEventACL`.
  Já documentado no comentário da migração e nas mensagens de commit — não é
  responsabilidade desta task fechar esse ciclo.
- Suíte de RLS depende de Postgres real (DATABASE_URL); sem ele, os testes são
  pulados silenciosamente. Confirmado neste QA que rodaram de fato (14/14,
  não 0/0).

## Limitações do ambiente
Nenhuma. Ambiente local com Postgres real disponível e migrado até 0016;
execução completa possível sem mocks/fakes para a camada de persistência.

## Parecer final
APROVADO PELO QA
