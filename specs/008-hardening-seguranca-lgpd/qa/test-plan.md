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

## T011 -- Teste de infraestrutura SCP segregacao de ambientes (PR #508, commit `8baa2ee`)

### Escopo
Validacao estatica/logica de um script bash de infraestrutura que valida
SCP em AWS. Sem suite de dominio/aplicacao a estender.

### Fora de escopo
Execucao real contra contas AWS dev/hml/prod -- depende de T013/T014/T015,
nao provisionadas neste ambiente. Fica sob responsabilidade de
Ricardo/DevOps quando os pre-requisitos estiverem prontos.

### Riscos
- Guarda de conta de producao falhar e o script rodar contra prod --
  mitigado por verificacao de codigo + mock isolado.
- Falso-positivo/negativo na deteccao de explicit-deny de SCP -- mitigado
  por regex especifica, validada com mock contra mensagem generica de erro.
- Workflow disparar automaticamente (push/PR) por engano -- mitigado por
  inspecao do YAML confirmando apenas `workflow_dispatch`.

### Niveis e tipos de teste
Estatico (leitura, permissao de arquivo, sintaxe bash, parse YAML) + mock
logico isolado da funcao `assert_bloqueado` e da guarda de producao (sem
depender de AWS real).

### Ambientes e dependencias
Nenhuma credencial AWS necessaria para a validacao de QA realizada. Execucao
real do script (fora deste QA) depende de T013 (contas), T014 (SCP),
T015 (role OIDC).

### Estrategia de mocks/fakes
Comandos `aws rds`/`aws s3api` substituidos por comandos fake (`bash -c`)
retornando exit code e stdout controlados, para exercitar os 3 desfechos
possiveis de `assert_bloqueado` sem chamar AWS.

### Criterios de entrada
Backend-reviewer ja aprovou (APPROVE WITH NITS) apos correcao dos 2 MAJOR.

### Criterios de saida
Todas as verificacoes estaticas/logicas PASS; nenhum defeito de producao
encontrado; limitacao de ambiente (execucao real) registrada explicitamente.

### Allure
Nao aplicavel -- script fora do runner vitest do monorepo.

### Ordem de execucao
1. Permissao do arquivo (`git ls-files -s`).
2. Sintaxe bash (`bash -n`).
3. Parse do workflow YAML (`js-yaml`) + inspecao de `on`.
4. Mock isolado de `assert_bloqueado` (3 desfechos) + guarda de producao.
5. Leitura comparativa do README.

### Limitacoes
Sem credenciais AWS reais nem contas dev/hml/prod neste ambiente --
execucao fim-a-fim do script nao pode ser validada por este QA. `shellcheck`
e `python3`/`pyyaml` tambem indisponiveis; contornado com `bash -n`/`js-yaml`.
