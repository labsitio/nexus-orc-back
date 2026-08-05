# Test Execution Report — T047 (issue #656, PR #657)

SPEC_ID: 007-isolamento-multitenant-dados
Branch: `feat/656-isolamento-estrutural-002-003-005`
Commit testado: `9a14721` (submetido) → `3049998` (HEAD final, após commit do QA)
Ambiente: Node 24.19.0 (via nvm, `nvm use 24.19.0`), Postgres local
(`docker compose`, porta 5433, `DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo`).
Tabelas das 3 BCs (`extracao.extracoes_orcamento`, `validacao.validacoes_orcamento`,
`orquestracao.decisoes_workflow` e _historico) confirmadas vazias antes da
migração — nenhuma limpeza de resíduo necessária.

## Comandos executados

```
docker compose ps                                    # postgres já up, porta 5433
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.19.0
npm install
export DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo
npx drizzle-kit migrate                               # aplica 0020 (RLS + NOT NULL)
npx tsc --noEmit
npx eslint .
npx vitest run --passWithNoTests
npx vitest run --coverage --passWithNoTests
```

## Migração 0020

Aplicada sem erro (zero linha nas 6 tabelas em produção/dev, confirmado via
`select count(*)` antes da migração). Pós-migração: `tenant_id` NOT NULL nas
6 tabelas (`information_schema.columns.is_nullable = 'NO'`); RLS
`ENABLE`+`FORCE` e policy `tenant_isolation` presentes nas 6 (`pg_class`,
`pg_policies`), confirmado via `psql` manual.

## typecheck / lint

- `npx tsc --noEmit`: 0 erros.
- `npx eslint .`: 0 erros/avisos.
- Grep manual por `as any`/`@ts-ignore`/`as unknown as` de conveniência nos
  arquivos de produção alterados: nenhum hit fora de casts já existentes de
  tradução JSONB↔domínio (padrão pré-existente, não introduzido por esta PR).

## Suíte completa (sem coverage)

- **178 arquivos de teste, 1073 testes, 100% passando**, 0 fail, 0 skip
  inesperado (só `describe.skipIf(!DATABASE_URL)`, todos executados com
  Postgres up). Inclui os 8 testes novos de `tenant-isolation.test.ts`
  (extração/validação) e os 3 testes novos do QA (RLS de catálogo).

## Suíte completa (com --coverage)

- 1 falha isolada: `tests/bounded-contexts/ingestao-identificacao/infrastructure/sanitizar-conteudo-documento.test.ts`
  — assert de timing (`duracaoMs < 200ms`) estourado (225-298ms) sob overhead
  de instrumentação v8. Classificado como **problema de ambiente** (timing
  threshold sensível a carga da máquina/instrumentação), não relacionado a
  esta PR: arquivo não alterado pelo diff (`git diff main...HEAD --stat` não
  o lista), e passa isoladamente em <50ms sem `--coverage`. Não bloqueia o
  gate — reexecução da suíte completa sem `--coverage` confirma 178/178
  verde no mesmo commit.
- Demais 177 arquivos / 1069 testes: 100% passando.

## Achado do QA e correção

Gap de teste identificado e fechado (ver traceability-matrix-T047.md) —
asserção de catálogo RLS ausente em `extracao`/`validacao`/`orquestracao`
`schema.test.ts`. Adicionados 3 `it()` + 1 asserção de NOT NULL faltante,
commit `3049998`, pushado para a branch do PR. Suíte completa re-executada
no HEAD final: 178/178 arquivos, 1073/1073 testes, `tsc`/`eslint` limpos.

## Allure

`allure-vitest` configurado em `vitest.config.ts` (`resultsDir:
"allure-results"`). `allure-results/` gerado localmente pela execução da
suíte completa (6461 arquivos JSON/attachment, 1073 testes). Geração do
relatório HTML (`npx allure generate`) não executada — `allure` CLI não é
dependência do projeto (mesma limitação registrada em validações anteriores
desta spec); `allure-results/` bruto é evidência suficiente e reproduzível.
