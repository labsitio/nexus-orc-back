# QA Final Report — T012 (PR #501)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T012 — Domain: agregado `IndiceOrcamento`
- Branch: `feat/004-t012-agregado-indice-orcamento`
- PR: #501 (draft)
- Commits: 112eed0 (implementação), 5682cf2 (fix de review), ac4886e (remoção de package-lock.json commitado por engano, irrelevante ao QA)
- Tipo de validação: primeira validação (não é reteste)

## Resumo executivo
Domain puro, sem dependência de infra. Implementação atende ao critério de aceite de T012, incluindo a invariante crítica (nunca INDEXADO sem embedding), retry sem limite estrutural, histórico append-only e imutabilidade de `conteudoIndexavel`/`origemValidacao`. O dev-back-end já havia escrito 10 testes cobrindo os cenários centrais; o QA adicionou 3 testes de borda (getters, reidratação de `FALHA_INDEXACAO` com histórico, cópia defensiva do histórico em `reconstituir`) para fechar a cobertura de statements/functions a 100%. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
Cobertos (ver `qa/traceability-matrix.md`):
- Estado inicial PENDENTE.
- Transição INDEXADO só com embedding na mesma tentativa (positivo e negativo).
- Transição FALHA_INDEXACAO preservando histórico.
- Retry sem limite estrutural no Domain.
- Histórico append-only e exposto como cópia defensiva.
- `OrigemValidacaoImutavelError` em tentativa de sobrescrita de `conteudoIndexavel`/`origemValidacao`.
- `reconstituir`: caso válido (INDEXADO com embedding), caso inválido (INDEXADO sem embedding → `IndiceOrcamentoInconsistenteError`), caso FALHA_INDEXACAO com histórico, cópia defensiva do histórico recebido.

Não cobertos por esta task (fora de escopo de T012, dependem de tasks futuras):
- Persistência real (`IndiceOrcamentoRepository`, T015/T016).
- Domain Events `orcamento-indexado`/`falha-indexacao-detectada` (T013).
- `OrcamentoValidadoEventACL` (T018).
- Caso de uso `IndexarOrcamento` e handler Lambda (T029, T030).

## Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts --coverage --coverage.include='src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.ts'`
- `npx vitest run tests/bounded-contexts/busca-indexacao` (regressão do BC)
- `npx vitest run` (regressão completa do repositório)
- `npx eslint src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.ts tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts`
- `npx tsc --noEmit -p .`

## Quantidade de testes por tipo
- Unitário (Domain): 13 testes no arquivo do agregado (10 do dev-back-end + 3 adicionados pelo QA).
- Integração/E2E: não aplicável a esta task (Domain puro).

## Resultado
- Arquivo do agregado: 13 passed, 0 failed.
- Regressão do BC busca-indexacao: 59 passed, 3 skipped (pré-existentes, teste de schema Drizzle dependente de infra ainda não implementada — não relacionado a T012).
- Regressão completa do repositório: 515 passed, 45 skipped (pré-existentes em outros BCs, não relacionados a T012), 0 failed.
- Lint: sem apontamentos nos arquivos alterados.
- Typecheck (`tsc --noEmit`): sem erros.

## Cobertura inicial e final (arquivo `indice-orcamento.aggregate.ts`)
Baseline (10 testes do dev-back-end):
- Statements: 93.75% (30/32)
- Branches: 100% (6/6)
- Functions: 84.61% (11/13)
- Lines: 93.75% (30/32)
- Linhas não cobertas: 86, 94 (getters `conteudoIndexavel`/`origemValidacao`)

Final (13 testes, após adição do QA):
- Statements: 100% (32/32)
- Branches: 100% (6/6)
- Functions: 100% (13/13)
- Lines: 100% (32/32)

## Allure
- `allure-vitest` já configurado no `vitest.config.ts` do repositório (reporter `allure-vitest/reporter`, `resultsDir: allure-results`).
- `allure-results/` gerado na raiz do repositório pela execução completa da suíte (`npx vitest run`), incluindo os resultados do arquivo de teste desta task.
- Geração do relatório HTML e publicação como artefato de CI é responsabilidade do pipeline — sem alteração de CI necessária, o reporter já estava configurado antes desta task.

## Bugs por severidade e status
Nenhum bug encontrado. Nenhum `specs/004-indexacao-busca-semantica-orcamentos/bugs/BUG-XXX.md` criado.

## Riscos residuais
Nenhum risco de domínio identificado para o escopo de T012. Risco de integração (upsert idempotente por `orcamentoId`, invariante de retry ponta a ponta) fica para T016/T025-T027, quando a infraestrutura existir.

## Limitações do ambiente
Nenhuma. Task é Domain puro, sem dependência de banco/AWS/rede — execução local completa.

## Parecer final
APROVADO PELO QA
