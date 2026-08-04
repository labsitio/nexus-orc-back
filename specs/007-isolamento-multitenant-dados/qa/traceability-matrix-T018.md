# Matriz de rastreabilidade — T018 (DrizzleOrcamentoRepository estende DrizzleTenantScopedRepositoryBase)

Issue #281 | PR #646 | branch `feat/281-repositorio-tenant-scoped` | commit testado: `f205a43` (worktree `wt-281-repo-tenant-scoped`)

| Requisito / Critério | Risco | Nível | Cenário | Arquivo/caso | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T018: `SET LOCAL app.current_tenant_id` real (não placeholder) em toda transação de `salvar`/`buscarPorId` | Query fora de sessão scoped, RLS não se aplica, vazamento cross-tenant silencioso | integração (Postgres real) | `salvar` persiste e `buscarPorId` recarrega usando `transacaoTenantScoped` a partir do `TenantContext` da instância | `drizzle-orcamento.repository.test.ts` (suíte completa, 6 casos) | PASS | vitest run com `DATABASE_URL` |
| T018: `tenant_id` persistido corretamente na coluna (`orcamentos` e `orcamentos_historico`) | Tradução linha↔agregado grava tenant errado | integração | Novo teste: `salvar persiste o tenantId do TenantContext da instância na coluna tenant_id` | `drizzle-orcamento.repository.test.ts` (novo) | PASS | vitest run com `DATABASE_URL` |
| RLS (`tenant_isolation`, migração `drizzle/0013_...sql`) bloqueia cross-tenant sob role sem `BYPASSRLS` | Isolamento não é real, só de aplicação | integração adversarial | Role dedicada `nobypassrls`; tenant A nunca vê linha de tenant B; `FORCE ROW LEVEL SECURITY` bloqueia até o dono da role de grant | `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (4 casos, pré-existente, não desta PR) | PASS | vitest run com `DATABASE_URL` |
| `TenantContext`/`tenantId` nunca guardado em singleton entre chamadas | Vazamento de tenant de uma requisição para outra sob concorrência | análise estática + unit | `CriarOrcamentoRepositorio` é fábrica `(tenantId) => OrcamentoRepository`; os 4 casos de uso chamam a fábrica dentro de `executar()` e usam o resultado só localmente, nunca em campo de instância | leitura de código (`receber-orcamento.ts`, `classificar-orcamento.ts`, `confirmar-revisao-humana.ts`, `consultar-status-orcamento.ts`) + testes unit dos 4 casos de uso | PASS | inspeção manual + vitest run |
| Regressão: `ReceberOrcamento` (idempotência, gate de admissão) | Fábrica quebra injeção de dependência existente | unit | 5 casos (persistência, orcamentoId provisório, idempotency-key repetida/nova, canal inválido) | `receber-orcamento.test.ts` | PASS | vitest run |
| Regressão: `ClassificarOrcamento` (transições, cache-miss) | Fábrica ou guard novo quebra fluxo de classificação | unit | 5 casos (confiança alta/baixa, não encontrado, transição inválida, cache-miss silencioso) | `classificar-orcamento.test.ts` | PASS | vitest run |
| `ClassificarOrcamento` com `tenantId` undefined rejeita ANTES de tocar o repositório | Transação aberta com tenant forjado durante transição pré-#632 | unit | `TenantDivergenciaError` lançado com `motivo: 'DIVERGENTE'` sem chamar `criarRepositorio` | `classificar-orcamento.test.ts` / `classificador-queue.handler.test.ts` (não regressivo pós-rebase sobre #640) | PASS | vitest run |
| Regressão: `ConfirmarRevisaoHumana` (confirmação, histórico, transição inválida) | Fábrica quebra fluxo de revisão humana | unit | 4 casos + novo caso de `TenantDivergenciaError` por divergência de tenant | `confirmar-revisao-humana.test.ts` (5 casos, 1 novo) | PASS | vitest run |
| Regressão: `ConsultarStatusOrcamento` (leitura, escalonamento, não encontrado) | Fábrica quebra leitura read-only | integração (fake in-memory) | 3 casos | `consultar-status-orcamento.integration.test.ts` | PASS | vitest run |
| Regressão: contract tests HTTP (`status`, `revisao-humana`, `confirmar-upload`, `tenant-isolation`) | Composition root com fábrica quebra wiring de rotas | contrato | Todos os 4 controllers seguem recebendo os casos de uso já construídos, injeção da fábrica é transparente | `status.controller.test.ts`, `revisao-humana.controller.test.ts`, `confirmar-upload.controller.test.ts`, `tenant-isolation.test.ts` | PASS | vitest run |
| Regressão: `sftp-upload.handler.ts` | Handler Lambda consumidor de `ReceberOrcamento` quebra com nova assinatura de construtor | unit | 8 casos (não tocado, só o fake injetado como `() => repositorioFake`) | `sftp-upload.handler.test.ts` | PASS | vitest run |
| Typecheck do diff | Regressão de tipos | static | `tsc --noEmit` sobre o projeto | — | PASS (0 erros) | `npx tsc --noEmit` |
| Lint dos 7 arquivos de produção alterados | Regressão de estilo/regras | static | `eslint` | — | PASS (0 erros) | `npx eslint .` |

## Suíte completa (regressão de todo o repositório)

`DATABASE_URL="postgresql://nexo:nexo@localhost:55432/nexo" npx vitest run`
176 arquivos passaram, 0 skipados (Postgres real disponível). 1026 testes passaram, 0 falhas.

## Fix de QA (test-only, sem alteração de produção)

`f205a43`: `tests/.../confirmar-revisao-humana.test.ts` perdeu o import de `TenantDivergenciaError` no merge automático do rebase sobre #644 (que removeu um import homônimo não usado em outro arquivo do mesmo diff). `tsc --noEmit` pegou o erro; import restaurado, sem tocar código de produção.

## Bugs encontrados

Nenhum.

## Risco residual (não-bloqueante)

`sanitizar-conteudo-documento.test.ts` (não tocado por T018) apresenta timing flakiness (limite de 200ms) somente sob `--coverage` (overhead de instrumentação, medido ~700ms). Sem `--coverage` passa normalmente. Não é regressão desta PR — registrado para acompanhamento, não bloqueia T018.

## Parecer

**APROVADO PELO QA.**
