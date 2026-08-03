# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T035

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #571
- Branch: `feat/003-t035-registrar-decisao-humana`
- Commit testado: `8719230`
- Task: T035 [US2] Application: caso de uso `RegistrarDecisaoHumanaValidacao`
  no BC `validacao` (issue #145)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
Arquivo de produção novo:
`src/bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.ts`.
Orquestra: busca o agregado por `orcamentoId`, delega a transição a
`OrcamentoValidacao.registrarDecisaoHumana` (guarda de status
`PENDENTE_REVISAO_HUMANA` e regra "nunca autoaprova" residem no agregado,
`orcamento-validacao.aggregate.ts`, não duplicadas aqui), persiste e publica
o evento correspondente ao status resultante — nenhum evento quando o status
final permanece `PENDENTE_REVISAO_HUMANA`.

Teste (já escrito pelo dev, revisado e mantido sem alteração — cobertura já
adequada): 5 casos cobrindo os 5 critérios de aceite pedidos:
1. `CORRECAO_APLICADA` sem inconsistência remanescente → `VALIDADO` +
   publica `OrcamentoValidado`.
2. `ACEITE_COM_RESSALVA` → `VALIDADO_COM_RESSALVA` + publica
   `OrcamentoValidadoComRessalva` com as inconsistências remanescentes no
   payload.
3. `CORRECAO_APLICADA` que ainda deixa inconsistência → permanece
   `PENDENTE_REVISAO_HUMANA`, zero eventos publicados (nunca autoaprova,
   Princípio IV da constituição).
4. Agregado fora de `PENDENTE_REVISAO_HUMANA` → propaga
   `TransicaoInvalidaValidacaoError` do agregado, zero eventos publicados.
5. `orcamentoId` inexistente no repositório →
   `OrcamentoValidacaoNaoEncontradoError`.

Inspecionei `orcamento-validacao.aggregate.ts` linha a linha: a guarda de
status e a regra de nunca autoaprovar estão implementadas em
`registrarDecisaoHumana`/`aplicarResultadoAvaliacao` no agregado, não no caso
de uso — o caso de uso só orquestra e nunca decide a regra de negócio, como a
doc do próprio arquivo declara. Nenhuma asserção foi enfraquecida.

Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
Cobertos (todos os critérios de aceite pedidos para esta task):
- transição só a partir de `PENDENTE_REVISAO_HUMANA`, erro de domínio fora
  disso;
- `CORRECAO_APLICADA` sem inconsistência → publica `OrcamentoValidado`;
- `CORRECAO_APLICADA` com inconsistência remanescente → permanece em revisão
  humana, zero evento;
- `ACEITE_COM_RESSALVA` → publica `OrcamentoValidadoComRessalva` com as
  inconsistências no payload;
- `orcamentoId` inexistente → `OrcamentoValidacaoNaoEncontradoError`.

Não coberto / fora do escopo desta task, não lacuna:
- T036 (endpoint REST `POST .../validacao/decisao-humana`) — já tem contract
  test próprio (`tests/bounded-contexts/validacao/contract/decisao-humana.contract.test.ts`,
  11 testes, pré-existente/paralelo, fora do diff desta PR).
- Persistência real (Drizzle/Postgres) do repositório — testada em
  `drizzle-orcamento-validacao.repository.test.ts`, `skipIf` por ausência de
  `DATABASE_URL` local, condição pré-existente não introduzida por T035.

## 4. Suítes executadas e comandos
Ambiente: `source ~/.nvm/nvm.sh && nvm use 24` (Node do sistema é v16,
incompatível). `node_modules` symlinkado do repo principal, sem
`npm install`.

- `npx vitest run tests/bounded-contexts/validacao --reporter=verbose`
  → 29 arquivos passaram (159 testes), 3 arquivos skipped (15 testes,
  integração Postgres real sem `DATABASE_URL` local, `describe.skipIf`,
  padrão pré-existente). Zero falhas.
- `npx tsc --noEmit -p .` → sem erros.
- `npx eslint src/bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.ts tests/bounded-contexts/validacao/application/registrar-decisao-humana-validacao.test.ts`
  → sem achados.
- `npx vitest run tests/bounded-contexts/validacao --coverage --coverage.include='src/bounded-contexts/validacao/application/use-cases/**'`
  → cobertura do diretório do caso de uso (ver seção 7).

## 5. Quantidade de testes por tipo
- Unitário (Application, fakes in-memory de repositório e publisher): 5 no
  arquivo desta task.
- Regressão do BC `validacao` completo (pré-existente, não alterada por esta
  task): 154 testes adicionais (159 − 5), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T035): 5
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 159 passed, 15 skipped (integração Postgres,
  ambiental), 0 falhas

## 7. Cobertura inicial e final
Cobertura de `src/bounded-contexts/validacao/application/use-cases/**`
(inclui `registrar-decisao-humana-validacao.ts` e os demais casos de uso já
existentes do diretório, medida com a suíte completa do BC):
- Statements: 100% (49/49)
- Branches: 100% (22/22)
- Functions: 100% (12/12)
- Lines: 100% (48/48)

Não havia coverage-baseline.md registrado nesta spec antes desta task; T035
adiciona 1 caso de uso + 5 testes sem remover cobertura existente. Threshold
do projeto não foi reduzido; nenhum arquivo foi excluído da medição para
inflar percentual.

## 8. Allure
Não gerado nesta execução: `pnpm test` (reporter Allure do projeto) está
ambientalmente quebrado (`project_allure_vitest_incompat`), condição
pré-existente, não introduzida por T035. Execução e evidência usam
`vitest run --reporter=verbose` com output completo capturado acima; sem
dados sensíveis — os únicos dados usados no teste são identificadores
sintéticos de regra de negócio (`PRAZO_INCOERENTE`) e um UUID de teste
(`01890a5d-ac96-774b-bcce-b302099a8057`).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Nenhum introduzido por esta task. Riscos pré-existentes (testes de
  integração Postgres skipped por ambiente local) já registrados em relatórios
  QA anteriores da mesma spec (T029, T014).

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=verbose`.
- Testes de integração com Postgres real (3 arquivos, 15 testes) skipped
  nesta execução por ausência de `DATABASE_URL` local — não relacionado a
  T035 (caso de uso testado com fakes in-memory, sem dependência de banco).

## 12. Parecer final
APROVADO PELO QA
