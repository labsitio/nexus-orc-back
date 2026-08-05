# QA Final Report — T047 (issue #656, PR #657)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados
- Branch: `feat/656-isolamento-estrutural-002-003-005`
- Commit submetido: `9a14721` | Commit final (após correção de gap de teste
  pelo QA): `3049998`
- Base: `main`
- Tipo: **primeira validação** (não é reteste — nenhum BUG anterior para
  esta issue)

## Resumo executivo

PR fecha a assimetria registrada em ADR-008 (amendment 2026-08-05): 002
(Extração), 003 (Validação) e 005 (Orquestração) passam a ter isolamento
estrutural equivalente a 001/004 — RLS habilitada e forçada + policy
`tenant_isolation` nas 3 tabelas e _historico, `tenant_id NOT NULL`, os 3
repositórios Drizzle estendendo `DrizzleTenantScopedRepositoryBase`, os 4
controllers HTTP extraindo `TenantContext` e rejeitando cross-tenant com 404
(nunca 403), `tenantId` obrigatório nos 3 agregados desde a criação, guardas
de fail-fast `*SemTenantIdError` removidas (estado que cobriam deixou de ser
representável no tipo). Migração 0020 aplicada sem erro (zero linha em
produção/dev, sem backfill necessário).

QA encontrou e fechou, sem tocar produção, um gap de regressão: os
`schema.test.ts` dos 3 BCs só verificavam `tenant_id NOT NULL`, sem provar
RLS habilitada/forçada/policy no catálogo Postgres real — diferente do
padrão já usado por 001/004. Adicionadas 3 asserções de catálogo (1 por BC,
espelhando `orcamento.schema.test.ts`) e completada a asserção de NOT NULL
que faltava em `decisao-workflow.schema.test.ts`. Nenhum defeito de produção
encontrado.

## Requisitos cobertos

Ver `specs/007-isolamento-multitenant-dados/qa/traceability-matrix-T047.md`
— os 8 critérios de aceite da issue #656, um a um, todos **PASSA**.

## Suítes executadas e comandos

```
docker compose ps
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.19.0
npm install
export DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo
npx drizzle-kit migrate
npx tsc --noEmit
npx eslint .
npx vitest run --passWithNoTests
npx vitest run --coverage --passWithNoTests
```

## Quantidade de testes por tipo (aproximado, suíte completa)

Unit (domínio/VOs): maioria dos 178 arquivos. Integração (schema/repositório
Postgres real): ~20 arquivos `*.schema.test.ts`/`drizzle-*.repository.test.ts`.
Contrato/API: ~15 arquivos `*.controller.test.ts`/`tenant-isolation.test.ts`.
Segurança/adversarial: 5 arquivos em `tests/security/isolamento-multitenant/`.

## Resultado

- typecheck (`tsc --noEmit`): 0 erros.
- lint (`eslint .`): 0 erros/avisos.
- Suíte completa sem coverage: **178 arquivos, 1073 testes, 100% passando**,
  0 fail, 0 skip inesperado.
- Suíte completa com `--coverage`: 1 falha isolada e não relacionada
  (`sanitizar-conteudo-documento.test.ts`, assert de timing sensível a
  overhead de instrumentação — arquivo não tocado por esta PR, passa
  isoladamente e sem `--coverage`; classificado como problema de ambiente,
  não de produção). Demais 177/177 arquivos, 1069/1069 testes passando.

## Cobertura inicial e final

| Métrica | Baseline (`9a14721`) | Final (`3049998`) |
|---|---|---|
| Statements | 91.92% | 91.92% |
| Branches | 90.47% | 90.47% |
| Functions | 90.14% | 90.14% |
| Lines | 92.11% | 92.11% |

Sem variação de percentual (os 3 testes do QA exercitam catálogo Postgres via
SQL cru, fora de `src/**` instrumentado). Ganho é de regressão estrutural
(RLS agora tem prova automatizada), não de linha coberta. Ver
`coverage-baseline-T047.md`/`coverage-final-T047.md` para detalhe e lacunas
residuais justificadas (DDL/schema, composição raiz, scripts `dev/`).

## Allure

`allure-results/` gerado localmente (6461 arquivos, 1073 testes) via
`allure-vitest` já configurado em `vitest.config.ts`. Relatório HTML não
gerado — `allure` CLI não é dependência do projeto (limitação já registrada
em validações anteriores desta spec). Ver `allure-report-T047.md`.

## Bugs por severidade e status

Nenhum. Zero BUG aberto para esta issue.

## Riscos residuais

- Zero tenant real em produção e zero Lambda implantada (mesma base de
  decisão do ADR-008) — RLS habilitada preventivamente, sem tráfego real
  ainda para validar em produção.
- Checklist de infraestrutura (role IAM/DB Lambda sem `BYPASSRLS`) é
  responsabilidade de DevOps/Terraform — verificado apenas via role Postgres
  local simulada, não a role real de produção.
- Lacunas de cobertura de linha documentadas em `coverage-final-T047.md`
  (DDL/schema, composição raiz) — baixo risco, padrão já aceito em
  validações anteriores.

## Limitações do ambiente

Node do sistema (16) não suporta o projeto — usado Node 24.19.0 via nvm em
todos os comandos. `.env.example` aponta `DATABASE_URL` para porta 5432; o
Postgres local de dev roda na 5433 — override de `DATABASE_URL` necessário.
Nenhuma linha residual encontrada nas 6 tabelas do escopo antes da migração
— limpeza preventiva mencionada no prompt não foi necessária.

## Parecer final

**APROVADO PELO QA**
