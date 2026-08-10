# QA Final Report — T048 (issue #690, ADR-010 T6, PR #706)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados
- Branch: `test/007-690-papel-forjado`
- Base: `main`
- Tipo: **primeira validação** (não é reteste)
- Produção: **nenhum arquivo de produção alterado neste PR** — apenas teste
  novo e marcação de task.

## Resumo executivo

PR adiciona `tests/security/verificacao-papel/papel-forjado-http-adversarial.test.ts`,
prova adversarial de que papel forjado em body/header/query não escala
privilégio nas 2 rotas gated por papel (`POST .../workflow/decisao-humana` →
`comprador-responsavel`; `POST`/`GET /v1/configuracoes/faixas-preco-categoria`
→ `compliance-admin`). Único middleware de autenticação usado é o real
(`criarTenantContextMiddleware`), com apenas `aws-jwt-verify` mockado —
restrição da issue #690 respeitada e confirmada por leitura do teste.

QA reproduziu a suíte, confirmou os 9 casos verdes, e adicionalmente
verificou manualmente (mutação temporária, revertida antes deste commit) que
remover `criarExigenciaPapel` do controller de decisão humana faz os 3 casos
`403` correspondentes virarem `200` — o teste falha pelo motivo certo, não é
um teste que sempre passa. Nenhum defeito de produção encontrado.

## Requisitos cobertos

Ver `specs/007-isolamento-multitenant-dados/qa/traceability-matrix-T048.md` —
9 cenários (body/header/query × 2 rotas + contraprovas + GET), todos PASSA.

## Suítes executadas e comandos

```
npx vitest run tests/security/verificacao-papel/papel-forjado-http-adversarial.test.ts --reporter=default
npx vitest run tests/security --reporter=default
npx eslint tests/security/verificacao-papel/papel-forjado-http-adversarial.test.ts
npx tsc --noEmit
```

`pnpm test` não foi usado (path do repo local contém espaço — reporter
`allure-vitest` falha com "Vitest failed to find the runner", limitação já
documentada no `CLAUDE.md` do repo; contornado com `--reporter=default`,
`vitest.config.ts` não alterado).

## Quantidade de testes por tipo

Segurança/adversarial: 1 arquivo novo, 9 testes (todos contrato HTTP via
`app.inject`, nenhum unitário/integração de banco necessário — o teste não
depende de Postgres).

## Resultado

- typecheck (`tsc --noEmit`): 0 erros.
- lint (arquivo novo): 0 erros/avisos.
- `tests/security/verificacao-papel/papel-forjado-http-adversarial.test.ts`:
  **9/9 passando**.
- `tests/security` completo: 2 arquivos executados (23 testes, todos verdes),
  4 arquivos pulados por `skipIf(!DATABASE_URL)` — esperado localmente sem
  Postgres, não relacionado a este PR (o teste novo não usa banco).

## Cobertura inicial e final

Não medida via `--coverage` para este PR: mudança é teste-only, sem alteração
de `src/**`, sem efeito no percentual de cobertura de produção. O arquivo já
exercita 100% dos ramos do guard de papel nas 2 rotas (positivo e negativo),
risco relevante é comportamental (segurança), não de linha.

## Allure

Não gerado para esta validação pontual (teste-only, sem impacto de produção,
suíte completa não re-executada). Evidência de execução é o output do
`vitest run` acima, reproduzível por qualquer agente com o comando listado.

## Bugs por severidade e status

Nenhum. Zero BUG aberto.

## Riscos residuais

- Nenhum novo — este PR não toca produção. O guard de papel (`criarExigenciaPapel`,
  `TenantContextMiddleware`) já existia e já estava sob teste; esta PR fecha
  a lacuna adversarial específica (papel forjado em superfícies não
  verificadas: body/header/query) pedida pela issue #690.

## Limitações do ambiente

`pnpm test` quebra localmente (path com espaço) — contornado com
`--reporter=default`, sem alterar config. 19 arquivos com `skipIf(!DATABASE_URL)`
no repo pulam sem Postgres local — não relevante para este PR.

## Parecer final

**APROVADO PELO QA**
