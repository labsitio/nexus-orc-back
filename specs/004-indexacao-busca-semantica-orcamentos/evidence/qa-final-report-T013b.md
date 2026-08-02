# QA Final Report — T013b (PR #533)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T013b (ADR-005, retrofit) — Domain Events `OrcamentoIndexado` e `FalhaIndexacaoDetectada` sobem para `schemaVersion: 2`, com `tenantId: string` obrigatório no envelope comum
- Branch: `feat/004-t013b-eventos-schemav2-tenantid`
- PR: #533
- Commit: c0757a9
- Reviewer: backend-reviewer — APPROVE, sem achados
- Tipo de validação: primeira validação (não é reteste de BUG)

## Resumo executivo
Retrofit cirúrgico de ADR-005 sobre os 2 Domain Events já validados em T013. Diff: `DomainEventEnvelope.schemaVersion` muda de implícito/1 para `2`, campo `tenantId: string` adicionado ao envelope; `OrcamentoIndexado`/`FalhaIndexacaoDetectada` propagam `tenantId` como parâmetro posicional do construtor, mesma posição adotada em T012b para o agregado. Nenhuma lógica de negócio (motivoFalha, tentativaNumero, modeloEmbedding, ocorreuEm) foi alterada. Nenhum consumidor de produção publica ou lê esses eventos ainda (T029 — caso de uso `IndexarOrcamento` — permanece `[ ]` em tasks.md), portanto não há risco de quebra de contrato em código já integrado. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
Critério de aceite de T013b (tasks.md linha 38): "subir os 2 Domain Events de T013 para `schemaVersion: 2`, payload incluindo `tenantId` obrigatório".

Cobertos (ver `qa/traceability-matrix.md`, seção T013b):
- `schemaVersion` = 2 em ambos os eventos.
- `tenantId` obrigatório, presente no envelope e no payload de cada evento.
- Contrato pré-existente preservado: `orcamentoId`, `detailType`, `ocorreuEm` (ISO-8601), `modeloEmbedding` (`OrcamentoIndexado`), `motivoFalha`/`tentativaNumero` (`FalhaIndexacaoDetectada`).

Não coberto por esta task (fora de escopo, dependem de tasks futuras, já registrado em tasks.md):
- Publicação real dos eventos por caso de uso (`IndexarOrcamento`, T029) — ainda não implementado, nada a testar em integração.
- Persistência com `tenant_id`/RLS (T015b), `DrizzleTenantScopedRepositoryBase` (T016).
- Isolamento cross-tenant ponta a ponta (T027b).

## Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain/events` (suíte alvo)
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain` (regressão do BC)
- `npx vitest run --reporter=default --coverage tests/bounded-contexts/busca-indexacao/domain/events/domain-events.test.ts` (cobertura, via `coverage-final.json`)
- `npx vitest run --reporter=default` (regressão completa do repositório)
- `npx eslint src/bounded-contexts/busca-indexacao/domain/events tests/bounded-contexts/busca-indexacao/domain/events`
- `npx tsc --noEmit`

`pnpm test` não foi usado (incompatibilidade ambiental conhecida do `allure-vitest`, registrada em memória do projeto).

## Quantidade de testes por tipo
- Unitário (Domain): 4 testes no arquivo de eventos (`domain-events.test.ts`) — describe.each com 2 casos (schemaVersion/tenantId/orcamentoId/detailType/ocorreuEm) + 1 teste dedicado por evento (payload específico).
- Integração/E2E: não aplicável a esta task (Domain puro, sem publisher/consumidor implementado ainda).

## Resultado
- Suíte alvo (`tests/bounded-contexts/busca-indexacao/domain/events`): 1 arquivo, 4 passed, 0 failed.
- Suíte do BC (`tests/bounded-contexts/busca-indexacao/domain`): 10 arquivos, 66 passed, 11 skipped, 0 failed.
- Regressão completa do repositório (`npx vitest run --reporter=default`): 113 arquivos, 610 passed, 76 skipped, 0 failed. Sem flakes desta vez (diferente da regressão de T012b, que teve 3 timeouts ambientais não relacionados).
- Lint: sem apontamentos nos arquivos alterados.
- Typecheck (`tsc --noEmit`): sem erros.

## Cobertura inicial e final (arquivos alterados)
Baseline (T013, antes do retrofit): 100% statements/branches/functions/lines nos 2 arquivos `.event.ts` (já fechada); `domain-event.ts` é apenas `interface`, sem statement executável.

Final (T013b, via `coverage-final.json`, provider v8):
- `orcamento-indexado.event.ts`: 7/7 stmts, 1/1 funcs, 1/1 branches (100%).
- `falha-indexacao-detectada.event.ts`: 8/8 stmts, 1/1 funcs, 1/1 branches (100%).
- `domain-event.ts`: 0/0 (interface pura, nada a cobrir).

Nenhuma linha nova (campo `tenantId`) ficou descoberta.

## Allure
- `allure-vitest` já configurado no `vitest.config.ts` do repositório (mesma configuração usada por T012/T012b).
- Execução via `--reporter=default` (contorno documentado para a incompatibilidade ambiental do `pnpm test`). Sem alteração de CI necessária para esta task.

## Bugs por severidade e status
Nenhum bug encontrado. Nenhum `specs/004-indexacao-busca-semantica-orcamentos/bugs/BUG-XXX.md` criado.

## Riscos residuais
- Bump de `schemaVersion` para `2` com campo novo obrigatório é, por definição, breaking change de contrato — mitigado neste momento porque não há publisher nem consumidor em produção (T029 ainda `[ ]`). Ação recomendada: ao implementar T029, garantir que nenhum outro serviço externo já assume `schemaVersion: 1` para este BC antes de publicar em ambiente compartilhado.

## Limitações do ambiente
Nenhuma para o escopo desta task (Domain puro, sem banco/AWS/rede).

## Parecer final
APROVADO PELO QA
