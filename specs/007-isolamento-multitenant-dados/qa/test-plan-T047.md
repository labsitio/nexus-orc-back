# Test Plan — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados

## Escopo

Validar o retrofit de isolamento estrutural (RLS + repositório tenant-scoped
+ `TenantContext` + `tenantId` obrigatório) nos BCs Extração (002), Validação
(003) e Orquestração (005) — issue #656, fechando a assimetria registrada
como resíduo intencional em T046 frente a 001/004 (ADR-008, amendment
2026-08-05).

## Fora de escopo

- BC Acompanhamento/auditoria (não implementado nesta spec ainda).
- Autorização granular intra-tenant (papéis/permissões) — fora de escopo da
  spec 007 inteira, já declarado no `spec.md`.
- Infraestrutura real AWS (IAM role sem `BYPASSRLS`) — verificado apenas via
  simulação de role Postgres local (mesmo padrão já usado por 001/004),
  checklist Terraform/CDK é responsabilidade de DevOps.

## Riscos

- Vazamento cross-tenant estrutural (risco central da spec inteira) —
  mitigado em 4 camadas (Interface/Application/Repository/RLS).
- Regressão silenciosa de RLS (política removida em migração futura sem
  detecção automatizada) — gap identificado e fechado nesta validação (ver
  traceability-matrix-T047.md).
- Divergência de padrão entre os 4 controllers HTTP retrofitados.

## Níveis e tipos de teste

- Unit: agregados (`tenantId` obrigatório/imutável).
- Integração: schema Postgres real (RLS de catálogo, NOT NULL, CHECKs,
  triggers), repositórios Drizzle tenant-scoped.
- Contrato/API: 4 controllers HTTP (401 sem contexto, 404 cross-tenant, 200
  mesmo tenant).
- Segurança/adversarial: `tests/security/isolamento-multitenant/` (role
  Postgres sem `BYPASSRLS`, mecanismo genérico da classe base).

## Ambiente e dependências

Node 24.19.0 (via nvm), Postgres local via `docker compose` (porta 5433 —
divergente do `.env.example`, que aponta 5432; `DATABASE_URL` override
necessário).

## Estratégia de dados

Migração 0020 sem backfill (zero linha em produção/dev nas 3 tabelas,
confirmado antes de aplicar). Testes de integração usam transação
BEGIN/ROLLBACK por teste (schema.test.ts) ou role dedicada
criada/destruída em `beforeAll`/`afterAll` (suítes adversariais).

## Estratégia de mocks/fakes

Testes de contrato HTTP (`tenant-isolation.test.ts`) usam repositório fake
em memória (Map) — validam a camada de Application/Interface (comparação de
`tenantId`), não a RLS em si (RLS é validada separadamente contra Postgres
real nas suítes de schema/segurança).

## Critérios de entrada

PR aberta, branch acessível, migração aplicável sem erro sobre baseline
limpa.

## Critérios de saída

Ver "Fase 5 — Gate" do protocolo de QA: critérios de aceite cobertos e
passando, zero defeito crítico/alto aberto, suítes obrigatórias verdes,
cobertura medida, Allure gerado, matriz atualizada, lacunas documentadas.

## Abordagem Allure

`allure-vitest` já configurado; `allure-results` gerado por execução local.
Ver `allure-report-T047.md`.

## Ordem de execução

migração → typecheck/lint → suíte completa (sem coverage) → suíte completa
(com coverage) → suítes específicas de tenant-isolation/RLS isoladas para
confirmação.

## Limitações

Ambiente de dev Postgres compartilhado — mitigado por confirmar tabelas
vazias antes de aplicar migração 0020 (sem necessidade de limpeza nesta
execução). `allure` CLI não instalado — HTML não gerado, resultados brutos
suficientes.
