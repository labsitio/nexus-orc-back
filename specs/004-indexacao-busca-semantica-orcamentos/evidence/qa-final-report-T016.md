# QA Final Report — T016 (`DrizzlePgvectorIndiceOrcamentoRepository`, retrofit ADR-005)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T016 (retrofit ADR-005 — resolve o BLOCKER apontado pelo backend-reviewer no PR #176 original)
- PR: #536 (labsitio/nexus-orc-back), branch feat/004-t016-tenant-scoped-repository
- Commit HEAD testado: b09298a (worktree C:\Users\jonas\ai\projects\nexus-orc-back-wt-004-t016)
- Primeira validação de QA (não é reteste de BUG)
- backend-reviewer: APPROVE WITH NITS (1 NIT de texto em tasks.md, já corrigido no commit atual)

## Resumo executivo
`DrizzlePgvectorIndiceOrcamentoRepository` implementa `IndiceOrcamentoRepository`
sobre Aurora Serverless v2 Postgres + pgvector via Drizzle, agora estendendo
`DrizzleTenantScopedRepositoryBase` (spec 007/T008) e usando
`transacaoTenantScoped` em toda transação (`upsert`, `buscarPorOrcamentoId`,
`buscarPorCriterioEVetor`) — pré-requisito era T015b (migração `tenant_id`/RLS),
já validado e mergeado. Nenhum defeito de produção encontrado.

Arquivos de produção alterados:
- `src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.ts` (só JSDoc, sem mudança de contrato)
- `src/bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.ts` (novo)

## Testes executados
Ambiente: Postgres real via docker-compose (`nexus-orc-back-wt-004-t015b-postgres-1`,
pgvector/pgvector:pg16, porta 5432), já migrado até a migração mais recente
(inclui RLS de `indices_orcamento`/`indices_orcamento_historico`, T015b).

Comando: `DATABASE_URL="postgresql://nexo:nexo@localhost:5432/nexo" pnpm exec vitest run --reporter=default`
(evitado `pnpm test` puro — incompatibilidade ambiental conhecida do allure-vitest).

1. Suíte alvo (isolada):
   - `tests/bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.test.ts` — 9 testes
   - Resultado: 9/9 passando, nenhum skip (confirmado pela contagem explícita "9 tests" no relatório — `describe.skipIf(!DATABASE_URL)` só pularia silenciosamente sem `DATABASE_URL`, o que não ocorreu).

2. Regressão completa: `pnpm exec vitest run --reporter=default` (sem filtro)
   - 130 arquivos de teste, 705 testes — todos passando, 0 falhas, 0 skips.

3. Suítes de isolamento cross-tenant/RLS relacionadas (regressão direcionada, já cobertas pela completa acima, reexecutadas isoladamente para confirmação):
   - `tests/security/isolamento-multitenant/busca-indexacao.test.ts` — 4 testes
   - `tests/security/isolamento-multitenant/rls-enforcement-busca-indexacao.test.ts` — 5 testes
   - `tests/security/isolamento-multitenant/rls-enforcement.test.ts` — 4 testes
   - `tests/security/isolamento-multitenant/repositorio-tenant-scoped-adversarial.test.ts` — 3 testes
   - Resultado: 16/16 passando.

4. `pnpm exec tsc --noEmit` — sem erros.
5. `pnpm exec eslint` nos 3 arquivos alterados (produção + teste) — sem findings.

## Cobertura (T016)
Isolando a suíte alvo, `drizzle-pgvector-indice-orcamento.repository.ts`:
98% statements, 88.46% branches, 100% functions, 98% lines. Única linha não
coberta: guard defensivo em `embeddingDaLinha` para dado inconsistente (linha
com `embedding` persistido mas sem `TentativaIndexacao` `INDEXADO`
correspondente no histórico) — estado que o próprio `upsert` desta classe
nunca produz; equivalente ao padrão já aceito para `IndiceOrcamentoInconsistenteError`
no agregado (T012). Classificado como "código inviável de testar sem inserir
dado inconsistente diretamente via SQL bruto, contornando o próprio
repositório" — risco residual aceitável, não bloqueia o gate.

## Cobertura dos requisitos
Ver `specs/004-indexacao-busca-semantica-orcamentos/qa/traceability-matrix.md`
(seção "T016") para a matriz completa requisito↔teste. Resumo:
- Tradução linha↔agregado (PENDENTE/INDEXADO/FALHA_INDEXACAO, embedding + modeloId reidratados do histórico): coberto.
- `upsert` idempotente por `orcamentoId`+`tenantId`, histórico append-only, sem duplicar em re-upsert sem transição nova: coberto.
- `upsert` concorrente (retry de handler Lambda sobre a mesma mensagem SQS) serializado via `FOR UPDATE`, produz exatamente 1 entrada de histórico: coberto e comprovado com 2 conexões reais.
- Guard aplicativo: `upsert` rejeita agregado com `tenantId` divergente do `TenantContext` da instância: coberto.
- Persistência correta da coluna `tenant_id`: coberto.
- `buscarPorCriterioEVetor`: filtro determinístico (categoria via containment JSONB + `estado = 'INDEXADO'`) combinado com `ORDER BY` por distância cosseno, com e sem vetor de consulta: coberto.
- Retrofit ADR-005 (`DrizzleTenantScopedRepositoryBase`/`transacaoTenantScoped` em toda transação): confirmado por leitura de código e pela execução bem-sucedida de toda a suíte contra Postgres real com RLS ativa (T015b já aplicada).
- Isolamento cross-tenant real (RLS, role sem `BYPASSRLS`): não é escopo direto de T016 (a suíte alvo usa a role superuser/`BYPASSRLS` de dev, documentado explicitamente no próprio arquivo de teste), mas a garantia já foi validada por T027b/T015b e a regressão desta rodada confirma que T016 não quebrou esse comportamento (16/16 passando).

Nenhuma lacuna de requisito do escopo de T016 identificada.

## Bugs encontrados
Nenhum. Nenhum defeito de produção identificado.

## Riscos residuais
- `precoMinimo`/`precoMaximo`/`periodoRecebimento` de `CriterioBusca` ainda não
  são aplicados em `buscarPorCriterioEVetor` — documentado no próprio JSDoc do
  arquivo de produção como dependência do enriquecimento de payload da spec 003
  (T006/T045, hoje bloqueado na issue #166). Não é lacuna de T016; fica
  registrado como risco residual para quem implementar T037/T038 (US2).
- Suíte alvo depende de Postgres real (`DATABASE_URL`); sem ele, os testes são
  pulados silenciosamente via `describe.skipIf`. Confirmado neste QA que
  rodaram de fato (9/9, não 0/0).

## Limitações do ambiente
Nenhuma. Ambiente local com Postgres real disponível e migrado até a migração
mais recente (RLS de `indices_orcamento` incluída); execução completa possível
sem mocks/fakes para a camada de persistência.

## Parecer final
APROVADO PELO QA
