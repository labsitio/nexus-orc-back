# QA Final Report — T003 (PR #468)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- PR: #468 (draft), branch feat/004-busca-indexacao
- Commit: c99f3a0
- Task: T003 — migração Drizzle Kit baseline do BC Busca & Indexação
  (`indices_orcamento` com `embedding vector(1024)` + índice HNSW cosseno,
  `indices_orcamento_historico` minimalista)

## Resumo executivo
Task de infraestrutura pura (schema Drizzle + SQL gerado), sem Domain/Application/
Interface implementados ainda (fora de escopo, chegam em T007+). Já aprovada pelo
backend-reviewer (APPROVE, sem achados). Validação de QA executada em duas camadas:
(1) estática — schema.ts, SQL gerado, snapshot, journal, `drizzle-kit check`,
`drizzle-kit generate` (rerun sem diff); (2) dinâmica — Postgres real
(`pgvector/pgvector:pg16` via docker-compose já existente no repo), migração
aplicada de fato (`drizzle-kit migrate`) e as 3 asserções de schema (schema/tabelas
existem, `embedding` é `vector(1024)`, índice HNSW `vector_cosine_ops` existe)
confirmadas por query SQL direta contra o banco migrado.

Gap identificado e corrigido pelo próprio QA (sem tocar produção): tasks.md não
associa teste dedicado a T003, mas há convenção estabelecida no repositório —
toda task de migração baseline anterior (spec 001 `orcamento.schema.test.ts`,
spec 003 `validacao-orcamento.schema.test.ts`) ganhou um teste de integração
`describe.skipIf(!DATABASE_URL)` verificando schema/tabelas contra Postgres real.
T003 estava sem o equivalente. QA criou
`tests/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento.schema.test.ts`
seguindo o mesmo padrão, e validou as 3 asserções manualmente contra Postgres
real (ver "Suítes executadas").

## Requisitos cobertos
- Coluna `embedding vector(1024)` em `indices_orcamento` — confirmada por
  `format_type(atttypid, atttypmod)` = `vector(1024)` contra Postgres real.
- Índice HNSW distância cosseno em `indices_orcamento.embedding` — confirmado
  por `pg_indexes.indexdef` contendo `USING hnsw (embedding vector_cosine_ops)`.
- `indices_orcamento_historico` minimalista (baseline, só PK) — confirmado.
- Ambas as tabelas vazias/baseline, sem dados — por design, tabelas recém-criadas.
- Journal Drizzle Kit sequencial e consistente (idx 9, tag
  `0009_busca_indexacao_baseline`, após `0008_enable_pgvector_extension`, sem gap).
- `drizzle-kit check`: sem drift entre `schema.ts` e histórico de migrações.
- `drizzle-kit generate` (rerun): "No schema changes, nothing to migrate" —
  migração é reprodutível a partir do schema.ts atual.
- `drizzle-kit migrate` contra Postgres real (`pgvector/pgvector:pg16`,
  docker-compose já provisionado no repo): aplicada sem erro.

## Não coberto / não aplicável
- Domain/Application/Interface do BC Busca & Indexação: fora de escopo de T003
  (chegam em T007+), nada a testar aqui.
- Colunas reais além de `embedding` (ex. `conteudo_indexavel` JSONB, histórico
  append-only com CHECKs/triggers): fora de escopo de T003, chegam em T015 com
  seu próprio teste (mesmo padrão observado no BC Extração, T003→T012).
- Aplicação da migração contra Aurora Serverless v2 real: fora do alcance desta
  sessão (só Postgres local via docker-compose); responsabilidade de
  DevOps/Ricardo em ambiente real, já registrada como coordenação prévia em T002.

## Suítes executadas e comandos
- `npx tsc --noEmit` — sem erros.
- `npx eslint <arquivos alterados>` — sem erros/warnings.
- `npx drizzle-kit check` — "Everything's fine", sem drift.
- `npx drizzle-kit generate` (rerun) — nenhuma migração nova gerada, working
  tree permaneceu limpo.
- `docker compose up -d postgres` (imagem `pgvector/pgvector:pg16`, já
  configurada no `docker-compose.yml` do repo) + `drizzle-kit migrate` —
  migração 0009 aplicada com sucesso contra banco real.
- Query SQL direta (`pg` client, fora do vitest) confirmando as 3 asserções do
  teste de schema criado por este QA (ver acima).
- `npx vitest run` — **bloqueado neste worktree**: todos os arquivos de teste
  falham com `Error: Vitest failed to find the runner` em
  `allure-vitest/src/setup.ts`, incluindo um teste já mesclado e não relacionado
  a este PR (`tests/bounded-contexts/ingestao-identificacao/.../orcamento.schema.test.ts`).
  Causa raiz identificada: pnpm resolveu duas instâncias físicas distintas do
  pacote `vitest` neste worktree (`vitest@4.1.10_@opentelemetr_...` vs o
  `@vitest+runner@4.1.10_vitest@4.1.10` usado internamente por `allure-vitest`),
  quebrando o registro de runner entre módulos. `pnpm install --frozen-lockfile`
  não alterou o estado (já estava "up to date"). Confirmado como problema de
  ambiente pré-existente e não introduzido por este PR — relatório de QA anterior
  desta mesma spec (T002, PR #446) registra 290 testes passando via
  `npx vitest run` em sessão anterior, evidenciando que a quebra é do estado
  atual deste worktree, não do código deste diff nem do repositório em geral.
  Compensado por verificação SQL direta equivalente (ver acima).

## Cobertura
Não aplicável a este PR: nenhum código de aplicação (Domain/Application/Interface)
foi alterado — apenas schema Drizzle + SQL gerado + 1 teste de integração novo
(não executável nesta sessão pelo bloqueio de ambiente do vitest, mas suas
asserções foram validadas manualmente, ver acima). Sem alteração de
statements/branches/functions/lines exercitáveis pela suíte de unidade.

## Allure
Não gerado nesta sessão — bloqueio de ambiente do runner vitest (ver acima)
impede a execução do reporter `allure-vitest`. Sem regressão introduzida por
este PR (mesmo bloqueio afeta testes já mesclados de specs anteriores).

## Bugs
Nenhum defeito de produção encontrado. Schema, SQL gerado e comportamento real
contra Postgres estão consistentes com o critério de aceite de T003.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
- Bloqueio de ambiente do vitest neste worktree (`allure-vitest`/duplicação de
  módulo `vitest` via pnpm) impede execução automatizada da suíte completa,
  incluindo o teste novo de T003. Recomenda-se investigação de causa raiz no
  grafo de dependências do pnpm (possível peer dependency de `@opentelemetry/*`
  duplicando a resolução de `vitest`) antes da próxima sessão de QA desta spec,
  para não repetir a verificação manual por SQL a cada task de schema.
- Aplicação real contra Aurora Serverless v2 (vs. Postgres local com
  `pgvector/pgvector:pg16`) não verificada nesta sessão — responsabilidade de
  DevOps/Ricardo em ambiente real (mesmo risco já registrado em T002).

## Limitações do ambiente
- `npx vitest run` inoperante neste worktree (ver causa raiz acima); contornado
  com verificação SQL direta equivalente às asserções do teste criado.
- Sem Aurora Serverless v2 real disponível nesta sessão; Postgres local com
  pgvector via docker-compose já provisionado no repo foi suficiente para
  validar a migração fisicamente.

## Parecer final
APROVADO COM RESSALVAS

Ressalvas (nenhuma bloqueante para o escopo isolado de T003):
1. Bloqueio de ambiente do vitest neste worktree impede confirmar por CI local
   que o teste de schema criado por este QA passa através do runner — suas
   asserções foram, no entanto, confirmadas manualmente contra Postgres real.
   Recomendado a DevOps/Tech Lead investigar a duplicação de módulo `vitest`
   via pnpm antes da próxima rodada de QA desta spec.
2. Aplicação física contra Aurora Serverless v2 real não verificada (mesmo
   risco já aceito em T002); DevOps deve confirmar em ambiente real antes de
   produção.

Sem defeito de produção. Migração e schema cumprem o critério de aceite de T003.
