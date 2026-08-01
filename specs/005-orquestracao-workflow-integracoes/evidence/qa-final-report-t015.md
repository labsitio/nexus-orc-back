# QA Final Report — T015 (PR #522) — Schema Drizzle decisoes_workflow/historico + migração

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- Issue: #221
- PR: #522 (draft, labsitio/nexus-orc-back)
- Branch: feat/005-t015-schema-decisoes-workflow
- Commit testado: e13291f
- Worktree: C:\Users\jonas\ai\projects\nexus-orc-back-wt-005c
- Primeira validação (não é reteste de BUG).
- `backend-reviewer` já havia aprovado (APPROVE, sem achados) o diff completo antes deste handoff.

## Resumo executivo
Task Infrastructure (Foundational, não US1/US2/US3): evolui o baseline T002 do schema Drizzle das
tabelas `decisoes_workflow` (estado atual do agregado `DecisaoWorkflow`) e
`decisoes_workflow_historico` (append-only) + gera a migração `drizzle/0015_decisoes_workflow_completo.sql`.
`decisoes_workflow` ganha `status` (text + CHECK contra `STATUS_DECISAO_WORKFLOW`) e 4 colunas JSONB
(`contexto_classificacao`/`contexto_extracao`/`contexto_validacao`/`decisao_atual`).
`decisoes_workflow_historico` é recriado (DROP+CREATE, justificado no comentário da migração: `bigserial`
não é conversível via `ALTER COLUMN...TYPE`) com PK `bigserial`, FK explicitamente nomeada para
`decisoes_workflow`, CHECK de enum de agente, CHECK de mútua exclusividade `resultado`/`motivo_insucesso`,
índice na FK, e 2 triggers `BEFORE UPDATE`/`BEFORE DELETE` que sempre `RAISE EXCEPTION` (bloqueio
append-only). Reexecutei de forma independente toda a suíte de integração real contra Postgres e a
suíte completa do repositório para confirmar ausência de regressão.

## Requisitos cobertos
Mapeado contra `tasks.md` T015 ("Infrastructure: schema Drizzle das tabelas `decisoes_workflow` (estado
atual, contextos/decisão em colunas JSONB) e `decisoes_workflow_historico` (append-only, sem
UPDATE/DELETE) + migração") e seção Infrastructure do `plan.md` (linha 146: `DrizzleDecisaoWorkflowRepository`
— tabelas com contextos/decisão em JSONB "mesmo racional YAGNI do ADR-004 da spec 002" e histórico
"append-only, nunca UPDATE/DELETE, apenas INSERT"):

1. `decisoes_workflow.status` + CHECK contra os 4 valores de `STATUS_DECISAO_WORKFLOW`
   (`AGUARDANDO_CONTEXTO`/`CONTEXTO_CONSOLIDADO`/`DECIDIDO`/`PENDENTE_REVISAO_HUMANA`) — coberto.
2. Contextos/decisão em JSONB, nulos até registrados — coberto (teste dedicado).
3. `decisoes_workflow_historico` append-only via 2 triggers `RAISE EXCEPTION` — coberto (UPDATE e
   DELETE testados separadamente, verificando a mensagem de erro, não só a rejeição).
4. FK nomeada explicitamente (`decisoes_workflow_historico_decisao_workflow_id_fk`) para não estourar
   o limite NAMEDATALEN (63 bytes) do Postgres e truncar silenciosamente — coberto (teste de FK órfã
   valida o nome exato via regex em `error.cause.message`).
5. CHECK de enum de agente (`ORQUESTRADOR`/`HUMANO`) — coberto.
6. CHECK de mútua exclusividade `resultado`/`motivo_insucesso` (exatamente um dos dois, nunca ambos,
   nunca nenhum) — coberto nos dois sentidos (ambos presentes, nenhum presente).
7. Índice em `decisao_workflow_id` para leitura de histórico por agregado — existência confirmada via
   `pg_indexes`.

Não há critério de aceite de user story (US1/US2/US3) aplicável — task é Foundational/Infrastructure,
validada contra a própria descrição em `tasks.md` e a seção Infrastructure do `plan.md`, ambas
satisfeitas.

## Verificação independente (reexecutada pelo QA, não apenas conferida por relato do dev-back-end)
1. **Migração do zero**: `docker compose up -d postgres` (container `pgvector/pgvector:pg16` novo,
   volume novo) + `DATABASE_URL=postgres://nexo:nexo@localhost:5432/nexo pnpm db:migrate` — aplicou as
   16 migrações (0000–0015) sem erro, saída `✓ migrations applied successfully!`. Confirma idempotência/
   compatibilidade do diff 0015 com a cadeia completa.
2. **Suíte alvo**: `DATABASE_URL=... npx vitest run --reporter=default tests/bounded-contexts/orquestracao/infrastructure`
   — 9/9 testes passed, banco real (não mock), incluindo os 2 testes de trigger (UPDATE e DELETE
   bloqueados com mensagem `append-only`) e os 5 testes de CHECK/FK (nome exato de constraint validado
   via `error.cause.message`, não apenas "rejeitou algo").
3. **Regressão completa**: `DATABASE_URL=... npx vitest run --reporter=default` (sem escopo restrito,
   `pnpm test` puro evitado por incompatibilidade ambiental conhecida com allure-vitest, não relacionada
   a este código) — **121 arquivos de teste, 641 testes, 0 falhas**. Nenhuma quebra em outro BC causada
   pela migração ou pela mudança em `decisao-roteamento.vo.ts`.
4. `docker compose down -v` ao final — ambiente limpo, sem container/volume residual.

## Amostragem adicional de código (além de reexecutar os testes já escritos pelo dev-back-end)
- `decisao-roteamento.vo.ts`: mudança é puramente aditiva (consts `ACOES_ROTEAMENTO`/
  `AGENTES_ORIGEM_DECISAO` derivadas dos `type` já existentes `AcaoRoteamento`/`AgenteOrigemDecisao`),
  sem alteração de comportamento — confirmado por leitura e pela suíte de VOs do BC permanecer 100% verde.
- Migração 0015: DROP+CREATE de `decisoes_workflow_historico` em vez de ALTER — correto e seguro nesta
  fase (BC ainda não está em produção, nenhuma linha gravada), mesmo padrão já usado em
  `0011_validacoes_orcamento_faixas_preco_reais.sql`/`0014_indices_orcamento_completo.sql`.
- `pnpm tsc --noEmit`, eslint e prettier já confirmados limpos pelo dev-back-end; não refeitos aqui por
  não haver indício de regressão de lint/tipo nos arquivos tocados.

## Suítes executadas e comandos
1. `docker compose up -d postgres` — banco novo, healthy.
2. `DATABASE_URL=postgres://nexo:nexo@localhost:5432/nexo pnpm db:migrate` — 0000→0015 aplicadas, PASS.
3. `DATABASE_URL=... npx vitest run --reporter=default tests/bounded-contexts/orquestracao/infrastructure` — 9/9 PASS.
4. `DATABASE_URL=... npx vitest run --reporter=default` (suíte completa) — 121 arquivos / 641 testes, 0 falhas.
5. `docker compose down -v` — limpeza.

## Cobertura inicial e final
Task adiciona apenas definição de schema Drizzle (mapeamento tabela↔objeto, sem lógica de domínio
executável fora do já existente) e SQL de migração (não instrumentável por ferramenta de cobertura
JS/TS). Cobertura comportamental é medida pelos 9 testes de integração contra Postgres real, que
exercitam every CHECK/FK/índice/trigger declarado no schema. Nenhuma lacuna de cobertura estrutural
relevante identificada nos arquivos de produção alterados.

## Allure
Não aplicável — stack de testes do repositório (vitest) não possui adaptador Allure configurado em
nenhuma spec anterior desta base de código (mesma constatação dos relatórios de QA anteriores desta
spec, ex. T010/T012/T014). Validação registrada via output determinístico do vitest, reproduzível pelos
comandos acima.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
1. `DrizzleDecisaoWorkflowRepository` (implementação do repositório sobre este schema) ainda não existe
   — fora do escopo desta task (T015 é só schema+migração), sem impacto no gate atual.
2. Fidelidade do shape JSONB de `resultado`/`decisao_atual` ao VO `DecisaoRoteamento` real só será
   verificável quando a Infrastructure implementar a tradução linha↔agregado (task futura) — schema
   atual corretamente não impõe estrutura interna ao JSONB (mesmo racional YAGNI do ADR-004 citado no
   plan.md), consistente com o padrão já usado nas specs 002/003/004.

## Limitações do ambiente
Nenhuma. Docker disponível, suíte de Postgres real executada sem problema, sem dependência externa
indisponível.

## Parecer final
**APROVADO PELO QA**

Migração 0000–0015 aplica limpo do zero. CHECKs, FK nomeada, índice e triggers append-only bloqueiam
exatamente o que devem bloquear, confirmado por reexecução independente da suíte de integração real (9/9)
com verificação de nome exato de constraint/mensagem de erro, não apenas rejeição genérica. Suíte
completa do repositório (121 arquivos / 641 testes) sem regressão. Schema bate com a descrição de T015
em `tasks.md` e com a seção Infrastructure do `plan.md`. Sem defeito de produção a reportar. `tasks.md`
já reflete T015 concluída (linha 41, marcada `[x]`).
