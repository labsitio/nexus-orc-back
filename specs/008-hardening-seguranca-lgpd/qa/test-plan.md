# Test Plan — T001-T003 (Phase 1: Setup)

## Escopo
Validação de scaffolding puro (PR #407, branch `feat/008-hardening`, commit
`64ef79c`): pastas `src/platform/conformidade/{domain,application,infrastructure,interface}`
e `src/platform/shared-value-objects/domain/` (T001); schema Drizzle inicial
das 5 tabelas do schema `platform` + migrações (T002); confirmação de
cobertura de lint/tsc sobre `src/platform/**` (T003).

## Fora de escopo
Qualquer VO, agregado, caso de uso, endpoint ou regra de negócio — entram a
partir de T004 (Phase 2/Foundational) em diante. Testes unit de domínio só
fazem sentido a partir de T004-T007.

## Riscos
- Layout de pastas divergir do `plan.md` (Project Structure) e travar tasks
  futuras por caminho inconsistente.
- Schema Drizzle divergir dos atributos descritos em `plan.md` (Domain/
  Infrastructure), gerando retrabalho de migração quando os agregados forem
  implementados.
- Regressão na suíte existente (`tests/bounded-contexts/ingestao-identificacao/**`)
  causada por alteração no barrel `drizzle/schema.ts`.

## Níveis e tipos de teste
Nenhum teste automatizado novo é aplicável (scaffolding sem lógica). Critério
de aceite verificado por inspeção estrutural + execução de comandos
(typecheck, lint, geração de migração) + execução da suíte existente para
detectar regressão.

## Ambientes e dependências
Local, worktree isolado. Node 24.18.1 via nvm (corepack falha sob Node 18 —
bug conhecido, documentado no handoff do dev-back-end). Sem banco Aurora real
provisionado; `db:generate` roda offline (introspecção de schema TS, não
requer conexão).

## Estratégia de dados / mocks
Não aplicável — sem código de runtime a exercitar.

## Critérios de entrada
PR aberto, dev-back-end declarou `pnpm typecheck`/`eslint`/`db:generate` limpos,
backend-reviewer aprovou com 2 nits já corrigidos.

## Critérios de saída
(a) layout de pastas confere com `plan.md`; (b) schema Drizzle compila, gera
migração sem erro e reflete os atributos do `plan.md`; (c) `pnpm typecheck` e
`pnpm exec eslint src/platform` limpos; (d) suíte existente não regrediu
frente ao baseline pré-008.

## Allure
Não aplicável nesta fase — sem teste de runtime a instrumentar.

## Ordem de execução
1. Diff estrutural contra `plan.md`.
2. `pnpm typecheck`.
3. `pnpm exec eslint src/platform`.
4. Baseline da suíte existente (`pnpm test`) no commit anterior a T001 (`cb343f5`).
5. Suíte existente no HEAD do PR (`64ef79c`), para comparação.

## Limitações
Suíte de testes do repositório (`pnpm test`) falha em 100% dos arquivos com
erro `Vitest failed to find the runner` na inicialização do reporter
`allure-vitest`, **também no baseline pré-008** (`cb343f5`) — falha de
infraestrutura de testes preexistente, não introduzida por este PR. Ver
`test-execution-report.md`.
