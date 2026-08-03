# QA Final Report — T040 (IAM ConfirmarRevisaoHumanaExtracaoLambdaRole)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #105
- PR: #573 (draft), branch `feat/002-t040-iam-confirmar-revisao-humana`
- Commit no topo do worktree: `615a1bf`
- Diff real da PR (merge-base, `git diff origin/main...HEAD --stat`): 3 arquivos, 52 inserções, 1 deleção
  - `infra/lib/confirmar-revisao-humana-extracao-lambda-role-stack.ts` (novo)
  - `infra/bin/app.ts` (wiring)
  - `specs/002-extracao-dados-orcamento/tasks.md` (T040 marcada concluída)

## Resumo executivo
Nova IAM Role dedicada (`ConfirmarRevisaoHumanaExtracaoLambdaRole`), least privilege,
contendo apenas a managed policy `AWSLambdaBasicExecutionRole`. Nenhuma permissão de
Bedrock, S3 ou wildcard. Padrão idêntico ao já aprovado em `ConfirmarRevisaoHumanaLambdaRoleStack`
(spec 001, T054). Wiring em `infra/bin/app.ts` correto (import + instanciação, sem duplicidade).

## Observação de processo (não bloqueante)
`git diff origin/main..HEAD` (two-dot) mostrava deleções de arquivos de outras specs
(003 T035, 005 T019) porque o branch está 2 commits atrás de `origin/main`
(`ff640be`, `79ad2cf` não estão na história do branch) — ou seja, a alegação de
"rebaseada em origin/main" no handoff não procede; o branch está desatualizado,
não rebaseado. Confirmado com `git diff origin/main...HEAD` (three-dot, contra
merge-base) que o conteúdo real da PR é só os 3 arquivos esperados — GitHub calcula
o diff da PR da mesma forma, então a PR em si não está afetada e `gh pr view`
confirma `mergeable: MERGEABLE`. Recomendação: dev-back-end rebasear antes do merge
(fora do escopo bloqueante deste gate, since PR ainda é draft).

## Suítes executadas e comandos
- `npx tsc --noEmit -p infra/tsconfig.json` → sem erros.
- `npx eslint infra/lib/confirmar-revisao-humana-extracao-lambda-role-stack.ts infra/bin/app.ts` → sem erros.
- Não há teste unitário/CDK Assertions para esta stack (mesmo padrão das roles irmãs
  do repo — NIT já registrado pelo backend-reviewer, não bloqueante).
- CI do PR #573 (`gh pr view 573`): check `ci` = SUCCESS, `Vulnerability analysis` = NEUTRAL.

## Verificações de segurança específicas (least privilege)
- `grep` por wildcard (`'*'`, `actions: ['*']`, `Resource: *`) em
  `confirmar-revisao-humana-extracao-lambda-role-stack.ts` → nenhuma ocorrência.
- `grep` por `bedrock`, `s3.`, `nexo-orcamentos-raw`, `PolicyStatement` → ocorrências
  apenas em comentário de justificativa (linhas 17 e 20), nenhuma em código executável.
- `roleName: 'ConfirmarRevisaoHumanaExtracaoLambdaRole'` confere exatamente com o
  nome exigido pela issue #105.
- Managed policy única: `AWSLambdaBasicExecutionRole` (execução mínima Lambda/logs).

## Cobertura
N/A — artefato de infraestrutura (CDK stack), sem lógica de negócio testável via
vitest. Vitest da suíte de aplicação não impactado por esta mudança (0 arquivos de
`src/` alterados).

## Bugs encontrados
Nenhum.

## Riscos residuais
- Branch desatualizado em relação a `origin/main` (ver seção acima) — ação do
  dev-back-end antes do merge (rebase), não é defeito de produto.
- Ausência de teste CDK Assertions e de policy explícita para `events:PutEvents`
  são débitos sistêmicos preexistentes em todas as roles publicadoras do repo,
  já registrados pelo backend-reviewer como NITs, fora do escopo desta task.

## Limitações do ambiente
Node do sistema é v16; comandos executados com `nvm use 24`. `package-lock.json`
não versionado (convenção do repo), não commitado.

## Parecer final
APROVADO PELO QA
