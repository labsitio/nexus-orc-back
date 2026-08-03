# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T025

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #544
- Branch: `003-t025-validador-queue-handler`
- Commit testado: `b7682e1`
- Task: T025 [US1] Interface: handler Lambda consumidor SQS de `validador-queue`, invocando `ValidarOrcamento` (issue #135)
- Primeira validação (sem BUG-XXX prévio)
- Revisão prévia de código: backend-reviewer, APPROVE WITH NITS (1 NIT não
  bloqueante: duplicação de tipos SQS entre handlers — aceito, mesmo padrão
  já usado em `extracao/interface/events/extrator-queue.handler.ts`)

## 2. Resumo executivo
`criarValidadorQueueHandler` consome o `SqsEvent` de `validador-queue`,
extrai só `detail.orcamentoId` do envelope EventBridge para correlação de
log (`logger.child`), repassa `detail` bruto para
`ValidarOrcamento.executar` (T024, já mergeado) e reporta falha item-a-item
via `batchItemFailures` — mensagem malformada ou erro isolado nunca bloqueia
as demais do lote (Princípio IV, exceção nunca silenciosa).

Confirmado por leitura do código de produção de T024
(`validar-orcamento.ts`): quem traduz o payload bruto de
`detail`/`OrcamentoExtraidoEventACL` é o caso de uso, não o handler — o
handler desta task deliberadamente não antecipa o shape completo do evento
upstream, coerente com o que a issue #135 e os comentários do próprio
arquivo descrevem. `OrcamentoExtraidoEventACL` (T015) é dependência
separada, ainda pendente, fora do escopo desta task.

Nenhum defeito de produção encontrado. Nenhum enfraquecimento de asserção
foi necessário. Nenhum teste adicional foi necessário além dos 7 já
entregues pelo dev-back-end — cobrem os riscos prioritários do escopo desta
task (repasse do payload por mensagem, isolamento de falha por item,
envelope inválido, JSON inválido, correlação de log por
`orcamentoId`/`messageId`, log de erro sem `orcamentoId` quando o envelope é
inválido, idempotência delegada ao caso de uso).

## 3. Requisitos cobertos e não cobertos
Cobertos (critério de aceite spec.md/plan.md, Princípio IV — "exceção nunca
é silenciosa"):
- cada mensagem do lote invoca `ValidarOrcamento.executar` com `detail`
  bruto, na ordem das mensagens;
- 1 mensagem falha (erro do caso de uso, envelope inválido, JSON inválido)
  → só o `itemIdentifier` daquela mensagem entra em `batchItemFailures`,
  demais mensagens do lote seguem processadas normalmente;
- toda falha é logada (`logger.error`) antes de retornar como batch item
  failure — nenhuma exceção é engolida sem log nem sem retorno explícito;
- correlação de log por `orcamentoId` e `messageId` em todo log emitido
  para uma mensagem válida; log de erro correlacionado por `messageId`
  mesmo quando `orcamentoId` não pôde ser extraído (envelope inválido);
- entrega duplicada (at-least-once): handler não trata especialmente,
  delega idempotência ao caso de uso (coberto por T024, reexecutado aqui
  como regressão de integração handler→caso de uso via teste dedicado).

Não coberto / fora do escopo desta task, não lacuna:
- tradução do shape completo de `detail` (`OrcamentoExtraidoEventACL`,
  T015) — dependência separada, ainda pendente;
- endpoint de status (T026/T027) e IAM role dedicada (T028) — downstream,
  tasks distintas.

Gap de cobertura estrutural identificado (não requisito, ver seção 7): o
branch `detail !== null` do type guard `ehEventBridgeEnvelope` (linha 41)
não tem teste dedicado para `detail: null` explícito (só para `detail`
ausente/tipo errado) — risco baixo, mesmo efeito prático (mensagem
rejeitada como envelope inválido), registrado como risco residual.

## 4. Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/validacao/interface/validador-queue.handler.test.ts --coverage --coverage.include='src/bounded-contexts/validacao/interface/events/validador-queue.handler.ts' --reporter=default`
  → 1 arquivo, 7 testes, todos passando.
- `npx vitest run tests/bounded-contexts/validacao --reporter=default` (regressão do BC completo)
  → 23 suites passando, 3 skipped (integração Postgres real, sem
  `DATABASE_URL` local — `describe.skipIf`, padrão já usado em tasks
  anteriores), 118 testes passando, 15 skipped, 0 falhas.
- `npx tsc --noEmit -p .` → sem erros.
- `npx eslint src/bounded-contexts/validacao/interface/events/validador-queue.handler.ts tests/bounded-contexts/validacao/interface/validador-queue.handler.test.ts` → sem achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest, conhecida
  — `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Unitário (Interface, com fake de `ValidarOrcamento` e logger pino real
  gravando em memória): 7 — repasse do `detail` por mensagem; isolamento de
  falha por item (batch item failure); envelope EventBridge inválido; JSON
  inválido; correlação de log por `orcamentoId`/`messageId`; log de erro
  sem `orcamentoId`; idempotência delegada ao caso de uso. Nenhum teste
  adicional criado pelo QA — os 7 já entregues são suficientes e corretos
  para o escopo de T025.
- Regressão do BC completo (pré-existente, não alterada por esta task): 118
  testes, reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T025): 7
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 118 passed, 15 skipped (26 suites), 0 falhas

## 7. Cobertura inicial e final
Não havia baseline anterior (arquivo novo nesta task). Medida via
`vitest run --coverage` (v8) restrita a `validador-queue.handler.ts`:
- Statements: 95% (19/20)
- Branches: 90% (9/10)
- Functions: 100% (3/3)
- Lines: 95% (19/20)

Linha não coberta: 41 (`detail !== null` dentro do type guard
`ehEventBridgeEnvelope` — caso `detail: null` explícito no envelope, não
exercitado pelos 7 testes entregues; efeito prático idêntico ao já coberto
"`detail` ausente/tipo errado" — mensagem rejeitada como envelope
inválido). Risco baixo, registrado como risco residual, não bloqueante.
Threshold de cobertura do projeto não foi reduzido; nenhum arquivo foi
excluído da medição para inflar percentual.

## 8. Allure
Não configurado nesta execução: `pnpm test` (que dispara o reporter Allure
do projeto) está ambientalmente quebrado
(`project_allure_vitest_incompat`), condição pré-existente, não introduzida
por T025. Execução e evidência desta validação usam
`vitest run --reporter=default` com output completo capturado acima; sem
dados sensíveis — os únicos dados usados nos testes são um CNPJ sintético
(`11222333000181`) e IDs de orçamento fictícios (`id-1`, `id-2`,
`id-falha`, `id-ok`, `id-ja-processado`).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Branch `detail !== null` do type guard sem teste dedicado (ver seção 7) —
  baixo risco, mesmo efeito observável do caso já coberto.
- `OrcamentoExtraidoEventACL` (T015) ainda pendente: até ser implementada,
  `ValidarOrcamento.executar` depende dela conforme o próprio código de
  T024 documenta; o handler desta task não antecipa esse shape, portanto
  não há acoplamento indevido a corrigir aqui.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- Testes de integração com Postgres real (15, em outros arquivos do BC)
  foram skipped nesta execução por ausência de `DATABASE_URL` local — não
  relacionado a T025 (handler não tem dependência de banco).

## 12. Parecer final
APROVADO PELO QA
