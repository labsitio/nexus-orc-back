# Coverage Baseline — SPEC 002 (leva T001, T005-T011)

## Contexto
O workflow de CI (`.github/workflows/ci.yml`) executa `pnpm run test`
(`vitest run --passWithNoTests`) sem flag `--coverage`. Não há step de
cobertura nem threshold configurado no projeto hoje — gap pré-existente
(já presente antes desta PR, nas specs 001), não introduzido por esta leva.

## Execução local de cobertura (`vitest run --coverage`)
Tentativa de gerar métricas de cobertura localmente neste worktree falhou por
problema ambiental do reporter `allure-vitest` ("Vitest failed to find the
runner"), reproduzido de forma consistente mesmo com pool alternativo e cache
limpo — não relacionado ao código desta PR (mesma falha ocorre também nas
suítes pré-existentes do BC Ingestão & Identificação). Ver `test-plan.md` §
Limitações.

## Baseline qualitativa (via CI + leitura de código)
Todos os arquivos de produção desta leva (`domain/**`) têm pelo menos 1 arquivo
de teste correspondente 1:1, exceto:
- `domain/errors/erro-dominio.ts` — classe base de erro, exercitada
  indiretamente por todo teste que espera um subtipo (`CampoExtraidoInvalidoError`,
  `ReferenciaImutavelError`, `TransicaoInvalidaExtracaoError`, etc.), sem teste
  próprio dedicado — aceitável, é a classe abstrata, sem lógica própria.
- `domain/gateways/*.ts` e `domain/repositories/*.ts` — interfaces TypeScript
  puras (T011), sem corpo de implementação; não geram bytecode executável,
  logo não aparecem em cobertura de statements/branches. Classificação:
  código inviável de medir cobertura por natureza (apenas contrato de tipos).

## Ação necessária
Propor, em PR de QA dedicado ou junto ao PR de Infrastructure (T012+), a adição
de `coverage.thresholds` no `vitest.config.ts` e de um step `--coverage` no CI,
já que a partir de Infrastructure/Application o volume de lógica com branches
relevantes aumenta. Não é bloqueante para esta leva (Domain puro, VOs e
agregado com invariantes estruturais, já 100% exercitados por teste segundo
o log de CI).
