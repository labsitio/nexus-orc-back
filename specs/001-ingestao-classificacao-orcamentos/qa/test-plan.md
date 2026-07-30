# Test Plan — T001 (issue #6)

## Escopo
T001 — scaffolding do monorepo (`package.json`, `tsconfig.json`, `.npmrc`,
`.gitignore`, `src/index.ts` placeholder, `pnpm-lock.yaml`). Nenhum código de
domínio, endpoint ou regra de negócio.

## Fora de escopo
Critérios de aceite funcionais do `spec.md` (Bounded Context Ingestão &
Identificação): código ainda não existe, entra a partir de T004+.

## Riscos
- Config strict não pega efetivamente (falso senso de segurança de tipos).
- `packageManager` pinado não é respeitado (build divergente entre máquinas/CI).
- `tsc --noEmit` falha em ambiente limpo (Node 24 / corepack não habilitado).

## Estratégia
Sem lógica de negócio → sem teste unitário/integração/contrato/e2e aplicável.
Verificação por smoke check manual, em worktree isolado, no commit exato do PR:
1. `pnpm install` em ambiente limpo (Node 24 via nvm, corepack habilitado).
2. `pnpm exec tsc --noEmit` — baseline deve passar.
3. Injeção temporária de `.ts` inválido (tipo incompatível, argumento
   obrigatório faltante) → `tsc --noEmit` deve falhar com exit code != 0.
4. Injeção temporária de acesso a índice de array sem narrowing → deve falhar
   por `noUncheckedIndexedAccess`.
5. Confirmar que `pnpm --version` resolvido no worktree é a mesma versão
   pinada em `packageManager`.
6. Remover todo arquivo temporário e o worktree ao final (nenhum artefato de
   smoke check entra no repositório).

## Critérios de entrada
PR #391 aberto, commit 11b1959, `backend-reviewer` com parecer emitido.

## Critérios de saída
Smoke checks 1–5 executados com resultado esperado, sem defeito de produção
encontrado.

## Allure
Não aplicável — não há teste automatizado de runtime para gerar
`allure-results` nesta task (não há suíte de testes, não há framework de
execução configurado ainda; T003 é quem introduz CI/testes).

## Limitações
Execução local (não em runner de CI do projeto, que ainda não existe — T003).
