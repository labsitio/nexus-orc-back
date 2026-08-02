# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T029

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #551
- Branch: `feat/003-t029-validacao-multiplas-regras`
- Commit testado: `72ca445`
- Task: T029 [US2] Unit test `OrcamentoValidacao.avaliarRegrasDeConsistencia`
  com 1+ regra falhando → transita direto para `PENDENTE_REVISAO_HUMANA`
  (nunca uma segunda tentativa automática, ADR-001), `inconsistencias`
  populado com a(s) regra(s) específica(s) (issue #139)
- Primeira validação (sem BUG-XXX prévio)
- Revisão prévia de código: backend-reviewer, APPROVE (1 NIT, sem ação
  necessária)

## 2. Resumo executivo
Diff real (relativo a `02662d1`, HEAD anterior na trilha 003) toca só 2
arquivos: `tests/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.test.ts`
(+26 linhas, 1 caso novo) e `tasks.md` (T029 marcada `[x]`). Nenhum arquivo de
produção alterado; `orcamento-validacao.aggregate.ts` já existia e não foi
tocado.

O caso novo cobre a lacuna que faltava no arquivo (já havia teste para 1
inconsistência): duas regras falhando simultaneamente
(`CNPJ_INVALIDO` + `PRECO_FORA_DE_FAIXA`), verificando:
- transição direta para `PENDENTE_REVISAO_HUMANA` (não passa por estado
  intermediário);
- `inconsistencias` com as 2 entradas, na ordem e com o `regra` de cada uma
  (`CNPJ_INVALIDO`, `PRECO_FORA_DE_FAIXA`);
- `historico[0].resultado === 'INCONSISTENTE'`;
- ADR-001 (nunca segunda tentativa automática): chamar
  `avaliarRegrasDeConsistencia([])` de novo, mesmo com lista vazia (que
  simularia "tudo corrigido"), lança `TransicaoInvalidaValidacaoError` e o
  status permanece `PENDENTE_REVISAO_HUMANA` — a guarda em
  `avaliarRegrasDeConsistencia` (`if (this._status !== 'PENDENTE') throw`)
  é o único ponto de decisão, e o teste comprova que ela vale mesmo com 2+
  inconsistências, não só com 1.

Inspecionei `src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.ts`
linha a linha: a asserção do teste corresponde exatamente ao comportamento
implementado (`aplicarResultadoAvaliacao` substitui `_inconsistencias` pela
lista completa recebida e empilha uma única entrada de histórico
`INCONSISTENTE`; `avaliarRegrasDeConsistencia` só aceita partir de
`PENDENTE`). Nenhuma asserção foi enfraquecida para passar — o teste falha
pelo motivo certo se a guarda de status for removida (verificado por
inspeção do guard clause, único ponto que impede a segunda tentativa).

Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
Cobertos por este teste (critério de aceite de T029, spec.md/ADR-001):
- 2+ regras falhando → `PENDENTE_REVISAO_HUMANA` direto;
- `inconsistencias` populado com cada regra específica que falhou;
- nunca há segunda tentativa automática — reavaliação só via
  `registrarDecisaoHumana` (já coberta por outros testes do mesmo arquivo:
  linhas 136–163).

Não coberto / fora do escopo desta task, não lacuna:
- `OrcamentoValidacao.reconstituir` (linhas 86–88 do agregado) — sem teste
  direto neste arquivo; é exercitado pelos testes de repositório
  (`drizzle-orcamento-validacao.repository.test.ts`), hoje `skipIf` por
  falta de Postgres local. Risco pré-existente, não introduzido por T029.
- T030 (decisão humana pós múltiplas regras) e T031 (pendência confirmada
  pela Extração) — tasks distintas, ainda não iniciadas.

## 4. Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.test.ts`
  → 1 arquivo, 11 testes, todos passando (10 pré-existentes + 1 novo de
  T029).
- `npx vitest run tests/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.test.ts --coverage --coverage.include='src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.ts' --reporter=default`
  → cobertura do agregado isolado (ver seção 7).
- `npx vitest run --reporter=default tests/bounded-contexts/validacao` (regressão
  do BC completo) → 22 arquivos passaram (119 testes), 3 skipped (integração
  Postgres real, sem `DATABASE_URL` local, `describe.skipIf`, padrão
  pré-existente), 4 arquivos falharam por `Cannot find package` (`pino`,
  `@aws-sdk/client-eventbridge`, `@opentelemetry/instrumentation-aws-lambda`)
  — `node_modules` incompleto neste worktree, ambiental, nenhum desses 4
  arquivos foi tocado por este PR. Total: 119 passed, 15 skipped, 0 falhas
  relacionadas ao diff.
- `npx eslint tests/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.test.ts`
  → sem achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest, conhecida
  — `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Unitário (Domain, sem I/O): 11 no arquivo (1 novo desta task + 10
  pré-existentes, reexecutados sem alteração).
- Regressão do BC completo (pré-existente, não alterada por esta task): 108
  testes adicionais (119 − 11), reexecutados sem falha relacionada ao diff.

## 6. Resultado
- Aprovados (escopo T029, arquivo alterado): 11
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 119 passed, 15 skipped, 4 arquivos falhos por
  causa ambiental pré-existente (não relacionada ao diff)

## 7. Cobertura inicial e final
Cobertura do arquivo `orcamento-validacao.aggregate.ts` isolado (v8, restrita
a este arquivo, medida com os 11 testes do arquivo alterado):
- Statements: 90.9% (30/33)
- Branches: 100% (8/8)
- Functions: 85.71% (12/14)
- Lines: 90.9% (30/33)
- Não coberto: linhas 87–95 (`static reconstituir`) — gap pré-existente,
  exercitado apenas pelos testes de repositório (hoje skipped por ausência
  de Postgres local), não introduzido nem alterado por T029.

Não havia coverage-baseline.md registrado nesta spec antes desta task; T029
adiciona 1 caso de teste sem remover cobertura existente. Threshold do
projeto não foi reduzido; nenhum arquivo foi excluído da medição para
inflar percentual.

## 8. Allure
Não gerado nesta execução: `pnpm test` (reporter Allure do projeto) está
ambientalmente quebrado (`project_allure_vitest_incompat`), condição
pré-existente, não introduzida por T029. Execução e evidência usam
`vitest run --reporter=default` com output completo capturado acima; sem
dados sensíveis — os únicos dados usados no teste novo são identificadores
sintéticos de regra de negócio (`CNPJ_INVALIDO`, `PRECO_FORA_DE_FAIXA`) e um
UUID de teste (`01890a5d-ac96-774b-bcce-b02c8f2726a1`).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- `OrcamentoValidacao.reconstituir` sem teste unitário direto — coberto só
  indiretamente por testes de repositório hoje skipped por ambiente sem
  Postgres local. Risco pré-existente, não introduzido por T029.
- Falha de 4 arquivos de teste de infraestrutura/observabilidade do BC por
  `node_modules` incompleto neste worktree — ambiental, não relacionado ao
  diff, sinalizado para quem reconstruir o ambiente (DevOps/dev-back-end),
  não bloqueia esta task de teste unitário puro.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- `node_modules` incompleto neste worktree (`pino`,
  `@aws-sdk/client-eventbridge`, `@opentelemetry/instrumentation-aws-lambda`
  ausentes) — impede rodar 4 arquivos de teste de infraestrutura do mesmo
  BC; nenhum deles foi tocado por este PR.
- Testes de integração com Postgres real (3, em outros arquivos do BC)
  skipped nesta execução por ausência de `DATABASE_URL` local — não
  relacionado a T029 (agregado de domínio não tem dependência de banco).

## 12. Parecer final
APROVADO PELO QA
