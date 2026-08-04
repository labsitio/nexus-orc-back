# Matriz de rastreabilidade — T044 (tenantId em Domain Events de 005/Orquestração)

Issue #586 | PR #645 (draft) | branch `feat/586-tenantid-eventos-005` | commit testado: `34f3369` (worktree `wt-586-eventos-orquestracao`)

| Requisito / Critério | Risco | Nível | Cenário | Arquivo/caso | Resultado | Evidência |
|---|---|---|---|---|---|---|
| T044: `tenantId?: string` no envelope `DomainEventEnvelope` | Regressão de payload existente | unit | `IntegracaoExternaSolicitada` continua com payload restrito, agora incluindo `tenantId` na lista exaustiva de chaves | `domain-events.test.ts:69-77` (pré-existente, ajustado) | PASS | vitest run |
| T044: `tenantId` opcional propagado corretamente quando informado | Campo ignorado/perdido no construtor | unit | Cada um dos 5 eventos, construído com `tenantId` explícito, expõe o mesmo valor na instância | `domain-events.test.ts` — `describe('tenantId (spec-007, T044 — expand/contract)')`, novo | PASS | vitest run |
| T044: `tenantId` permanece `undefined` quando omitido (expand/contract, sem quebrar emissores atuais) | Obrigatoriedade acidental / quebra de call sites de produção | unit | Mesmos 5 eventos, construídos sem `tenantId` (assinatura antiga), `tenantId` é `undefined` | `domain-events.test.ts` — mesmo `describe`, `semTenant` | PASS | vitest run |
| T044: `schemaVersion` mantido em `1` (ADR-008, não é cutover) | Bump de schema não intencional | unit | Suite parametrizada pré-existente (`describe.each`) continua afirmando `schemaVersion === 1` para os 5 eventos | `domain-events.test.ts:10-54` (não alterado) | PASS | vitest run |
| Risco de shift posicional em `OrcamentoReenvioSolicitado` (`motivoDadoAusente` adjacente ao ponto de inserção de `tenantId`) | Call site futuro passando `ocorreuEm` posicionalmente capturaria valor errado em `tenantId` | análise estática | `grep` por todos os `new OrcamentoReenvioSolicitado(...)` em `src/` e `tests/` | nenhum call site (produção ou teste, antes ou depois deste diff) passa `ocorreuEm` posicionalmente | PASS (confirmado independentemente do dev-back-end/backend-reviewer) | grep manual, ver relatório final |
| Escopo excluído (T044a): ACLs de 001/002/003 em `orquestracao/`, agregado `DecisaoWorkflow`, `decisao-workflow.schema.ts` | N/A — fora de escopo desta task | — | Não testado nesta task; T044a aberta e não marcada em `tasks.md` | — | N/A (fora de escopo, não é lacuna desta PR) | — |
| Typecheck do diff | Regressão de tipos | static | `tsc --noEmit` sobre o projeto | — | PASS (0 erros fora de `src/dev/`, pré-existentes e não relacionados) | `npx tsc --noEmit` |

## Cobertura (escopo do diff: `src/bounded-contexts/orquestracao/domain/events/**`)

- Statements: 100% (42/42)
- Branches: 100% (5/5)
- Functions: 100% (5/5)
- Lines: 100% (42/42)

Comando: `npx vitest run tests/bounded-contexts/orquestracao/ --coverage --coverage.include='src/bounded-contexts/orquestracao/domain/events/**'`

## Suíte completa do BC (regressão)

`npx vitest run tests/bounded-contexts/orquestracao/`
19 arquivos passaram, 2 arquivos skipados (pré-existentes: `drizzle-decisao-workflow.repository.test.ts` e `decisao-workflow.schema.test.ts`, dependem de Postgres, sem relação com este diff).
153 testes passaram, 15 skipados. 0 falhas.

## Bugs encontrados

Nenhum.
