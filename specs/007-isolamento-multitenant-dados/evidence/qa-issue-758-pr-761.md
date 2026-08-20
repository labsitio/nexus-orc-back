# QA — issue #758 (remove auth-cognito.middleware morto, ADR-017) — PR #761

SPEC_ID: 007-isolamento-multitenant-dados (fix técnico, sem task própria em `tasks.md`)
PR: labsitio/nexus-orc-back#761
Branch: fix/758-remove-auth-cognito-middleware-morto
Commit testado: a550752
Tipo: primeira validação (sem BUG anterior)

## Escopo

Fix de limpeza — deleção de código morto, sem mudança de comportamento. ADR-017 decidiu que
autenticação em produção é 100% via `tenant-context.middleware.ts` + `role-guard.middleware.ts`,
sem authorizer no API Gateway. Os 4 `auth-cognito.middleware.ts` (extracao, ingestao-identificacao,
orquestracao, validacao) nunca foram consumidos por nenhuma composition root nem por
`src/dev/local.ts`.

Arquivos de produção alterados:

- DELETADOS: `src/bounded-contexts/{extracao,ingestao-identificacao,orquestracao,validacao}/interface/http/auth-cognito.middleware.ts` (4 arquivos)
- DELETADOS: `tests/bounded-contexts/{extracao,ingestao-identificacao,orquestracao,validacao}/interface/http/auth-cognito.middleware.test.ts` (4 arquivos)
- Comentário/JSDoc editado (sem mudança de comportamento): `src/interface/shared/cognito-jwt-verifier.ts`,
  `route-opts.ts` (4 BCs), `status.controller.ts` (orquestracao, validacao), `README.md`
  — trocam referência a `criarAutenticacaoCognito`/`auth-cognito.middleware.ts` por
  `criarTenantContextMiddleware` (mecanismo real, ADR-017).

Critério de aceite é negativo: garantir que nada quebrou e que a remoção foi completa e segura.
Não há lógica de negócio nova para cobrir com teste novo.

## Comandos executados

```
git fetch origin fix/758-remove-auth-cognito-middleware-morto
git grep -n "auth-cognito.middleware\|criarAutenticacaoCognito" -- src tests
git grep -n "AuthCognito\|auth-cognito\|CognitoAuth" -- src infra
grep -n "preHandler\|import" src/dev/local.ts
npx vitest run --reporter=default
pnpm typecheck
pnpm lint
gh pr checks 761
```

`pnpm test` não foi usado (path com espaço — `allure-vitest` falha, comportamento conhecido,
documentado em CLAUDE.md). Contornado com `npx vitest run --reporter=default`.

## Resultados

| Comando | Resultado |
|---|---|
| `git grep "auth-cognito.middleware\|criarAutenticacaoCognito" -- src tests` | vazio (exit 1) — nenhum arquivo em `src` ou `tests` referencia o código deletado |
| `git grep "AuthCognito\|auth-cognito\|CognitoAuth" -- src infra` | vazio (exit 1) — nenhuma composition root, `src/dev/local.ts` ou stack de infra referenciava os middlewares removidos |
| `npx vitest run --reporter=default` | 193 arquivos passaram, 1281 testes passaram, 124 skipped (esperado, `skipIf(!DATABASE_URL)`). 6 arquivos falharam: `infra/lib/{classificador-lambda-role,contexto-classificacao-queue,extrator-queue,http-api,receber-orcamento-lambda-role,validar-orcamento-lambda-role}-stack.test.ts`, todos com `Hook timed out in 30000ms` na síntese CDK local — falha preexistente de ambiente (lentidão de síntese CDK nesta máquina), não relacionada ao diff (nenhum arquivo `infra/` tocado por esta PR); confirmado verde no CI (ver abaixo) |
| `pnpm typecheck` | limpo, sem erro |
| `pnpm lint` | limpo, sem erro |
| `gh pr checks 761` | `ci` = pass (1m42s); `Vulnerability analysis` = skipping (Debricked, não bloqueante) |

## Critérios de aceite

1. **Suíte completa continua verde após a remoção — nenhum outro teste dependia (import) dos 4
   arquivos deletados** — confirmado. `npx vitest run` não reporta nenhum erro de import
   quebrado; as únicas 6 falhas são timeout de hook em síntese CDK de infra, categoria já
   documentada em CLAUDE.md como limitação desta máquina, e o CI (Linux) roda essas 6 suítes
   de verdade e está verde.
2. **`git grep -n "auth-cognito.middleware\|criarAutenticacaoCognito" -- src tests` retorna
   vazio** — confirmado, exit code 1 (sem matches).
3. **Nenhuma rota HTTP real (composition root, `src/dev/local.ts`, `*.production.ts`)
   referenciava os middlewares removidos** — confirmado por inspeção direta, não apenas pelo
   relato do dev/reviewer: `git grep` por `AuthCognito|auth-cognito|CognitoAuth` em `src` e
   `infra` retorna vazio; `src/dev/local.ts` importa apenas `criarTenantContext`,
   `registrarRota*` e handlers de fila — nenhuma menção a auth-cognito; os 5 composition roots
   em `src/composition/` não referenciam os arquivos deletados.
4. **CI da PR está verde** — confirmado, `gh pr checks 761` reporta `ci = pass`.

## Observações (não são defeito)

a. As 6 falhas de `infra/lib/*-stack.test.ts` por timeout de hook são reproduzíveis
   isoladamente, preexistentes ao diff desta PR (nenhum arquivo `infra/` alterado por #758) e
   já documentadas como limitação de ambiente local (lentidão de síntese CDK). Não bloqueiam o
   gate porque o CI (evidência de execução real) está verde.
b. `pnpm typecheck:infra` não foi executado nesta rodada — o diff não toca `infra/`, e o CI já
   cobre typecheck completo do repositório.

## Gap de cobertura

Nenhum identificado como lacuna nova. A PR remove código morto e seus testes correspondentes —
não há comportamento de produção não coberto introduzido por este diff. Os 4 arquivos de teste
deletados testavam um middleware nunca exercitado em runtime (confirmado item 3); a remoção
não reduz cobertura de comportamento real.

## Bugs encontrados

Nenhum.

## Parecer

APROVADO PELO QA.
