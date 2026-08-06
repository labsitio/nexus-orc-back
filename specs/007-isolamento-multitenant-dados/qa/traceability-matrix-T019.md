# Traceability Matrix — T019 (issue #282, PR #666)

SPEC_ID: 007-isolamento-multitenant-dados
Commit testado: `0343b4e`

| Critério de aceite (spec.md) / task | Cenário | Nível | Arquivo | Resultado |
|---|---|---|---|---|
| Critério 2 (relatório de auditoria via API, restrito ao tenant) — contrato de resposta | Envelope `{ itens, proximoCursor }` sem próxima página | Contrato (Zod) | `exportacao-auditoria.test.ts:88` | PASSA |
| Critério 2 — contrato de resposta paginada | Envelope com `proximoCursor` presente | Contrato (Zod) | `exportacao-auditoria.test.ts:88` | PASSA |
| Critério 2 — item de trilha sanitizado | `resumoPayload` sem texto bruto, `tenantId` do próprio requisitante | Contrato (Zod) | `exportacao-auditoria.test.ts:71` | PASSA |
| T019 — query aceita filtros opcionais | Query vazia, `limit` default 50 | Contrato (Zod) | `exportacao-auditoria.test.ts:35` | PASSA |
| T019 — query aceita todos os filtros | `periodo_inicio`/`periodo_fim`/`fornecedorId`/`status`/`cursor`/`limit` juntos | Contrato (Zod) | `exportacao-auditoria.test.ts:40` | PASSA |
| T019 — `limit` 1-200 (openapi) | `limit=0` e `limit=201` rejeitados | Contrato (Zod) | `exportacao-auditoria.test.ts:57` | PASSA |
| T019 — `periodo_*` formato `date` (openapi) | datetime completo rejeitado | Contrato (Zod) | `exportacao-auditoria.test.ts:62` | PASSA |
| T019 — 401 sem JWT válido | Problem Details 401 | Contrato (Zod) | `exportacao-auditoria.test.ts:112` | PASSA (formato fixado; comportamento fim-a-fim já coberto por `tenant-context.middleware.test.ts`, T005) |
| T019 — cross-tenant nunca retorna evento de outro tenant | Filtro sem match do tenant do JWT → 200 com `itens` vazio | Contrato (Zod) | `exportacao-auditoria.test.ts:121` | PASSA (formato fixado; execução HTTP real fim-a-fim depende de T029, bloqueada por T022-T028) |
| Regra adicional não-openapi: `periodo_inicio`/`periodo_fim` só juntos | Um informado sem o outro | Contrato (Zod) | `exportacao-auditoria.test.ts:52` | PASSA — ver nota de risco residual no qa-final-report |

## Cobertura de riscos da matriz de priorização
1. Critério de aceite/regra de negócio: cobre o formato do critério 2 (parcial — só contrato, execução real pendente de T029).
2. Segurança/isolamento: 401 e cross-tenant fixados no nível de contrato; execução real via `TenantContextMiddleware` já testada em T005 (fora desta task).
3. Contrato de API: alinhado a `docs/openapi.yaml:633-682,1077-1096` linha a linha (verificado nesta validação).
4. Erros/limites: `limit` fora de [1,200], data mal formatada, par `periodo_inicio`/`periodo_fim` — cobertos.
5-9: fora de escopo de T019 (idempotência/integração/E2E pertencem a T021/T026-T031).
