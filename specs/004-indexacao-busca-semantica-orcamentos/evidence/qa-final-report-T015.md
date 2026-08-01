# QA Final Report — T015 (PR #514)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T015 — Infrastructure: schema Drizzle completo `indices_orcamento`/`indices_orcamento_historico` + migração
- Branch: `feat/004-t015-schema-indices-orcamento`
- PR: #514
- Commit: 96972a5e3b433040a82edf6ebed353e31df5ebd9
- Tipo de validação: primeira validação (não é reteste)
- Backend-reviewer: APPROVE, sem achados

## Resumo executivo
Task evolui o baseline T003/0009 (tabelas quase vazias, só `id`+`embedding`) para o mapeamento real do
agregado `IndiceOrcamento`: `estado` (CHECK enum), `conteudo_indexavel` (JSONB), `origem_validacao`
(CHECK enum) em `indices_orcamento`; `indices_orcamento_historico` recriado como append-only real
(`bigserial`, FK nomeada explicitamente, CHECK de `resultado`, índice em `indice_orcamento_id`,
triggers `RAISE EXCEPTION` bloqueando UPDATE/DELETE). Inclui 3 exports não funcionais em Domain
(`ESTADOS_INDEXACAO`, `RESULTADOS_TENTATIVA_INDEXACAO`, `VALORES_ORIGEM_VALIDACAO`) para o schema
gerar os CHECKs a partir da mesma fonte de verdade do enum de Domain, em vez de duplicar string
literal — mudança puramente aditiva (`export const` novo + `type` derivado de `typeof`), sem quebra
de assinatura pré-existente. Nenhum defeito de produção encontrado.

## Verificação migração vs. banco real
- Migração aplicada em banco do zero (container Postgres recriado via `docker compose up -d
  postgres`, aguardado `healthy`, `DATABASE_URL=... pnpm run db:migrate`): aplicou limpo, sequência
  0000→0014 sem erro, `drizzle/meta/_journal.json` consistente com os arquivos de migração em disco.
- Teste de integração dedicado (`indice-orcamento-completo.schema.test.ts`, Postgres real, não mock)
  confirma: os 3 CHECKs, a FK nomeada, o índice em `indice_orcamento_id` e os 2 triggers existem
  exatamente com os nomes do schema; embedding permanece `NULL` enquanto `estado != INDEXADO`; CHECK
  de `estado`/`origem_validacao`/`resultado` rejeita valor fora do enum; FK rejeita histórico órfão;
  trigger bloqueia UPDATE e DELETE em `indices_orcamento_historico` (rollback em savepoint, banco
  compartilhado permanece limpo).
- Valores dos CHECKs batem exatamente com os enums de Domain: `ESTADOS_INDEXACAO` = `PENDENTE |
  INDEXADO | FALHA_INDEXACAO`, `VALORES_ORIGEM_VALIDACAO` = `VALIDADO | VALIDADO_COM_RESSALVA`,
  `RESULTADOS_TENTATIVA_INDEXACAO` = `INDEXADO | FALHA_TECNICA` — sem divergência entre schema SQL e
  tipo TypeScript.
- Recriação de `indices_orcamento_historico` via DROP+CREATE (em vez de `ALTER COLUMN ... TYPE
  bigserial`, inválido em Postgres) é segura neste momento do projeto: tabela baseline (T003) nunca
  recebeu escrita em produção (BC ainda não está em produção) — comentário no SQL documenta a
  decisão, mesmo padrão já usado em `0011_validacoes_orcamento_faixas_preco_reais.sql`.

## Requisitos cobertos e não cobertos
Cobertos por esta task: estrutura completa das 2 tabelas, CHECKs, FK, índice HNSW (herdado do
baseline, também coberto pelo teste próprio `indice-orcamento.schema.test.ts`), append-only real via
trigger. Não cobertos por esta task (fora de escopo, tasks futuras): `DrizzlePgvectorIndiceOrcamentoRepository`
(T016, tradução linha↔agregado, upsert idempotente, query vetorial) e o caso de uso que persiste de
fato via este schema (T028-T030). T015 é puramente estrutural — sem endpoint HTTP nem caso de uso
end-to-end, conforme o próprio escopo da task.

## Suítes executadas e comandos
- `docker compose up -d postgres` (container recriado do zero) + aguardar `healthy`.
- `DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo pnpm run db:migrate` — aplicou limpo,
  sem erro.
- `DATABASE_URL=postgresql://nexo:nexo@localhost:5432/nexo pnpm exec vitest run --reporter=default`
  — 118 arquivos, 617 testes, todos passando (inclui os 8 testes novos de T015 e os 3 testes já
  existentes do baseline em `indice-orcamento.schema.test.ts`).
- `pnpm exec tsc --noEmit` — sem erro.
- `pnpm run lint` (eslint .) — sem apontamento.
- `pnpm run test` (reporter allure-vitest padrão) — reproduzido o erro relatado pelo dev-back-end:
  `Error: Vitest failed to find the runner` em `allure-vitest@3.10.2` (`node_modules/.../allure-vitest/src/setup.ts:15`),
  afetando uniformemente os 118 arquivos de teste do repositório inteiro, sem relação com o BC
  `busca-indexacao` ou com o diff desta task. Confirmado: PR não altera `package.json`,
  `pnpm-lock.yaml` nem `vitest.config.ts` (`git diff origin/main...HEAD` vazio nesses 3 arquivos).
  Classificação: problema de ambiente pré-existente (incompatibilidade `allure-vitest 3.10.2` x
  `vitest 4.1.10` nesta máquina), não introduzido por T015 — não bloqueia o gate desta task, mas
  registrado como risco residual de CI/ambiente para acompanhamento de DevOps.

## Quantidade de testes por tipo
- Integração (schema, Postgres real): 8 novos (T015) + 3 já existentes do baseline T003 = 11 nesta
  área do BC.
- Suíte completa do repositório: 617 testes, 118 arquivos, todos unit/integration (sem e2e nesta
  spec ainda).

## Resultado
- Aprovados: 617/617 (100%).
- Falhos: 0.
- Ignorados: 0 (teste de schema não é skipado porque `DATABASE_URL` foi fornecido).
- Instáveis: 0 (execução determinística, transação por teste com ROLLBACK).

## Cobertura inicial e final
- Cobertura medida na mesma execução (`--coverage`), pós-alteração: 96.1% statements, 93.49%
  branches, 92.29% functions, 96.31% lines (repositório inteiro).
- Arquivo de schema `indice-orcamento.schema.ts`: 60% statements/lines, 100% branches, 0% functions —
  consistente com o padrão já estabelecido nos demais arquivos de schema do repositório
  (`validacao-orcamento.schema.ts` 55.55%, `decisao-workflow.schema.ts` 0%, `extracao-orcamento.schema.ts`
  50%): schema é declaração de tabela (chamadas de função do Drizzle Kit no nível do módulo), não
  lógica de domínio com branch relevante — a linha não coberta é o helper local `emValoresValidos`,
  exercitado indiretamente pelas 3 constraints, sem branch de decisão de negócio a testar.
  Classificação: código de infraestrutura declarativa, risco já mitigado pelo teste de integração
  contra Postgres real que valida o efeito da declaração (CHECK/FK/índice/trigger existem e
  funcionam), não pela cobertura de linha do arquivo declarativo em si.
- Nenhum threshold de cobertura configurado no `vitest.config.ts` foi reduzido por esta task.

## Allure
- `allure-results/` não gerado nesta execução devido ao erro de ambiente pré-existente descrito acima
  (reporter allure-vitest). Evidência de execução coletada via `--reporter=default` (log completo:
  118 arquivos, 617 testes passando, anexado ao histórico desta validação).
- Recomendação: DevOps investigar compatibilidade `allure-vitest@3.10.2` x `vitest@4.1.10` no
  ambiente de CI/local — item de ambiente, fora da autoridade do QA corrigir (não é código de
  produção nem teste desta task).

## Bugs por severidade e status
Nenhum bug encontrado. Nenhum `specs/004-indexacao-busca-semantica-orcamentos/bugs/BUG-XXX.md`
criado.

## Riscos residuais
- Erro do reporter allure-vitest (ambiente, não desta task) — ver seção Allure.
- Comportamento de persistência real (upsert idempotente, tradução linha↔agregado, query vetorial)
  ainda não verificável nesta task — fica para T016.

## Limitações do ambiente
Nenhuma limitação bloqueante nesta task: Postgres real disponível via docker-compose, migração
aplicada do zero com sucesso, suíte completa executada contra banco real.

## Parecer final
APROVADO PELO QA
