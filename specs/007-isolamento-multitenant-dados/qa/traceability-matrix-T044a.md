# Matriz de rastreabilidade — T044a (issue #650, PR #653)

Branch `feat/650-wiring-tenantid-005`, commit `e4f72de` (confirmado, `git log
-1 --format="%H"` no branch checked out neste ambiente).

Escopo: propagação de `tenantId` ao agregado `DecisaoWorkflow`/read-model
"contexto consolidado" (ADR-001 de 005), fechando o follow-up deixado por
T044/#586. Toca as 3 ACLs de entrada de `orquestracao/`
(`orcamento-classificado-event.acl.ts`, `orcamento-extraido-event.acl.ts`,
`orcamento-validado-event.acl.ts`, domain + infrastructure), o agregado
`DecisaoWorkflow`, os 2 use cases consumidores (`RegistrarContextoClassificacao`,
`ConsolidarEDecidirWorkflow`), o schema/repository Drizzle (coluna `tenant_id`
nova, `drizzle/0019`).

Suíte completa reexecutada nesta validação (`npx vitest run`, `DATABASE_URL`
setado — testes de integração incluídos, não skipados): **176 arquivos, 1077
testes, 100% passando**, 0 falhas, 0 skip.

## Matriz

| # | Requisito / critério de aceite | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|---|
| 1 | `tenantId` extraído do envelope de 001 pela ACL de classificação, propagado ao agregado | Unit | "extrai tenantId como TenantId quando presente no envelope" + "propaga tenantId extraído pela ACL para o agregado" | `tests/.../infrastructure/orcamento-classificado-event.acl.test.ts`, `tests/.../application/registrar-contexto-classificacao.test.ts` | PASS |
| 2 | `tenantId` extraído do envelope de 002 pela ACL de extração | Unit | equivalente ao #1, ACL de extração | `tests/.../infrastructure/orcamento-extraido-event.acl.test.ts` | PASS |
| 3 | `tenantId` extraído do envelope de 003 pela ACL de validação, propagado até o evento de desfecho publicado | Unit | "propaga tenantId consolidado do agregado ao evento de desfecho publicado" | `tests/.../infrastructure/orcamento-validado-event.acl.test.ts`, `tests/.../application/consolidar-e-decidir-workflow.test.ts` | PASS |
| 4 | `tenantId` ausente em qualquer dos 3 upstreams nunca é rejeitado (expand/contract) | Unit | "nunca rejeita quando tenantId está ausente" (×3 ACLs); "permanece undefined quando nenhum upstream traz tenantId" (aggregate) | 3 arquivos `*-event.acl.test.ts` + `decisao-workflow.aggregate.test.ts` | PASS |
| 5 | `tenantId` ausente num upstream posterior nunca sobrescreve o já consolidado por um upstream anterior | Unit | "tenantId ausente num upstream posterior nunca sobrescreve o já consolidado" | `decisao-workflow.aggregate.test.ts` | PASS |
| 6 | `tenantId` malformado (não string / não UUID) é rejeitado pela ACL com erro tipado | Unit | "lança ...InvalidoError para tenantId com shape inválido (não string)"; "propaga o erro de TenantId.de para tenantId malformado" | 3 arquivos `*-event.acl.test.ts` | PASS |
| 7 | Divergência entre dois `tenantId` concretos de upstreams diferentes lança `TenantIdDivergenteError`, fail-fast, sem mutação de contexto parcial | Unit | "rejeita com TenantIdDivergenteError quando um segundo upstream traz tenantId diferente"; "não registra o contexto quando o tenantId diverge" | `decisao-workflow.aggregate.test.ts` | PASS |
| 8 | Mesmo `tenantId` vindo de mais de um upstream é idempotente, nunca diverge | Unit | "aceita o mesmo tenantId vindo de mais de um upstream" | `decisao-workflow.aggregate.test.ts` | PASS |
| 9 | Coluna `tenant_id` nullable persiste corretamente quando ausente no 1º save e chega em save posterior | Integração (Postgres real) | "tenantId ausente no primeiro save é persistido e recarregado quando um upstream posterior o traz" | `tests/.../infrastructure/persistence/drizzle-decisao-workflow.repository.test.ts` | PASS |
| 10 | Coluna `tenant_id` permanece `null`/`undefined` quando os 3 upstreams nunca o trazem | Integração (Postgres real) | "tenantId ausente em todos os 3 upstreams é persistido e recarregado como undefined" | idem #9 | PASS |
| 11 | `onConflictDoUpdate` nunca regride `tenant_id` já persistido para `null` | Unit + Integração | `tenantIdPayload !== undefined` guarda o `set`; cenário #9 confirma end-to-end contra Postgres real | `drizzle-decisao-workflow.repository.ts` (leitura de código) + teste #9 | PASS |
| — | `grep -rn tenantId src/bounded-contexts/orquestracao/application/` não vazio | Estático | grep direto | shell | PASS (12 ocorrências) |
| — | Regressão: suíte completa do monorepo | Unit+Integração+Contrato | suíte inteira | `npx vitest run` | PASS (176/176 arquivos, 1077/1077 testes) |
| — | Tipos e lint | Estático | `tsc --noEmit`, `eslint .` | shell | PASS (0 erros) |
| — | Migração `drizzle/0019` aplica sem erro contra Postgres real | Integração | `npx drizzle-kit migrate` | shell | PASS |

## Cobertura (arquivos de produção do escopo T044a, `--coverage.include='src/bounded-contexts/orquestracao/**'`)

| Arquivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `consolidar-e-decidir-workflow.ts` | 100% | 93.3% | 100% | 100% |
| `orcamento-classificado-event.acl.ts` (infra) | 94.4% | 95.5% | 100% | 94.4% |
| `orcamento-extraido-event.acl.ts` (infra) | 92.7% | 93.8% | 100% | 91.7% |
| `orcamento-validado-event.acl.ts` (infra) | 95.5% | 96.9% | 100% | 95.5% |
| `drizzle-decisao-workflow.repository.ts` | 100% | 94.2% | 100% | 100% |
| `decisao-workflow.schema.ts` | 50% | — | 0% | 57.1% |

Branch não coberto em `consolidar-e-decidir-workflow.ts` (linha 117):
exaustividade do `switch (decisao.acao)` em `criarEventoDesfecho` —
inatingível em teste unitário por construção do union `AcaoRoteamento`
(TypeScript já garante exaustividade em tempo de compilação; não é lacuna de
risco de negócio). `decisao-workflow.schema.ts` mede baixo por ser
majoritariamente DDL/`check` declarativo, exercitado indiretamente pela
migração aplicada com sucesso e pelos 2 testes de integração (#9/#10) que
escrevem e leem a coluna nova.

## Limitações de ambiente

- Suíte com `--coverage` tornou `sanitizar-conteudo-documento.test.ts`
  (pré-existente, spec 001/T028, commit `d797e85`, não tocado por esta PR)
  instável por overhead de instrumentação v8 numa asserção de timing
  (`< 200ms`, observado 231ms). Sem `--coverage`, a suíte completa passa
  176/176 — não é regressão desta mudança, não bloqueia o gate.
- Sem outras limitações: Postgres real disponível e migrado, `DATABASE_URL`
  setado, testes de integração executados (não skipados).

## Bugs encontrados

Nenhum.

## Parecer final

**APROVADO PELO QA**

Os 3 critérios de aceite centrais da issue #650 (extração+propagação nas 3
ACLs até os eventos de saída; ausência nunca rejeitada; divergência lança
`TenantIdDivergenteError` fail-fast) estão cobertos por cenário positivo e
negativo dedicados, todos passando. `grep` de confirmação não vazio (12
ocorrências). `tsc --noEmit`, `eslint .` e suíte completa (176/176, 1077/1077,
sem "expected fail" novo) limpos. Nenhum defeito em aberto.

Próxima ação obrigatória: dev-back-end segue com o próprio fluxo de merge da
PR #653 / fechamento da issue #650 (review humana, labels etc.) — QA não
executa merge nem fecha issue.
