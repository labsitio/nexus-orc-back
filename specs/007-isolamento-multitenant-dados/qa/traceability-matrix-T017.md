# Matriz de rastreabilidade — T017 (issue #280, PR #639)

Branch `feat/280-tenantid-use-cases`, commit `27dfe03` (worktree
`/home/victor1090/Documentos/Labs/wt-280-use-cases-tenant`).

Escopo: `ClassificarOrcamento`, `ConfirmarRevisaoHumana`,
`ConsultarStatusOrcamento` propagam/validam `tenantId`; controllers HTTP e
handler SQS do classificador atualizados na mesma PR.

Baseline recebida do dev-back-end: 918 testes passando, aprovado pelo
backend-reviewer. Suíte completa reexecutada nesta validação: **927 passando**
(918 + 9 novos, ver abaixo), 0 falhas, 99 skipped (integração Postgres/pgvector
— ambiente sem banco real, ver Limitações).

## Achado de QA

Nenhum bug de produção. A implementação está correta em todos os cenários do
plano de teste. Porém a suíte entregue pelo dev-back-end **não exercitava**
metade dos branches novos de validação de tenant — os testes de unidade
importavam `TenantDivergenciaError` sem nunca lançá-lo, e o handler SQS não
tinha nenhum teste para o branch de tenant divergente nem para o de
`tenantId` malformado. QA escreveu os 9 testes que faltavam (todos passam sem
alterar produção) para fechar a lacuna antes de aprovar.

## Matriz

| # | Requisito / critério (plano de teste) | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|---|
| 1 | POST revisão-humana: JWT Tenant A + orçamento Tenant B → 404 (não 403) | Contrato | orçamento salvo com `tenantId` de outro tenant; preHandler fake injeta tenant requisitante distinto | `tests/.../contract/revisao-humana.controller.test.ts` (teste novo, QA) | PASS |
| 1b | Idem, nível unitário: `ConfirmarRevisaoHumana` lança `TenantDivergenciaError` cross-tenant | Unit | `tenantId` do agregado != `tenantId` do parâmetro | `tests/.../application/confirmar-revisao-humana.test.ts` (teste novo, QA) | PASS |
| 2 | GET status: JWT Tenant A + orçamento Tenant B → 404 (não 403) | Contrato | JWT real via `TenantContextMiddleware` (Cognito mockado) | `tests/.../contract/tenant-isolation.test.ts` (já existente, dev-back-end) | PASS |
| 2b | Idem, nível unitário: `ConsultarStatusOrcamento` cross-tenant e agregado legado (tenantId undefined) | Unit | 2 cenários: tenantId divergente / tenantId ausente no agregado | `tests/.../application/consultar-status-orcamento.integration.test.ts` (2 testes novos, QA) | PASS |
| 3 | Fila classificador: evento sem `tenantId` (v1) + orçamento legado → 404 (`TenantDivergenciaError` no use case) | Unit | `ClassificarOrcamento.executar(id, undefined)` contra agregado com tenantId | `tests/.../application/classificar-orcamento.test.ts` (2 testes novos, QA) | PASS |
| 3b | Handler SQS trata `TenantDivergenciaError` como sucesso idempotente (log info, sem batch item failure/DLQ) | Interface/handler | use case rejeita com `TenantDivergenciaError` | `tests/.../interface/classificador-queue.handler.test.ts` (teste novo, QA) | PASS |
| 4 | Confirmação: fluxo normal com tenants coincidentes ainda funciona (200) | Contrato + unit | mesmo tenant no preHandler fake e no agregado | `tests/.../contract/revisao-humana.controller.test.ts` + `application/confirmar-revisao-humana.test.ts` (já existentes, dev-back-end) | PASS |
| 5 | Evento com `tenantId` inválido → erro de parsing, batch item failure, DLQ (nunca sucesso idempotente) | Interface/handler | `TenantId.de('nao-e-um-uuid')` lança dentro do handler, erro não é `TenantDivergenciaError`/`TransicaoInvalidaError` | `tests/.../interface/classificador-queue.handler.test.ts` (teste novo, QA) | PASS |
| — | Handler propaga `TenantId` real do envelope para o use case quando presente (regressão do parsing) | Interface/handler | envelope com `tenantId` UUID v7 válido | `tests/.../interface/classificador-queue.handler.test.ts` (teste novo, QA) | PASS |
| — | Regressão: suíte completa do BC + monorepo | Unit+Integração+Contrato | suíte inteira | `npx vitest run` | PASS (927/927, 99 skipped por ambiente) |
| — | Tipos e lint dos arquivos de teste alterados | Estático | `tsc --noEmit`, `eslint` nos 5 arquivos alterados | todo o repo / arquivos alterados | PASS |

## Cobertura (arquivos de produção do escopo T017)

Medida isolando os 6 arquivos alterados nesta task via
`vitest run --coverage --coverage.include=...`:

| Arquivo | Stmts | Branch | Funcs | Lines | Linhas não cobertas |
|---|---|---|---|---|---|
| `classificar-orcamento.ts` | 100% | 92.3% | 100% | 100% | linha 80 (fallback de nome de arquivo — não é branch de tenant, pré-existente) |
| `classificador-queue.handler.ts` | 96.66% | 93.75% | 100% | 96.66% | linha 44 (`typeof detail !== 'object'`, guard defensivo pré-existente) |
| `revisao-humana.controller.ts` | 86.66% | 85.71% | 100% | 86.66% | linhas 62-68 (fallback defensivo "tenantContext ausente" — inalcançável com middleware ativo, documentado no próprio código como "não deveria acontecer") + linha 102 (`throw erro` de erro inesperado, sem teste de erro genérico neste controller) |
| `status.controller.ts` | 86.36% | 87.5% | 100% | 86.36% | linhas 63-69 (mesmo fallback defensivo) — o `throw erro` genérico já é coberto por `propaga (500) erro inesperado do repositório` |
| `confirmar-revisao-humana.ts` | 100% | 100% | 100% | 100% | — |
| `consultar-status-orcamento.ts` | 100% | 100% | 100% | 100% | — |

Lacuna conhecida, não bloqueante: o fallback defensivo "tenantContext ausente
após preHandler" (401) nos dois controllers não tem teste dedicado — é
inalcançável em condições normais (o próprio `TenantContextMiddleware` já
barra a requisição com 401 antes; o código trata isso como caso "não deveria
acontecer"). Testar exigiria um preHandler fake que popula o middleware mas
omite o `tenantContext`, cenário artificial que não corresponde a nenhum
comportamento real do middleware. Risco residual: baixo — se o middleware
mudar de contrato no futuro, o fallback previne 500 mas isso não está
verificado por teste.

## Limitações de ambiente

- Zero tenant real em produção — spec baseline (aceito, spec 007 escreve para
  o futuro).
- Nenhum Bedrock real invocado — todos os gateways são fakes/stubs, conforme
  padrão já estabelecido pela suíte.
- Dados de teste são locais, fixtures com `TenantId.novo()`.
- 99 testes skipped nesta execução são integração Postgres/pgvector real —
  não há banco disponível neste ambiente de QA; não fazem parte do escopo de
  T017 (schema/RLS já validados em T007, ver
  `traceability-matrix-T007.md`) e não bloqueiam este parecer.

## Bugs encontrados

Nenhum. `ClassificarOrcamento`, `ConfirmarRevisaoHumana`,
`ConsultarStatusOrcamento`, os dois controllers HTTP e o handler SQS
implementam corretamente a regra "404 nunca 403" e o tratamento
idempotente/DLQ do handler, em todos os cenários do plano de teste.

## Parecer final

**APROVADO PELO QA**

Critérios de aceite do escopo T017 cobertos e passando. Nenhum defeito
crítico/alto em aberto. Suíte completa 927/927 (0 falhas). Lacunas de
cobertura identificadas são fallbacks defensivos inalcançáveis, documentadas
acima, não bloqueiam a entrega.

Testes criados/alterados por este QA (arquivos de teste apenas, nenhuma
alteração em `src/`):
- `tests/bounded-contexts/ingestao-identificacao/application/classificar-orcamento.test.ts`
- `tests/bounded-contexts/ingestao-identificacao/application/confirmar-revisao-humana.test.ts`
- `tests/bounded-contexts/ingestao-identificacao/application/consultar-status-orcamento.integration.test.ts`
- `tests/bounded-contexts/ingestao-identificacao/contract/revisao-humana.controller.test.ts`
- `tests/bounded-contexts/ingestao-identificacao/interface/classificador-queue.handler.test.ts`

Próxima ação obrigatória: dev-back-end segue com merge da PR #639 / fechamento
da issue #280 conforme seu próprio fluxo (labels, PR review, etc.) — QA não
executa merge nem fecha issue.
