# QA Final Report — T012b (PR #532)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T012b (ADR-005, retrofit) — atributo `tenantId: TenantId` obrigatório e imutável no agregado `IndiceOrcamento`
- Branch: `feat/004-t012b-tenantid-indice-orcamento`
- PR: #532
- Commit: 856bda9
- Reviewer: backend-reviewer — APPROVE WITH NITS (achado não bloqueante: `reconstituir` não revalida `tenantId` em runtime, mesmo padrão já aceito nos VOs irmãos)
- Tipo de validação: primeira validação (não é reteste de BUG)

## Resumo executivo
Retrofit de ADR-005 sobre o agregado já validado em T012. Diff cirúrgico: `tenantId: TenantId` adicionado a `IndiceOrcamentoProps` (herdado por `IndiceOrcamentoReconstituirProps`), parâmetro posicional no construtor privado, getter/setter seguindo exatamente o padrão já existente de `conteudoIndexavel`/`origemValidacao` (setter lança `TenantIdImutavelError extends ErroDominio`, mesmo desenho de `OrigemValidacaoImutavelError`), e validação de obrigatoriedade em `criar()` lançando `IndiceOrcamentoInconsistenteError`. Nenhuma lógica de estado (`registrarTentativaIndexacao`, transições PENDENTE/INDEXADO/FALHA_INDEXACAO) foi tocada. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
Critério de aceite de T012b (tasks.md): "unit test cobrindo criação sem `tenantId` (erro), sobrescrita pós-criação (erro)".

Cobertos (ver `qa/traceability-matrix.md`):
- Criação sem `tenantId` → `IndiceOrcamentoInconsistenteError` (`rejeita criação sem tenantId`).
- Sobrescrita de `tenantId` pós-criação → `TenantIdImutavelError` (`rejeita sobrescrever tenantId fora do construtor`).
- Getter expõe o `tenantId` definido no construtor (`expõe tenantId definido no construtor`).
- Todos os 13 testes pré-existentes de T012 (estado inicial, transições de indexação, retry, histórico append-only, imutabilidade de `conteudoIndexavel`/`origemValidacao`, `reconstituir`) permanecem verdes com o novo parâmetro obrigatório propagado em cada `IndiceOrcamento.criar`/`.reconstituir` do arquivo de teste.

Não cobertos por esta task (fora de escopo de T012b, dependem de tasks futuras — já registrado nas notas do achado do reviewer e no plano de sequenciamento do tasks.md):
- `reconstituir` não revalida `tenantId` em runtime (aceito, mesmo padrão dos VOs irmãos — risco herdado, não introduzido por este PR).
- Persistência com `tenant_id`/RLS (T015b), upsert por `orcamentoId`+`tenantId` e `DrizzleTenantScopedRepositoryBase` (T016).
- Domain Events com `tenantId` no payload em `schemaVersion: 2` (T013b).
- Isolamento cross-tenant ponta a ponta (T027b).

## Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain` (suíte alvo)
- `npx vitest run --reporter=default --coverage tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` (cobertura do arquivo, via `coverage-final.json`)
- `npx vitest run --reporter=default` (regressão completa do repositório)
- `npx eslint src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.ts tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts`
- `npx tsc --noEmit -p .`

`pnpm test` não foi usado (incompatibilidade ambiental conhecida do `allure-vitest`, registrada em memória do projeto).

## Quantidade de testes por tipo
- Unitário (Domain): 16 testes no arquivo do agregado (13 herdados de T012 + 3 adicionados nesta task: criação sem `tenantId`, sobrescrita pós-criação, getter de `tenantId`).
- Integração/E2E: não aplicável a esta task (Domain puro).

## Resultado
- Suíte alvo (`tests/bounded-contexts/busca-indexacao/domain`): 10 arquivos, 66 passed, 0 failed.
- Arquivo do agregado isolado: 16 passed, 0 failed.
- Regressão completa do repositório (`npx vitest run --reporter=default`): 605 passed, 76 skipped, 3 failed.
  - As 3 falhas são timeout (`Test timed out in 5000ms`) em `tests/bounded-contexts/ingestao-identificacao/application/receber-orcamento-multicanal.integration.test.ts` e `tests/bounded-contexts/ingestao-identificacao/contract/confirmar-upload.controller.test.ts` (2 testes) — BC não tocado por este diff (`git diff --stat main...HEAD` confirma alteração apenas em `indice-orcamento.aggregate.ts`, teste correspondente e `tasks.md`). Reexecutados isoladamente: os 2 arquivos passam 100% (6/6 testes, sem timeout) — classificado como falha preexistente/ambiental de execução em paralelo da suíte completa, não relacionada a T012b. Não bloqueia o gate desta task.
- Lint: sem apontamentos nos arquivos alterados.
- Typecheck (`tsc --noEmit`): sem erros.

## Cobertura inicial e final (arquivo `indice-orcamento.aggregate.ts`)
Baseline (T012, PR #501, 13 testes): 100% statements/branches/functions/lines (já fechada antes deste retrofit).

Final (T012b, 16 testes, via `coverage-final.json` do provider v8):
- Statements: 100% (39/39)
- Branches: 100% (8/8)
- Functions: 100% (mantido)
- Lines: 100% (mantido)

Nenhuma linha nova (getter/setter/validação de `tenantId`) ficou descoberta.

## Allure
- `allure-vitest` já configurado no `vitest.config.ts` do repositório.
- Execução via `--reporter=default` (contorno documentado para a incompatibilidade ambiental do `pnpm test`) não gera novo `allure-results` nesta rodada; resultados de T012 já publicados anteriormente cobrem a estrutura do agregado. Sem alteração de CI necessária — reporter já estava configurado antes desta task.

## Bugs por severidade e status
Nenhum bug encontrado. Nenhum `specs/004-indexacao-busca-semantica-orcamentos/bugs/BUG-XXX.md` criado.

## Riscos residuais
- `reconstituir` não valida `tenantId` em runtime (achado do backend-reviewer, não bloqueante, mesmo padrão dos VOs irmãos) — risco de dado persistido inconsistente só é mitigado na camada de infraestrutura (T015b/T016, RLS + `DrizzleTenantScopedRepositoryBase`), não no Domain. Registrado para acompanhamento em T016, não é ação desta task.
- Domain Events ainda em `schemaVersion: 1` sem `tenantId` no payload — T013b, ainda `[ ]` no tasks.md, não bloqueia este PR isoladamente mas MUST ser resolvido no mesmo checkpoint de Foundational antes de T016 fechar (já registrado no próprio tasks.md).

## Limitações do ambiente
Nenhuma para o escopo desta task (Domain puro, sem banco/AWS/rede). As 3 falhas de timeout observadas na regressão completa são ambientais/de contenção de recursos ao rodar a suíte inteira e não afetam o parecer de T012b.

## Parecer final
APROVADO PELO QA
