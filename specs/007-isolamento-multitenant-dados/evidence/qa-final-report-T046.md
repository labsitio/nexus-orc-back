# QA Final Report — T046 (issue #632, PR #655)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados
- Branch: `feat/632-contract-tenantid-obrigatorio`
- Commit: `a2fc3aa` (HEAD, draft)
- Base: `main`
- Tipo: primeira validação (não é reteste — nenhum BUG anterior)

## Resumo executivo
Cutover de contract do ADR-008 (decisão 4): `tenantId` obrigatório e
`schemaVersion: 2` fechados nos Domain Events de 001/002/003/005, numa PR
única e atômica, sem estado misto v1/v2. 004 (busca-indexacao) fora de
escopo funcional — só um comentário de doc atualizado, confirmado por diff.
As 4 ACLs cross-BC (`validacao/infrastructure/orcamento-extraido-event.acl.ts`
e as 3 de `orquestracao/infrastructure/orcamento-*-event.acl.ts`) passam a
rejeitar em runtime qualquer evento sem `tenantId`. Achado MAJOR do
backend-reviewer (tenantId da reentrega divergente sobrescrevendo o
persistido em `validar-orcamento.ts`) corrigido no commit `a2fc3aa` e coberto
por teste de regressão dedicado.

QA encontrou e fechou, sem tocar produção, um gap real de cobertura: os 3
guards de fail-fast desta PR (`OrcamentoValidacaoSemTenantIdError`,
`ExtracaoSemTenantIdError`, `DecisaoWorkflowSemTenantIdError`) estavam com
0% de cobertura — nenhum teste os disparava. Adicionados 3 testes de
regressão (1 por guard, ver traceability-matrix-T046.md). Sem defeito de
produção encontrado. Nenhum bug reportado.

## Requisitos cobertos (7 critérios de aceite da issue #632)
Ver `specs/007-isolamento-multitenant-dados/qa/traceability-matrix-T046.md`
— os 7 critérios, um a um, todos **PASSA**, com comando/evidência executado
pelo QA.

## Suítes executadas e comandos
```
export PATH=".../scratchpad/node24/node-v24.9.0-linux-x64/bin:$PATH"
docker compose up -d postgres   (já rodando, confirmado via docker compose ps)
set -a; source .env; set +a
npx drizzle-kit migrate
npx tsc --noEmit
npx eslint .
npx vitest run
npx vitest run --coverage --coverage.include='src/bounded-contexts/{ingestao-identificacao,extracao,validacao,orquestracao}/**'
```

## Resultado
- typecheck (`tsc --noEmit`): 0 erros.
- lint (`eslint .`): 0 erros/avisos.
- Suíte completa (`npx vitest run`, `DATABASE_URL` setado — nada skipado
  além de `describe.skipIf(!DATABASE_URL)`, todos executados): **176
  arquivos, 1069 testes, 100% passando**, 0 fail, 0 skip inesperado.
  (176/1066 na primeira execução do QA, antes dos 3 testes adicionados;
  176/1069 após.)
- 66/66 testes das 4 ACLs cross-BC citadas nos critérios de aceite,
  incluindo os 4 cenários de rejeição por `tenantId` ausente.

## Cobertura (medida sobre os 4 BCs em escopo, `npx vitest run --coverage`)
| Métrica | Antes dos 3 testes do QA | Depois |
|---|---|---|
| Statements | 96.62% | 96.92% |
| Branches | 93.22% | 93.50% |
| Functions | 94.06% | 94.57% |
| Lines | 96.82% | 97.13% |

`tenant.errors.ts` de `validacao/` e `extracao/` (antes 0% stmts/funcs) agora
100% cobertos. Nenhum threshold de cobertura pré-existente configurado no
projeto para estes BCs — não há regressão a proteger; a melhora acima é
estritamente por adição de cenário de risco real (guard de fail-fast),
consistente com a prioridade "risco > percentual".

Lacunas residuais documentadas (baixo risco, não bloqueiam o gate):
- 2 segundos pontos de lançamento dos mesmos guards (endpoints humanos de
  002/003 — `registrar-decisao-humana-validacao.ts:142`,
  `confirmar-revisao-humana-extracao.ts:326`) permanecem sem teste dedicado;
  mesmo padrão já comprovado funcional no site irmão testado nesta
  validação — classificado como duplicata de padrão já coberto, não como
  gap de comportamento não verificado.
- Linhas de DDL/schema (`*.schema.ts`, ~50-62%) não executáveis em teste
  unitário — exercitadas indiretamente via migração real + testes de
  integração/schema contra Postgres, padrão pré-existente ao escopo desta PR.

## Allure
`allure-vitest` já configurado no `vitest.config.ts`
(`resultsDir: "allure-results"`). `allure-results/` gerado localmente pela
execução da suíte completa. Geração do relatório HTML via `npx allure
generate` não executada nesta validação (mesma limitação de ambiente já
registrada em validações anteriores desta spec — CLI `allure` não é
dependência do projeto); não bloqueia o gate — os `allure-results` brutos são
evidência suficiente.

## Bugs encontrados
Nenhum defeito de produção. O gap de cobertura dos 3 guards foi fechado
diretamente pelo QA (arquivos de teste, sem tocar produção) — não configura
BUG, é responsabilidade de automação de teste.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos alterados pelo QA (apenas teste, nenhuma produção)
- `tests/bounded-contexts/validacao/application/validar-orcamento.test.ts`
- `tests/bounded-contexts/extracao/application/extrair-dados-orcamento.test.ts`
- `tests/bounded-contexts/orquestracao/application/consolidar-e-decidir-workflow.test.ts`

## Riscos residuais
- Ver seção "Cobertura" acima (2 pontos de guard duplicados sem teste
  dedicado, padrão já coberto).
- Zero tenant real em produção e zero Lambda implantada (mesma base de
  decisão do ADR-008) — o cutover direto sem suporte dual v1/v2 permanece
  seguro hoje; se isso mudar antes de qualquer BC novo publicar evento, a
  ausência de suporte dual precisa ser reavaliada pelo Arquiteto.

## Limitações do ambiente
Nenhuma nova. Ambiente local com Postgres (porta 5433) e Node 24 (via
scratchpad, PATH prependado só nesta sessão) permitiu execução completa da
suíte sem skip relevante.

## Parecer final
APROVADO PELO QA
