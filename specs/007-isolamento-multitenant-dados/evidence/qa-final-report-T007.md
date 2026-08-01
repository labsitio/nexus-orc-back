# QA Final Report — T007 (RLS Aurora)

## SPEC_ID e versão testada
- SPEC_ID: `007-isolamento-multitenant-dados`
- PR: #511, branch `feat/007-t007-rls-aurora`, commit `fbf380f8b7dfcb73acf08e99d6a3cffde0bbd700`
- Issue: #270. Primeira validação (não é reteste).

## Resumo executivo
T007 introduz `tenant_id` (NOT NULL, expand/contract) + RLS forçada + política
`tenant_isolation` em `orcamentos`/`orcamentos_historico`, e um placeholder
documentado (`TENANT_ID_PROVISORIO`) no repositório até T008/T014/T016/T018
propagarem o tenantId real. Validado independentemente contra Postgres real:
migration estruturalmente correta, RLS **de fato** bloqueia leitura/escrita
cross-tenant (não apenas configurada em catálogo), fail-closed confirmado, e
nenhuma regressão no BC Ingestão & Identificação nem no restante do monorepo.

## Requisitos cobertos
- Migration expand/contract sem quebrar linha pré-existente — coberto (verificação
  manual + sanity-check isolado).
- Coluna NOT NULL + índice em ambas as tabelas — coberto.
- RLS habilitada/forçada + política presente — coberto (teste já existente no PR).
- **RLS efetivamente bloqueia cross-tenant com role sem BYPASSRLS** — coberto por
  suíte adversarial nova, escrita por este QA (ver "Bugs encontrados" — não há bug,
  é lacuna de cobertura preenchida).
- `set_config` parametrizado não quebra o fluxo single-tenant existente — coberto
  pela suíte de integração já existente do repositório.

## Lacunas (não bloqueiam T007)
- T009 (checklist BYPASSRLS em infraestrutura AWS real) — fora do escopo desta PR.
- T010 (suíte adversarial completa via Interface/Application) — Interface/Application
  deste BC ainda não propagam tenantId real; pendente de T014/T016/T018.

## Suítes executadas e comandos
```
export DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo
pnpm db:migrate
pnpm exec vitest run --reporter=default                 # suíte completa
pnpm exec vitest run tests/security/isolamento-multitenant/rls-enforcement.test.ts --reporter=default
pnpm typecheck
pnpm lint
```

## Resultado
- Suíte completa: **116 arquivos / 608 testes — todos passando**, incluindo:
  - `tests/.../schema/orcamento.schema.test.ts`: 7/7 (inclui o teste de RLS via
    catálogo já entregue no PR).
  - `tests/.../drizzle-orcamento.repository.test.ts`: 5/5 (nenhuma regressão de
    `salvar`/`buscarPorId` com `set_config`).
  - `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (novo, escrito
    por este QA): 4/4 — adversarial com role real `NOSUPERUSER NOBYPASSRLS`.
- `pnpm typecheck`: sem erros.
- `pnpm lint`: sem erros.
- Nenhum teste ignorado (skip) fora do guard `describe.skipIf(!DATABASE_URL)`, que
  estava ativo (`DATABASE_URL` setado) em toda a execução.

## Cobertura
Medida via `vitest run --coverage` (v8), escopo `src/**`:
- Statements: 96.27% (1497/1555)
- Branches: 93.49% (675/722)
- Functions: 92.82% (479/516)
- Lines: 96.41% (1481/1536)

`drizzle-orcamento.repository.ts`: 100% statements/functions/lines, 94.44% branches.
Não há baseline formal anterior registrada para T007 especificamente (task adiciona
poucas linhas a um arquivo já coberto); número acima é da suíte completa do
monorepo pós-diff, sem redução de threshold existente.

## Allure
Não gerado neste ambiente. `allure-vitest@3.10.2` é incompatível com o runner
interno de `vitest@4.1.10` (`Vitest failed to find the runner`, ver
`node_modules/.../allure-vitest/src/setup.ts:15`) — reproduzido de forma
independente, inclusive em teste puro sem qualquer relação com T007
(`tests/shared-kernel/tenant/tenant-id.vo.test.ts`). Confirmado como bug de
ambiente pré-existente, não introduzido por este diff. Execução e resultado dos
testes foram obtidos contornando com `--reporter=default` (reporter default do
Vitest, ignorando o reporter `allure-vitest/reporter` configurado em
`vitest.config.ts`). `allure-results/` não foi populado nesta execução —
recomenda-se ao DevOps/Tech Lead atualizar `allure-vitest` para uma versão
compatível com `vitest@4.x` (item de infraestrutura de testes, fora da
autoridade deste QA alterar dependência de produção, mas dentro da autoridade
de ajustar infraestrutura de teste — registrado aqui em vez de silenciosamente
ignorado).

## Achado de risco (não é bug de produção — verificado e mitigado por teste, registrado para visibilidade)
A role local de dev/CI (`nexo`, docker-compose) é **SUPERUSER com BYPASSRLS=true**
(`select rolsuper, rolbypassrls from pg_roles where rolname='nexo'` → `t | t`).
Superusers sempre ignoram RLS, mesmo com `FORCE ROW LEVEL SECURITY`. Isso significa
que **qualquer teste que rode sobre essa conexão passaria de forma idêntica mesmo
que a política `tenant_isolation` nunca tivesse sido criada** — o teste de catálogo
já existente no PR (`relrowsecurity`/`relforcerowsecurity`/`pg_policies`) prova
configuração, não enforcement. Este QA escreveu e executou uma suíte adversarial
dedicada (`tests/security/isolamento-multitenant/rls-enforcement.test.ts`) que cria
uma role `NOSUPERUSER NOBYPASSRLS` (perfil exigido pela T009/ADR-003 para a role
real de Lambda) e confirma enforcement real: bloqueio cross-tenant, fail-closed sem
`set_config`, e FORCE RLS ativo mesmo fora de sessão superuser. **Resultado: RLS
funciona como projetado.** Isso não é um defeito desta PR — é uma lacuna de
verificação que este QA fechou. Fica registrado como recomendação: se o CI usar a
mesma role superuser do docker-compose para outras suítes futuras de RLS
(002–005), o mesmo cuidado (role dedicada sem BYPASSRLS) MUST ser replicado, e a
T009 (checklist de infraestrutura real) continua sendo o item que fecha essa
garantia em produção (Aurora), não em ambiente de teste local.

## Bugs encontrados
Nenhum defeito de produção encontrado. RLS, migration e repositório se comportam
conforme especificado no ADR-003.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos criados/alterados por este QA
- `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (novo)
- `specs/007-isolamento-multitenant-dados/qa/test-plan-T007.md` (novo)
- `specs/007-isolamento-multitenant-dados/qa/traceability-matrix-T007.md` (novo)
- `specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T007.md` (este arquivo)

Nenhum arquivo de produção foi alterado por este QA.

## Riscos residuais
- T009 (checklist BYPASSRLS em infraestrutura real AWS) ainda não confirmado —
  pré-requisito explícito de "pronto" para T018 conforme `tasks.md`. Não bloqueia
  T007 isoladamente (é item de infraestrutura, task separada), mas é dependência
  para o guardrail completo do ADR-003 em produção.
- `allure-vitest` incompatível com `vitest@4.x` neste ambiente — impede geração
  de relatório Allure e reporter nativo até correção de dependência de teste
  (fora do escopo de código de produção).
- Placeholder `TENANT_ID_PROVISORIO` no repositório é comportamento single-tenant
  intencional até T008/T014/T016/T018 — documentado no código, não é lacuna
  desta task.

## Limitações do ambiente
- PR marcado `mergeable: CONFLICTING` no GitHub (não impede validação funcional
  local, mas o dev-back-end/Tech Lead precisa resolver o conflito antes do merge).
- Suíte adversarial nova depende de privilégio para `CREATE ROLE`/`GRANT` no
  Postgres de teste — presente no docker-compose local; confirmar que a mesma
  permissão existe no Postgres do CI antes de considerar este teste executável lá.

## Parecer final
**APROVADO PELO QA**
