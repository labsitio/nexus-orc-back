# Matriz de rastreabilidade — 007-isolamento-multitenant-dados

Escopo desta entrada: T002, T003 (demais tasks ainda não implementadas).

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T002 | `TenantContext` existe no Shared Kernel, carrega `TenantId` | unitário | carrega o TenantId informado | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ |
| T002 | nunca estado global mutável (imutabilidade do objeto) | unitário | é imutável em runtime (congelado) — `Object.freeze` + `readonly` | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ |
| T002 | nunca estado global mutável (sem singleton/módulo compartilhado) | unitário | cada chamada produz uma instância independente | tests/shared-kernel/tenant/tenant-context.test.ts | PASS | allure-results/ (teste adicionado pelo QA) |
| T002 | Shared Kernel restrito, sem lógica de negócio, sem import de framework/ORM/SDK (ADR-004) | inspeção estática | único import é `TenantId` (sibling no shared-kernel); sem código de módulo com estado | `src/shared-kernel/tenant/tenant-context.ts` (revisão manual + grep) | PASS | verificado nesta validação |

Observação: a garantia "request-scoped" completa (uma instância por requisição) depende do `TenantContextMiddleware` (T005, ainda não implementado) — fora do escopo desta task. O que é verificável em T002 e foi verificado: o tipo em si não guarda estado em módulo/singleton, o que é pré-condição necessária para T005 cumprir o requisito.

## T003 — lint rule/checklist de exceção de import cross-BC (ADR-004)

| Task | Critério de aceite | Nível | Cenário | Arquivo de teste | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T003 | `npx eslint .` no repo atual passa limpo (nenhuma violação pré-existente) | estático/lint | executar `npx eslint .` na raiz do repo | eslint.config.mjs + eslint-rules/no-cross-bounded-context-import.mjs | PASS | saída vazia, exit 0 (verificado nesta validação) |
| T003 | import relativo cross-BC entre BCs irmãos é detectado como erro pela regra `nexo-boundaries/no-cross-bounded-context-import` | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `../../extracao/domain/extracao-orcamento.aggregate` via `import` estático | fixture QA descartável (`__qa_tmp_cross_bc_relative.ts`, removida após verificação) | PASS | 1 erro reportado com `messageId: crossBcImport` |
| T003 | import same-BC passa limpo | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `./orcamento.aggregate` (mesmo BC) | fixture QA descartável (`__qa_tmp_same_bc.ts`, removida após verificação) | PASS | nenhum erro reportado |
| T003 | import de `src/shared-kernel/tenant/` passa limpo (exceção ADR-004) | adversarial/lint | fixture temporária em `ingestao-identificacao/domain/` importando `../../../shared-kernel/tenant/tenant-id.vo` | fixture QA descartável (`__qa_tmp_shared_kernel.ts`, removida após verificação) | PASS | nenhum erro reportado |
| T003 (adversarial adicional) | `export ... from` cross-BC também é bloqueado | adversarial/lint | fixture com `export { ExtracaoOrcamento } from '../../extracao/domain/extracao-orcamento.aggregate'` | fixture QA descartável (`__qa_tmp_cross_bc_export_from.ts`, removida após verificação) | PASS | 1 erro reportado |
| T003 (adversarial adicional) | `require()` cross-BC também é bloqueado | adversarial/lint | fixture com `require('../../extracao/domain/extracao-orcamento.aggregate')` | fixture QA descartável (`__qa_tmp_cross_bc_require.ts`, removida após verificação) | PASS | 1 erro reportado (mais 1 erro pré-existente `@typescript-eslint/no-require-imports`, não relacionado à regra sob teste) |
| T003 (adversarial adicional) | `import()` dinâmico cross-BC também é bloqueado | adversarial/lint | fixture com `import('../../extracao/domain/extracao-orcamento.aggregate')` dentro de função async | fixture QA descartável (`__qa_tmp_cross_bc_dynamic_import.ts`, removida após verificação) | PASS | 1 erro reportado |
| T003 | checklist de PR documenta a exceção e referencia o comando/regra correta | inspeção estática | revisão manual de `.github/pull_request_template.md` | `.github/pull_request_template.md` | PASS | nome da regra e caminho do arquivo confirmados batendo com `eslint.config.mjs` |

Observação: fixtures adversariais foram criadas, executadas isoladamente com `npx eslint <arquivo>` e removidas ao final da validação — nenhuma permanece no repositório (`git status` limpo após a checagem). Nenhum código de produção foi alterado nesta validação.
