# QA Final Report — T044a (issue #650, PR #653)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados (tocando o BC de spec-005, Orquestração)
- Branch: `feat/650-wiring-tenantid-005`
- Commit: `e4f72de` (HEAD no momento do handoff, confirmado)
- Comparado com: base `df19fad` ([003] T041/#649, já mergeada)
- Tipo: primeira validação (não é reteste — nenhum BUG anterior)

## Resumo executivo
Wiring de `tenantId` nas 3 ACLs de entrada do BC Orquestração
(`OrcamentoClassificadoEventACL`, `OrcamentoExtraidoEventACL`,
`OrcamentoValidadoEventACL`), propagação até o agregado `DecisaoWorkflow` e
até os 5 eventos de saída publicados por `ConsolidarEDecidirWorkflow`.
Ausência de `tenantId` nunca é rejeitada (expand/contract, ADR-008).
Divergência entre dois `tenantId` concretos de upstreams diferentes lança
`TenantIdDivergenteError` (Domain), fail-fast antes de qualquer mutação de
contexto — verificado em teste dedicado (`decisao-workflow.aggregate.test.ts`):
nem `contextoValidacao` nem `tenantId` são alterados quando a divergência
ocorre. Nova coluna `tenant_id` (uuid, nullable) em `decisoes_workflow` via
`drizzle/0019` — o `onConflictDoUpdate` só inclui `tenantId` no `set` quando
conhecido (`tenantIdPayload !== undefined`), nunca regride um valor já
persistido para `null`; comportamento coberto por 2 testes de integração
contra Postgres real (tenantId chega em save posterior; tenantId nunca chega
em nenhum dos 3 upstreams).

Sem defeito de produção encontrado. Nenhum bug reportado.

## Requisitos cobertos (issue #650)
- tenantId extraído nas 3 ACLs de entrada e propagado até os eventos de saída — coberto e passando (unit tests das 3 ACLs + `consolidar-e-decidir-workflow.test.ts`, cenário "propaga tenantId consolidado do agregado ao evento de desfecho publicado").
- Comportamento definido e testado para tenantId ausente — coberto (ACLs: "nunca rejeita quando tenantId está ausente"; aggregate: "permanece undefined quando nenhum upstream traz tenantId"; aggregate: "tenantId ausente num upstream posterior nunca sobrescreve o já consolidado"; repository: 2 testes de integração).
- Comportamento definido e testado para tenantId divergente entre os três upstreams — coberto (aggregate: "rejeita com TenantIdDivergenteError..." e "não registra o contexto quando o tenantId diverge — fail fast, nenhuma mutação parcial").
- `grep -rn tenantId src/bounded-contexts/orquestracao/application/` — não vazio: 12 ocorrências.
- `tsc --noEmit`, `eslint`, suíte completa limpos, sem "expected fail" novo — confirmado (ver Resultado).

## Suítes executadas e comandos
```
export PATH=".../scratchpad/node24/node-v24.9.0-linux-x64/bin:$PATH"
docker compose up -d postgres
set -a; source .env; set +a
npx drizzle-kit migrate
npx tsc --noEmit
npx eslint .
npx vitest run
```

## Resultado
- typecheck: 0 erros.
- lint: 0 erros/avisos.
- Suíte completa (`npx vitest run`, DATABASE_URL setado — testes de integração incluídos, não skipados): 176 arquivos, 1077 testes, **100% passando**, 0 fail, 0 skip.
- Migração `drizzle/0019_t650_decisoes_workflow_tenant_id.sql` aplicada sem erro contra Postgres real (porta 5433).

## Cobertura (medida sobre `src/bounded-contexts/orquestracao/**`, `npx vitest run --coverage`)
| Arquivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| Todos (orquestracao) | 97.48% | 96.59% | 95.76% | 97.66% |
| `consolidar-e-decidir-workflow.ts` | 100% | 93.3% (linha 117 não coberta: ramo `default`/exaustividade do switch de `criarEventoDesfecho`, inatingível por construção do union `AcaoRoteamento`) | 100% | 100% |
| `orcamento-classificado-event.acl.ts` (infra) | 94.4% | 95.4% | 100% | 94.4% |
| `orcamento-extraido-event.acl.ts` (infra) | 92.7% | 93.75% | 100% | 91.7% |
| `orcamento-validado-event.acl.ts` (infra) | 95.5% | 96.9% | 100% | 95.5% |
| `drizzle-decisao-workflow.repository.ts` | 100% | 94.2% | 100% | 100% |
| `decisao-workflow.schema.ts` | 50% (linhas não executáveis em teste unitário — DDL/`check`, exercitado indiretamente via migração + testes de integração) | — | — | — |

Nota: obtida rodando a suíte com `--coverage` excluindo
`sanitizar-conteudo-documento.test.ts` (ver "Limitações do ambiente" — teste
de timing pré-existente, não relacionado a esta PR, ficou instável só sob
overhead de instrumentação de cobertura). Sem instrumentação, a suíte
completa (176/176, 1077/1077) passa 100%.

Nenhum threshold de cobertura pré-existente configurado no projeto para este
BC — não há regressão a proteger. As linhas não cobertas nas 3 ACLs são
ramos de validação de shape já cobertos por outros casos de malformação
(mesmo padrão pré-existente às ACLs, não introduzido por esta mudança) —
risco residual baixo, não bloqueia o gate.

## Allure
`allure-vitest` já configurado no `vitest.config.ts` (reporter
`allure-vitest/reporter`, `resultsDir: "allure-results"`). `allure-results/`
gerado localmente pela execução da suíte completa (15485 arquivos
acumulados). Geração do relatório HTML via `npx allure generate` não
concluída neste ambiente (incompatibilidade de sintaxe da CLI `allure@3.14.3`
baixada via `npx` ad-hoc — não instalada como dependência do projeto); não
bloqueia o gate — os `allure-results` brutos são a evidência suficiente e o
CI (quando configurado) pode gerar o HTML.

## Bugs encontrados
Nenhum.

## Riscos residuais
- Enquanto os sites de emissão de 001/002/003 não preencherem `tenantId` no
  envelope real (ainda opcional, expand/contract), o campo chegará
  `undefined` nas 3 ACLs desta PR — comportamento intencional e coberto por
  teste, não é defeito. Cutover de contrato tornando `tenantId` obrigatório
  nos 4 BCs é escopo futuro (#632), fora desta issue.
- Linha 117 de `consolidar-e-decidir-workflow.ts` (branch de exaustividade do
  switch) não é alcançável em teste unitário por construção do tipo — risco
  classificado como "código inviável de testar sem refatoração de produção",
  não uma lacuna de risco de negócio.

## Limitações do ambiente
- Teste `tests/bounded-contexts/ingestao-identificacao/infrastructure/sanitizar-conteudo-documento.test.ts`
  (pré-existente, commit `d797e85`, spec 001, T028, não tocado por esta PR)
  é uma asserção de timing (`duracaoMs < 200`) que ficou instável **somente**
  quando a suíte roda sob instrumentação de cobertura (`--coverage`),
  observado como 231ms vs. limite de 200ms — overhead esperado de
  instrumentação v8, não regressão desta mudança. Sem `--coverage`, a suíte
  completa passa 176/176 (1077/1077), incluindo esse teste. Registrado como
  limitação de ambiente, não como bug desta PR — fora do escopo de
  correção do QA (não é código tocado por T044a).

## Parecer final
APROVADO PELO QA
