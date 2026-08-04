# Matriz de Rastreabilidade — T046 (issue #632, PR #655)

SPEC_ID: 007-isolamento-multitenant-dados
Branch: `feat/632-contract-tenantid-obrigatorio`
Commit testado: `a2fc3aa`

| # | Critério de aceite (issue #632) | Evidência / comando | Resultado |
|---|---|---|---|
| 1 | `tenantId` obrigatório e `schemaVersion: 2` em 001/002/003/005; 004 intocado funcionalmente | `git diff --stat main...HEAD -- src/bounded-contexts/busca-indexacao/` (1 arquivo, só JSDoc); `git diff main...HEAD -- .../busca-indexacao/infrastructure/orcamento-validado-event.acl.ts` (shape de wire `tenantId?: string` inalterado, só comentário) | PASSA |
| 2 | Nenhum evento dos 4 BCs mantém `schemaVersion = 1 as const` | `grep -rn "schemaVersion = 1 as const" src/bounded-contexts/{ingestao-identificacao,extracao,validacao,orquestracao}/domain/events/` → saída vazia | PASSA |
| 3 | Todos os sites de emissão passam `tenantId`; `tsc --noEmit` limpo, sem `any`/`as` de conveniência/`@ts-ignore` | `npx tsc --noEmit` → 0 erros; `git diff main...HEAD -- '*.ts' ':!*.test.ts' \| grep -E 'any\|@ts-ignore\|@ts-expect-error\| as [A-Za-z]'` → único hit é cast de type guard `(detail as Record<string, unknown>).tenantId` sobre `unknown` de wire, padrão já existente na mesma função para `orcamentoId` | PASSA |
| 4 | As 4 ACLs cross-BC citadas rejeitam evento sem `tenantId` (comportamento real, testado) | `npx vitest run tests/bounded-contexts/validacao/infrastructure/orcamento-extraido-event.acl.test.ts tests/bounded-contexts/orquestracao/infrastructure/orcamento-{classificado,extraido,validado}-event.acl.test.ts` → 66/66 passando, incluindo os 4 casos `it('rejeita ... obrigatório desde o cutover de contract (#632, ADR-008)')` | PASSA |
| 5 | Cenário cross-tenant de T011 é `it()` normal, sem `it.fails` | `grep -n "it\.\(fails\|skip\)\|it(" tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts` → 3 `it()` normais; comentário do arquivo confirma promoção de `it.fails` para `it()` | PASSA |
| 6 | Suíte completa verde, sem `expected fail` remanescente de tenant | `npx vitest run` → 176/176 arquivos, 1069/1069 testes, 0 fail, 0 skip inesperado (todos `describe.skipIf(!DATABASE_URL)` executados com Postgres local up); `grep -rn "it\.skip\|it\.fails\|describe\.skip\|test\.skip\|test\.fails" tests/` → só `describe.skipIf(!DATABASE_URL)` (executado) e 2 linhas de comentário histórico em `tenant-isolation.test.ts` | PASSA |
| 7 | Amendment ADR-008 registrado em `plan.md` | `git diff main...HEAD -- specs/007-isolamento-multitenant-dados/plan.md` → bloco "Amendment 2026-08-04 (issue #632 — cutover de contract)" presente; T046 registrada em `tasks.md` linha 153 | PASSA |

## Achados adicionais do QA (não bloqueantes, gap de teste fechado nesta validação)

Os 3 guards de fail-fast introduzidos por esta PR
(`OrcamentoValidacaoSemTenantIdError` em `validar-orcamento.ts`,
`ExtracaoSemTenantIdError` em `extrair-dados-orcamento.ts`,
`DecisaoWorkflowSemTenantIdError` em `consolidar-e-decidir-workflow.ts`)
estavam em 0% de cobertura (nenhum teste os disparava). QA adicionou 1 teste
de regressão por guard (arquivos de teste apenas, nenhuma produção tocada):

- `tests/bounded-contexts/validacao/application/validar-orcamento.test.ts` —
  agregado legado sem `tenantId` reconstituído via `OrcamentoValidacao.criar`
  (parâmetro opcional) → `rejects.toThrow(OrcamentoValidacaoSemTenantIdError)`.
- `tests/bounded-contexts/extracao/application/extrair-dados-orcamento.test.ts` —
  mesmo padrão via `ExtracaoOrcamento.criar` sem `tenantId`.
- `tests/bounded-contexts/orquestracao/application/consolidar-e-decidir-workflow.test.ts` —
  como as 3 ACLs de entrada garantem `tenantId` no tipo, o único jeito de
  alcançar este ramo é uma implementação de ACL que viole seu próprio
  contrato de tipo em runtime; o teste simula essa falha com um cast
  documentado no próprio teste (`undefined as unknown as TenantId`) — não é
  produção, é o test double simulando o cenário de defesa em profundidade.

Residual (não corrigido nesta validação, risco baixo): os mesmos guards têm
um segundo ponto de lançamento cada, em endpoints humanos ainda sem teste
dedicado — `registrar-decisao-humana-validacao.ts:142`
(`OrcamentoValidacaoSemTenantIdError`) e
`confirmar-revisao-humana-extracao.ts:326` (`ExtracaoSemTenantIdError`).
Mesmo padrão de guarda já comprovado funcional no site irmão testado acima;
classificado como "risco ainda não testado, duplicata de padrão já coberto"
— não bloqueia o gate.
