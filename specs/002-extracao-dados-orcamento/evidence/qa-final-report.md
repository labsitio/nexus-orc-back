# QA Final Report — SPEC 002-extracao-dados-orcamento

## SPEC_ID e versão testada
SPEC_ID: 002-extracao-dados-orcamento
PR #409, branch `feat/002-extracao`, commit `82bb32b152fc2bee2a3133414d4aa0ae0ec9c1db`

## Resumo executivo
Primeira validação da fundação de Domain do novo BC Extração (T001, T005-T011):
VOs, agregado `ExtracaoOrcamento`, 3 Domain Events e interfaces de
repositório/gateway. Domain puro, sem framework/ORM/AWS SDK. Suíte de 56
testes unitários já existente cobre os 4 critérios de aceite testáveis nesta
fase, todos verdes no CI. Typecheck e lint limpos. 1 achado de baixa
severidade (encapsulamento) registrado, não bloqueante.

## Requisitos cobertos e não cobertos
Cobertos nesta leva (ver `qa/traceability-matrix.md`):
- Nunca inventar/estimar valor de campo obrigatório (`CampoExtraido<T>`).
- Campo obrigatório sem confiança → escalonamento direto a
  `PENDENTE_REVISAO_HUMANA`, nunca `EXTRAIDO` parcial.
- Imutabilidade de `referenciaClassificacao`/`referenciaBrutaS3` após criação.
- Confirmação humana só válida a partir de `PENDENTE_REVISAO_HUMANA`,
  histórico append-only.

Não cobertos nesta leva (fora de escopo, dependem de PRs seguintes):
- p95 de 5 minutos ponta a ponta (depende de Infrastructure/Application).
- Consulta de status refletindo "extraído"/pendência (depende de endpoint REST).
- Uso efetivo do MarkItDown como conversor padrão (interface definida,
  implementação pendente).

## Suítes executadas e comandos
`pnpm run test` (`vitest run --passWithNoTests`), Node 24 — mesmo comando do
CI (`.github/workflows/ci.yml`).

## Quantidade de testes por tipo
56 testes unitários de Domain no BC Extração (100% dos testes desta leva;
sem integração/contrato/E2E nesta fase, corretamente fora de escopo).

## Resultado: aprovados, falhos, ignorados e instáveis
Via CI (run 30571782437, mesmo commit): **130 testes totais no repositório,
130 aprovados, 0 falhos, 0 ignorados, 0 instáveis** — inclui os 56 do BC
Extração e os 74 pré-existentes do BC Ingestão & Identificação (sem
regressão). Execução local neste worktree não pôde ser completada por
problema ambiental do reporter Allure, não relacionado ao código desta PR
(mesma falha ocorre em suítes pré-existentes) — ver `qa/test-plan.md` §
Limitações e `qa/test-execution-report.md`.

## Cobertura inicial e final
Sem step de `--coverage` configurado no CI (gap pré-existente do projeto, não
introduzido por esta PR). Baseline qualitativa em `qa/coverage-baseline.md`:
todo arquivo de produção desta leva tem teste 1:1 correspondente, exceto
classe de erro base (sem lógica própria) e interfaces puras de gateway/
repositório (sem corpo executável, não medíveis por natureza).

## Local do allure-results e do relatório Allure
`allure-results/` gerado via `pnpm run test` (reporter já configurado em
`vitest.config.ts`, herdado da spec 001). Não publicado como artifact do CI
hoje — recomendação registrada em `qa/allure-report.md` para DevOps.

## Bugs por severidade e status
- BAIXA (1): BUG-001 — `historico` getter sem cópia defensiva. ABERTO,
  não bloqueante.
- MÉDIA/ALTA/CRÍTICA: nenhum.

## Riscos residuais
- BUG-001 (baixa severidade, ver acima).
- Ausência de threshold/step de cobertura no CI (pré-existente, não desta PR).
- Reporter Allure com falha ambiental local não reproduzida no CI — monitorar
  se volta a ocorrer em CI antes de assumir que é puramente local.

## Limitações do ambiente
Execução local neste worktree bloqueada por falha do `allure-vitest` ao
inicializar o runner do Vitest, não reproduzida no CI com o mesmo commit —
parecer baseado na execução de CI (run 30571782437), reprodutível e auditável
publicamente, mais leitura completa do código de produção e dos testes.

## Parecer final
**APROVADO COM RESSALVAS**

Ressalva: BUG-001 (severidade BAIXA, getter `historico` sem cópia defensiva) —
não bloqueia a entrega desta leva (Domain puro, sem consumidor externo ainda),
mas deve ser corrigido antes ou junto de T012+ (Infrastructure), quando
`historico` passa a ser lido por código fora do agregado.
