# Matriz de rastreabilidade — T042 (issue #584, PR #643)

Branch `feat/584-tenantid-acl-004`, commit `de60936` (worktree
`/home/victor1090/Documentos/Labs/wt-584-acl-tenant`, indisponível durante a
sessão de QA a partir de certo ponto — ver Limitações; validado via clone
isolado do mesmo commit).

Escopo: `OrcamentoValidadoEventACL` (porta em
`domain/gateways/orcamento-validado-event.acl.ts`, adaptador em
`infrastructure/orcamento-validado-event.acl.ts`) extrai e valida `tenantId`
do envelope produzido por 003 (validação), consumido por 004
(busca-indexação). Decisão de design do dev-back-end: 003 publica
`tenantId?: string` opcional (fase expand, T041); a ACL de 004 rejeita
explicitamente qualquer evento sem `tenantId` ou com `tenantId` malformado,
em vez de indexar sem isolamento de tenant.

Suíte completa reexecutada nesta validação (worktree + clone isolado,
resultado idêntico): **922 passando**, 0 falhas, 99 skipped (integração
Postgres/pgvector real — sem banco disponível neste ambiente, pré-existente,
não introduzido por esta PR). Baseline informada (main): 920 passando, 0
expected fail. Delta: **+2 testes** (os dois cenários novos da ACL abaixo),
nenhum `it.fails`/`it.skip` novo introduzido, nenhuma regressão.

## Matriz

| # | Requisito / critério de aceite | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|---|
| 1 | Evento com `tenantId` válido (UUID v7) é traduzido corretamente, resultado expõe `tenantId: TenantId` | Unit | `payloadValido()` com `tenantId` UUID v7 válido | `tests/.../infrastructure/orcamento-validado-event.acl.test.ts` (já existente, ampliado com asserção de `resultado.tenantId`) | PASS |
| 2 | Evento **sem** `tenantId` é rejeitado com erro tipado (`OrcamentoValidadoEventACLInvalidaError`), não indexa, não lança exceção genérica | Unit | `payloadValido({ tenantId: undefined })` | `tests/.../infrastructure/orcamento-validado-event.acl.test.ts` (teste novo, dev-back-end) | PASS |
| 3 | Evento com `tenantId` **malformado** (não UUID v7) é rejeitado com erro tipado (`TenantIdInvalidoError`, Shared Kernel) | Unit | `payloadValido({ tenantId: 'não-é-uuid' })` | `tests/.../infrastructure/orcamento-validado-event.acl.test.ts` (teste novo, dev-back-end) | PASS |
| 4 | Type guard estrutural não confunde "campo ausente" com "shape errado": `tenantId` `undefined` passa o guard, `traduzir` decide rejeitar | Unit | `ehOrcamentoValidadoPayloadBruto` aceita payload sem `tenantId`; `traduzir` rejeita em seguida | mesmo arquivo acima, cenário #2 cobre a cadeia completa | PASS |
| 5 | Consumidores do resultado da ACL (`IndexarOrcamento`) recebem `tenantId: TenantId` no contrato de fixture/fake | Unit | `montarCaso()` inclui `tenantId: TENANT_ID` no `aclResultado` | `tests/.../application/indexar-orcamento.test.ts` (ajuste dev-back-end) | PASS |
| 6 | Teste de integração (T029, gate #190/ADR-008) segue fornecendo `tenantId` diretamente a `IndexarOrcamento.executar`, sem inventar contrato novo; payload de fixture da ACL real inclui `tenantId` porque a ACL agora rejeita sem ele | Integração (skip sem DB) | `payloadOrcamentoValidadoDeTeste` com `tenantId: TENANT_ID.toString()` | `tests/.../application/indexar-orcamento.integration.test.ts` (ajuste dev-back-end) | SKIP (sem `DATABASE_URL` neste ambiente — pré-existente, fora do escopo desta task) |
| — | Regressão: suíte completa do monorepo | Unit+Integração+Contrato | suíte inteira | `npm test` (worktree e clone isolado, resultado idêntico) | PASS (922/922, 99 skipped por ambiente) |
| — | Tipos e lint dos arquivos alterados | Estático | `tsc --noEmit`, `eslint` nos 5 arquivos de produção/teste alterados | `npm run typecheck`, `npx eslint <arquivos>` (clone isolado) | PASS (zero erros/avisos) |

## Cobertura (arquivos de produção do escopo T042)

Isolando os 2 arquivos de produção alterados via
`vitest run --coverage --coverage.include=...` contra a suíte da ACL:

| Arquivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `orcamento-validado-event.acl.ts` (infrastructure) | 100% | 100% | 100% | 100% |
| `orcamento-validado-event.acl.ts` (domain/gateways — apenas tipos, sem lógica executável) | — | — | — | — |

Nenhuma lacuna de cobertura no escopo desta task.

## Limitações de ambiente

- O worktree indicado
  (`/home/victor1090/Documentos/Labs/wt-584-acl-tenant`) foi removido do
  disco durante esta sessão de QA (provável limpeza por outro processo
  paralelo, já que há 4 agentes trabalhando na mesma spec 007). A suíte,
  `typecheck` e `lint` já haviam sido executados com sucesso no worktree
  antes do desaparecimento; para confirmar de forma independente, refiz a
  validação inteira (suíte, `typecheck`, `lint`, cobertura isolada) em um
  clone limpo do commit `de60936` a partir do repositório local — resultado
  idêntico em ambas as execuções. Não bloqueia o parecer.
- 99 testes skipped são integração Postgres/pgvector real (sem banco
  disponível neste ambiente) — pré-existentes, incluem o cenário #6 desta
  matriz (T029/T042 integração); não pertencem ao escopo de T042 e não
  bloqueiam este parecer, conforme já registrado em traceability-matrix-T017.md
  para lacunas equivalentes.
- Cutover verdadeiro de `tenantId` obrigatório em 003 (produtor) é rastreado
  como pendência separada (issue #632), fora do escopo de T042. Enquanto 003
  não preencher `tenantId` em todos os sites de emissão, qualquer evento real
  publicado sem o campo será rejeitado por esta ACL — comportamento
  intencional documentado no código, não um bug.

## Bugs encontrados

Nenhum. A ACL extrai e valida `tenantId` corretamente nos três cenários do
critério de aceite (válido / ausente / malformado), com erros tipados e
distintos (`OrcamentoValidadoEventACLInvalidaError` para ausência,
`TenantIdInvalidoError` do Shared Kernel para formato inválido), sem
exceção genérica em nenhum caminho.

## Parecer final

**APROVADO PELO QA**

Critérios de aceite do escopo T042 cobertos e passando (evento válido
traduzido corretamente; evento sem `tenantId` rejeitado com erro tipado;
evento com `tenantId` malformado rejeitado com erro tipado). Nenhum defeito
em aberto. Suíte completa 922/922 (0 falhas, +2 em relação à baseline de
920, nenhum expected fail novo). Cobertura 100% nos arquivos de produção
alterados. `typecheck` e `lint` limpos.

Testes alterados nesta PR (todos pelo dev-back-end, revisados e reexecutados
por QA — nenhuma alteração de teste feita por este QA, pois a suíte entregue
já cobria os três cenários do critério de aceite):
- `tests/bounded-contexts/busca-indexacao/infrastructure/orcamento-validado-event.acl.test.ts`
- `tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.test.ts`
- `tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.integration.test.ts`

Próxima ação obrigatória: dev-back-end segue com merge da PR #643 /
fechamento da issue #584 conforme seu próprio fluxo (labels, PR review
humana, etc.) — isso libera #585 e #190 conforme informado. QA não executa
merge nem fecha issue.

Nota de processo (não bloqueante): os artefatos
`specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T042.md` e
o próprio `traceability-matrix-T042.md` já vieram escritos pelo dev-back-end
no diff desta PR — isso é atividade fora do papel do dev-back-end (QA é
quem produz e assina esses artefatos). Este documento é a validação
independente do QA e substitui/confirma o conteúdo entregue; recomenda-se ao
dev-back-end não gerar artefatos de QA em PRs futuras, para evitar
conflito de autoria e falso senso de gate já fechado.
