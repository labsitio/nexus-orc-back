# QA — T049 métrica "percentual de orçamentos sem status consultável"

## SPEC_ID e versão testada

SPEC_ID: 001-ingestao-classificacao-orcamentos

PR #764, branch `feat/54-metrica-status-consultavel`, commit `9e41e202cbf87ce8a6120f86fbaf3fa03432113d`.

Primeira validação (não é reteste). Backend-reviewer: APPROVE WITH NITS, corrigidos no commit acima.

## Resumo executivo

Métrica EMF `OrcamentoSemStatusConsultavel` emitida em `GET /v1/orcamentos/:id/status`
somente quando `TenantDivergenciaError.motivo === 'AUSENTE'` (agregado existe mas
`tenantId` ausente — anomalia real). Não emitida no motivo `DIVERGENTE` (cross-tenant,
acesso corretamente negado — não é falta de status consultável, é status pertencente
a outro tenant). Comportamento confere com o critério do spec.md linha 267-269.

## Suítes executadas e comandos

```
npx vitest run --reporter=default tests/bounded-contexts/ingestao-identificacao
npx vitest run --reporter=default tests/bounded-contexts/ingestao-identificacao/contract/status.controller.test.ts
npx tsc --noEmit
npx eslint src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.ts src/bounded-contexts/ingestao-identificacao/interface/http/status.controller.ts tests/bounded-contexts/ingestao-identificacao/contract/status.controller.test.ts
```

## Resultado

- BC completo: 38 arquivos passaram, 215 testes passaram, 20 pulados (skipIf sem
  `DATABASE_URL`, esperado localmente — ver CLAUDE.md), 0 falha.
- `status.controller.test.ts` isolado: 9/9 (inclui os 2 testes novos de T049).
- `tsc --noEmit`: sem erro.
- `eslint` nos 3 arquivos tocados: sem violação.

## Verificação do critério de aceite (item 1 do pedido)

Lido `src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.ts`:
`TenantDivergenciaError` agora carrega `motivo: 'AUSENTE' | 'DIVERGENTE'`.
`AUSENTE` → `!orcamento.tenantId` (agregado sem tenant, ADR-011, estado hoje
inesperado). `DIVERGENTE` → `tenantId` diverge do solicitante (cross-tenant).

Em `status.controller.ts`, o `catch` só chama `emitirMetrica(...)` quando
`erro instanceof TenantDivergenciaError && erro.motivo === 'AUSENTE'`. Isso é
exatamente o que o spec pede: "orçamento sem status consultável" é o orçamento
estruturalmente quebrado, não o orçamento de outro tenant que teve o acesso
negado por design.

## Verificação do formato EMF (item 2)

`emitirMetrica` (`infrastructure/observability/metrica.ts`) grava, via pino,
uma linha JSON com `_aws.CloudWatchMetrics[0]` = `{ Namespace, Dimensions, Metrics }`
e `Metrics[0]` = `{ Name, Unit }`. Confirmado nos dois testes novos:
`Namespace: 'Nexo/IngestaoIdentificacao'`, `Metrics: [{ Name: 'OrcamentoSemStatusConsultavel', Unit: 'Count' }]`.
Inspecionável sem AWS — reaproveita o logger pino já existente, sem SDK novo,
sem permissão IAM nova (ADR-016).

## Cobertura dos dois motivos pelos testes de contrato (item 3)

- "emite métrica EMF ... quando ... tenantId do agregado está ausente" —
  reconstitui `Orcamento` com `tenantId: undefined`, chama a rota, confere
  404 e a linha de log com a métrica presente e no shape correto.
- "NAO emite metrica ... quando o motivo e DIVERGENTE" — orçamento de
  `outroTenant`, solicitante autenticado como `tenantIdTeste`, confere 404 e
  ausência da linha de métrica.

Os dois cenários existem e exercitam exatamente os dois ramos do `if` novo.

## Regressão (item 4)

Nenhuma. Suíte completa do BC `ingestao-identificacao` passou (215/215 não
pulados). `TenantDivergenciaError` é uma classe local a este arquivo — outros
BCs (`extracao`, `validacao`, `orquestracao`) e outros casos de uso do mesmo BC
(`confirmar-revisao-humana.ts`, `classificar-orcamento.ts`) definem suas
próprias classes homônimas, não afetadas pela mudança de assinatura deste
arquivo. `tsc --noEmit` limpo confirma que nenhum outro call site quebrou.

## Cobertura

Não medida (`pnpm test` com cobertura quebra no path com espaço desta máquina,
mesmo problema do `allure-vitest` documentado no CLAUDE.md). Os 2 branches
novos (`AUSENTE` / `DIVERGENTE`) estão cobertos por teste dedicado a cada um —
ver seção anterior. Rodar cobertura no CI (Linux) é a única forma confiável
aqui; não bloqueia o gate porque o critério funcional já está coberto por
teste determinístico e a suíte roda verde no CI da PR.

## Allure

Não configurado neste repositório (sem adaptador Allure na stack Vitest
atual). Evidência desta rodada é a saída do Vitest acima, reproduzível.

## Riscos residuais / limitações

- Sem medição de cobertura local (ver acima) — mitigado por CI verde e pelos
  2 testes de branch dedicados.
- Sem verificação em CloudWatch real (LocalStack não modela CloudWatch Logs
  Insights/EMF) — aceito, ADR-016 já documenta a decisão de emitir via linha
  de log estruturado inspecionável sem AWS.

## Parecer final

APROVADO PELO QA
