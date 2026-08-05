# QA Final Report — T030 (issue #190, PR #660)

## SPEC_ID e versão testada
004-indexacao-busca-semantica-orcamentos — commit `e26d5c0`, branch `feat/190-handler-sqs-indexador-queue`. Primeira validação (não é reteste de BUG). `backend-reviewer` já havia aprovado com um NIT (MENOR), corrigido no próprio commit testado.

## Resumo executivo
Handler Lambda consumidor de `indexador-queue` (T030). Traduz o envelope EventBridge via `OrcamentoValidadoEventACL` (já aprovada em T014/T018, gate ADR-008/#632 resolvido) e invoca `IndexarOrcamento.executar` (T029, já aprovado). Os 9 casos unitários já escritos pelo dev-back-end cobrem os 4 critérios de aceite do handoff: isolamento entre itens do batch, falha nunca silenciosa, `tenantId` nunca inventado/inferido, e correlação de log. `tsc`, `eslint` e a suíte do BC completo passam sem falha. Nenhum defeito de produção encontrado. Cobertura do arquivo alvo: 95.83% statements/lines, 90.9% branches, 100% functions — único ramo não coberto é defensivo e de risco equivalente a um ramo já exercitado (ver seção de cobertura).

## Requisitos cobertos e não cobertos
1. Falha de indexação nunca é silenciosa (Princípio IV) — COBERTO. Todo erro (parse inválido, envelope malformado, `tenantId` ausente, falha de `executar`) vira log estruturado (`logger.error`) e batch item failure; nenhum `catch` vazio.
2. Falha de indexação nunca bloqueia o pipeline nem as demais mensagens do lote (Princípio II) — COBERTO. Loop `for...of` com `try/catch` por item; teste dedicado comprova que 1 falha não impede o processamento do item seguinte no mesmo lote.
3. `tenantId` nunca inventado/inferido (ADR-008/#632) — COBERTO. Ausência de `tenantId` no envelope é rejeitada pela ACL (`OrcamentoValidadoEventACLInvalidaError`), tratada como qualquer outro erro (batch item failure), nunca com fallback.
4. Correlação de log por `orcamentoId`/`tenantId`/`messageId`, inclusive quando a tradução falha antes de extrair `orcamentoId`/`tenantId` — COBERTO (2 testes dedicados, incluindo o cenário do NIT corrigido pelo `backend-reviewer`: `tenantId` presente no log de erro mesmo em falha pós-tradução).
5. Idempotência sob redelivery at-least-once — COBERTO por design do caso de uso (T029, já validado); handler não precisa de tratamento especial, teste confirma ausência de batch item failure em reentrega.
6. Critério de aceite "pesquisável em até 5 min p95" (spec.md) — fora do escopo funcional deste handler (é medido no teste de integração `indexar-orcamento.integration.test.ts`, T025/T029); este handler apenas dispara o caso de uso já medido, nenhuma lógica de latência própria a testar aqui.
7. Composição de produção (Lambda real, IAM, wiring do composition-root) — fora de escopo desta task, fica para #623 (deploy), conforme já registrado em `tasks.md`.

## Suítes executadas e comandos
- `source ~/.nvm/nvm.sh && nvm use` (Node 24.19.0, conforme `.nvmrc`)
- `npx tsc --noEmit` → sem erros.
- `npx eslint .` → sem erros.
- `npx vitest run tests/bounded-contexts/busca-indexacao/` → 24 arquivos, 169 testes passando, 4 arquivos (23 testes) pulados por `describe.skipIf(!DATABASE_URL)` — limitação de ambiente já conhecida (sem Postgres local nesta sessão), não é falha.
- `npx vitest run tests/bounded-contexts/busca-indexacao/interface/indexador-queue.handler.test.ts --coverage --coverage.include='src/bounded-contexts/busca-indexacao/interface/events/indexador-queue.handler.ts'` → 9/9 passando, cobertura isolada do arquivo alvo.

## Quantidade de testes por tipo
Unitário: 9 casos no arquivo alvo (todos já escritos pelo dev-back-end; QA avaliou e considerou suficientes — nenhum caso adicional necessário, ver justificativa na matriz de rastreabilidade).

## Resultado: aprovados, falhos, ignorados e instáveis
Arquivo alvo: 9 aprovados, 0 falhos, 0 ignorados, 0 instáveis.
BC completo (regressão): 169 aprovados, 0 falhos, 23 ignorados (skip por `DATABASE_URL` ausente, pré-existente e não relacionado a T030), 0 instáveis.

## Cobertura inicial e final
Baseline não medida separadamente (task aditiva, arquivo novo — baseline é 0% por definição). Final, isolado no arquivo alvo: 95.83% statements (23/24), 90.9% branches (10/11), 100% functions (4/4), 95.83% lines (23/24). Lacuna: `ehEventBridgeEnvelope` (linha 47) não exercita o ramo `typeof valor !== 'object' || valor === null` quando o JSON parseado é primitivo/array/`null` no nível superior (ex. body `"42"`) — classificado como **código inviável de ganho adicional**: o resultado observável (batch item failure + log de erro) é idêntico ao já coberto pelo teste "envelope EventBridge inválido"; um teste extra apenas duplicaria a asserção sem reduzir risco. Não bloqueante.

## Local do allure-results e do relatório Allure
`allure-results/` na raiz do repositório (gerado automaticamente por `allure-vitest/reporter`, já configurado em `vitest.config.ts` — infraestrutura reaproveitada, nenhuma configuração adicional necessária para este handler). Relatório HTML não gerado nesta rodada (gerar via `allure generate` fica a critério do pipeline/CI); resultados brutos confirmados presentes após a execução da suíte.

## Bugs por severidade e status
Nenhum bug aberto nesta validação.

## Riscos residuais
- Ramo defensivo não coberto em `ehEventBridgeEnvelope` (ver seção de cobertura) — risco equivalente a ramo já testado, não bloqueante.
- Testes de integração real (Postgres/pgvector) permanecem pulados nesta sessão por ausência de `DATABASE_URL` — já cobertos e aprovados em T025/T029, sem relação direta com o parsing/dispatch deste handler.

## Limitações do ambiente
`DATABASE_URL` não configurado nesta sessão (sem Postgres local) — testes de integração real skipados automaticamente, comportamento esperado e já documentado em validações anteriores do mesmo BC (T025, T029, T033).

## Parecer final
APROVADO PELO QA
