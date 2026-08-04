# Matriz de Rastreabilidade — T042 (issue #584, PR #643)

| Requisito / decisão (ADR-008) | Cenário | Teste | Resultado |
|---|---|---|---|
| tenantId ausente no envelope → rejeitado (nunca indexado sem tenant) | payload sem `tenantId` | `orcamento-validado-event.acl.test.ts` — "rejeita evento sem tenantId (opção estrita...)" | PASS |
| tenantId presente mas não UUID v7 → `TenantIdInvalidoError` | payload com `tenantId: 'não-é-uuid'` | `orcamento-validado-event.acl.test.ts` — "lança erro de TenantId inválido quando tenantId não é UUID v7" | PASS |
| tenantId válido → aparece em `resultado.tenantId` como `TenantId` | payload com `tenantId` UUID v7 válido | `orcamento-validado-event.acl.test.ts` — "traduz payload de OrcamentoValidado em ConteudoIndexavel + OrigemValidacao VALIDADO" (assert `resultado.tenantId.toString()`) | PASS |
| tenantId propagado a `IndexarOrcamento` sem regressão no caso de uso existente | fluxo completo ACL → IndexarOrcamento | `indexar-orcamento.test.ts` (unit, tenantId direto), `indexar-orcamento.integration.test.ts` (Postgres real, `skipIf(!DATABASE_URL)`) | PASS / SKIP (sem DATABASE_URL local) |
| Regressão: parsing estrutural do payload (shape v1, sem tenantId no type guard) não quebrou | 9 casos `it.each` de payload malformado + item malformado | `orcamento-validado-event.acl.test.ts` — bloco `it.each` | PASS |
| Cutover único v1/v2 sem leitura dual (ADR-008, zero tenant real em produção #587/#297/T045) | decisão de design, não runtime | Revisão de código + comentário JSDoc na ACL e na porta, alinhado a `tasks.md` T042/T043 | CONFORME (revisão manual) |

## Fora de escopo desta task (não cobrado)
- Handler SQS `indexador-queue` (T030/#190) — não implementado; teste de integração fornece `tenantId` diretamente ao caso de uso, documentado no próprio arquivo de teste (linhas 18-28).
- Tornar `tenantId` obrigatório no envelope de 003 (issue futura #632).
- Assinatura de `IndexarOrcamento.executar` — já existia, não foi tocada nesta task.

## Observação de ambiente
Suíte de integração (`indexar-orcamento.integration.test.ts`) skipada localmente por ausência de `DATABASE_URL` — comportamento esperado e documentado no próprio arquivo (CI provisiona Postgres). Não bloqueia o gate: unit tests da ACL cobrem os três critérios de aceite centrais de forma determinística e sem dependência externa.
