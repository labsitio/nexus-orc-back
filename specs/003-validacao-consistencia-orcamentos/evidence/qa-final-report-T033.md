# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T033

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Issue: #143
- Branch: `003-t033-integration-decisao-humana`
- Commit testado: `d55e0a0`
- PR: #572 (draft)
- Task: T033 [US2] Integration test — `OrcamentoExtraido` com inconsistência
  conhecida → `OrcamentoInconsistenciaDetectada` publicado → decisão humana
  via API → `OrcamentoValidado`/`OrcamentoValidadoComRessalva` publicado;
  status reflete `PENDENTE_REVISAO_HUMANA` durante a espera, sem bloquear o
  processamento de outros orçamentos
- Primeira validação (sem BUG-XXX prévio)
- Revisão prévia de código: backend-reviewer, APPROVE

## 2. Resumo executivo
Diff toca só 2 arquivos: `tests/bounded-contexts/validacao/application/registrar-decisao-humana-validacao.integration.test.ts`
(novo, 5 casos) e `tasks.md` (T033 marcada `[x]`). Nenhum arquivo de produção
alterado.

O teste exercita `ValidarOrcamento` (T024) e `ConsultarStatusValidacao`
(T026) reais, contra produção — não mockados. `RegistrarDecisaoHumanaValidacao`
(T035) e o controller `POST .../decisao-humana` (T036) ainda não existem
(tasks `[ ]` em `tasks.md`); a decisão humana é orquestrada por uma função
de teste local (`processarDecisaoHumana`) que compõe apenas peças de
produção já existentes (`OrcamentoValidacaoRepository`, `regras-consistencia.ts`,
`OrcamentoValidacao.registrarDecisaoHumana`, `EventPublisher`) — mesma
convenção já usada em `decisao-humana.contract.test.ts` (T032) para
documentar, como especificação executável, o comportamento esperado de
T035/T036 sem antecipar código de produção. Inspecionei a função: ela não
contorna nenhuma regra de negócio nem duplica lógica de decisão — apenas
chama os métodos de domínio já existentes na mesma sequência que o futuro
caso de uso deverá seguir.

Inspecionei `validar-orcamento.ts` e `orcamento-validacao.aggregate.ts` linha
a linha: o caminho de falha (`OrcamentoInconsistenciaDetectada` quando 1+
regra falha) já está implementado em produção, apesar de T034 ("completar
`ValidarOrcamento` para o caminho de falha") ainda aparecer `[ ]` em
`tasks.md` — divergência de rastreamento entre task e código real, não é
defeito de comportamento; sinalizada como observação, não bloqueia QA.

Os 5 casos cobrem exatamente os 3 critérios do "Independent Test" de US2 no
spec.md:
- (a) inconsistência específica identificada: evento `OrcamentoInconsistenciaDetectada`
  publicado com `regra: 'CNPJ_INVALIDO'` na lista.
- (b) nunca "validado" silencioso: `ConsultarStatusValidacao` retorna
  `PENDENTE_REVISAO_HUMANA` enquanto aguarda decisão; um segundo caso prova
  que uma "correção" que não resolve a inconsistência permanece
  `PENDENTE_REVISAO_HUMANA` e não publica evento terminal (nenhum evento
  novo além do primeiro) — nunca autoaprova por reprocessamento.
- (c) decisão humana explícita é o único caminho para `VALIDADO`
  (`CORRECAO_APLICADA` com dados corrigidos) ou `VALIDADO_COM_RESSALVA`
  (`ACEITE_COM_RESSALVA`, terminal) — ambos os desfechos testados
  separadamente, com o evento correspondente (`OrcamentoValidado` /
  `OrcamentoValidadoComRessalva`) verificado por tipo e payload.
- Isolamento entre orçamentos: um caso dedicado prova que um orçamento em
  `PENDENTE_REVISAO_HUMANA` não impede um segundo orçamento consistente de
  ser validado no mesmo repositório em memória — "sem bloquear o
  processamento de outros orçamentos".
- Caso extra: decisão humana sobre orçamento inexistente rejeitada
  (`OrcamentoValidacaoNaoEncontradoError`), mesma condição que o controller
  T036 deverá mapear para 404 — nenhum evento publicado.

Nenhuma asserção foi enfraquecida para passar. Nenhum defeito de produção
encontrado.

## 3. Requisitos cobertos e não cobertos
Cobertos (critério de aceite T033 / US2, spec.md):
- inconsistência conhecida → evento de exceção explícito com regra
  específica;
- status de pendência visível durante a espera;
- decisão humana explícita é o único caminho para validado (correção ou
  aceite com ressalva);
- correção que não resolve permanece pendente, nunca autoaprova;
- orçamentos são independentes entre si (um pendente não bloqueia outro).

Não coberto / fora do escopo desta task, não lacuna:
- Controller HTTP `POST .../decisao-humana` (T036) e caso de uso
  `RegistrarDecisaoHumanaValidacao` (T035) em produção — ainda não
  implementados; contrato HTTP já coberto por `decisao-humana.contract.test.ts`
  (T032, mockado). Este integration test (T033) valida a orquestração de
  domínio/application que T035 deverá empacotar; reteste obrigatório quando
  T035/T036 forem implementados, para confirmar que o caso de uso real
  reproduz exatamente esta orquestração.
- Categorização por IA (US3, T038-T045) — fora de escopo de US2.

## 4. Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/validacao --reporter=default`
  → 29 arquivos passaram, 3 skipped (integração Postgres real, sem
  `DATABASE_URL` local, `describe.skipIf`, padrão pré-existente). Total: 159
  passed, 15 skipped, 0 falhas.
- `npx vitest run tests/bounded-contexts/validacao/application/registrar-decisao-humana-validacao.integration.test.ts --coverage --coverage.include="src/bounded-contexts/validacao/**" --reporter=default`
  → cobertura dos arquivos de produção exercitados por este teste isolado
  (ver seção 7).
- `npx tsc --noEmit -p .` → sem erros.
- `npx eslint tests/bounded-contexts/validacao/application/registrar-decisao-humana-validacao.integration.test.ts`
  → sem achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest, conhecida
  — `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Integração (Application + Domain, sem I/O real, fakes em memória): 5 casos
  novos, arquivo `registrar-decisao-humana-validacao.integration.test.ts`.
- Regressão do BC completo (pré-existente, não alterada por esta task): 154
  testes adicionais (159 − 5), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T033, arquivo novo): 5
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 159 passed, 15 skipped, 0 falhas

## 7. Cobertura inicial e final
Cobertura v8 dos arquivos de produção exercitados, medida isoladamente com
os 5 testes do arquivo novo (sem baseline prévio registrado para esta
task — primeira medição pontual):
- `application/use-cases/validar-orcamento.ts`: 85.71% stmts / 50% branch
- `application/use-cases/consultar-status-validacao.ts`: 95.23% stmts / 75% branch
- `domain/orcamento-validacao.aggregate.ts`: 78.78% stmts / 75% branch
- `domain/regras-consistencia.ts`: 60% stmts / 33.33% branch (regras não
  exercitadas por este teste — `validarPrecoDentroDaFaixa`/`validarPrazoCoerente`
  em ramos que não disparam no cenário de CNPJ inválido — já cobertas por
  `regras-consistencia.test.ts`, unit test dedicado; sem gap novo introduzido)

Não havia coverage-baseline.md registrado nesta spec para T033. O teste
novo soma cobertura sem remover nem enfraquecer nenhuma medição existente.
Nenhum threshold reduzido, nenhum arquivo excluído da medição.

## 8. Allure
Não gerado nesta execução: `pnpm test` (reporter Allure do projeto) está
ambientalmente quebrado (`project_allure_vitest_incompat`), condição
pré-existente, não introduzida por T033. Execução e evidência usam
`vitest run --reporter=default` com output completo capturado acima; sem
dados sensíveis — os únicos dados usados no teste são identificadores
sintéticos de regra de negócio (`CNPJ_INVALIDO`), CNPJs de teste (formato
válido/inválido, sem correspondência a empresa real) e UUIDs sintéticos.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- `RegistrarDecisaoHumanaValidacao` (T035) e o controller HTTP (T036) ainda
  não existem em produção — a orquestração real precisa ser retestada
  quando implementada, para confirmar que reproduz exatamente o
  comportamento validado aqui via `processarDecisaoHumana` (função de
  teste).
- Divergência de rastreamento: T034 ("completar `ValidarOrcamento` para o
  caminho de falha") ainda aparece `[ ]` em `tasks.md`, mas o código de
  produção correspondente já está implementado e testado (publica
  `OrcamentoInconsistenciaDetectada`). Recomendo ao dev-back-end/Tech Lead
  atualizar `tasks.md` para refletir o estado real — não é ação de QA.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- Testes de integração com Postgres real (3, em outros arquivos do BC)
  skipped nesta execução por ausência de `DATABASE_URL` local — não
  relacionado a T033 (repositório em memória usado no teste novo).

## 12. Parecer final
APROVADO PELO QA
