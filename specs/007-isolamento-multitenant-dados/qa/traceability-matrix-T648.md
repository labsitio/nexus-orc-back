# QA — Rastreabilidade T648 (issue #648, BC 002 — Extração)

Wiring de `tenantId` (opcional, pré-#632): evento de entrada `OrcamentoClassificado`
até os 3 eventos de saída de 002 (`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`,
`ExtracaoEscalonadaParaRevisaoHumana`).

- SPEC_ID: 007-isolamento-multitenant-dados
- Issue: #648
- PR: #651 (draft), branch `feat/648-wiring-tenantid-002`
- Commit testado: `1402ee7` — "[002] T648: wiring de tenantId — extração até os 3 eventos de saída"
- Worktree: `/home/victor1090/Documentos/Labs/wt-648-wiring-002`
- Tipo de validação: primeira validação (não é reteste)

## Ambiente

- Node 24 (via nvm), `DATABASE_URL=postgresql://nexo:nexo@localhost:55648/nexo`
  (Postgres real de teste, migração 0017 já aplicada).
- `tsc --noEmit`: limpo.
- `eslint` nos arquivos alterados do diff `main...HEAD`: limpo, 0 warnings/erros.
- `vitest run --passWithNoTests`: **176 arquivos, 1044 testes, 0 falha** (baseline
  main = 1026; +18 testes novos desta issue — bate com o esperado).
- Nenhum `it.skip`/`test.fails`/marcador de "expected fail" novo encontrado em
  `tests/bounded-contexts/extracao/`.

## Matriz de rastreabilidade

| Critério de aceite (#648) | Cenário | Arquivo/caso | Resultado |
|---|---|---|---|
| tenantId extraído do envelope de entrada | envelope com `tenantId` válido → extraído como `TenantId`, propagado ao caso de uso | `tests/bounded-contexts/extracao/interface/extrator-queue.handler.test.ts::"extrai tenantId do envelope e o propaga como TenantId ao caso de uso"` | PASS |
| tenantId propagado ao agregado na criação | `ExtrairDadosOrcamento.executar` com `tenantId` → agregado criado e persistido com o valor | `tests/bounded-contexts/extracao/application/extrair-dados-orcamento.test.ts::"propaga tenantId do params para o agregado criado e para OrcamentoExtraido publicado"` | PASS |
| tenantId propagado a `OrcamentoExtraido` | evento publicado carrega `tenantId` do agregado | idem acima + `confirmar-revisao-humana-extracao.test.ts::"propaga o tenantId já presente no agregado para OrcamentoExtraido publicado"` | PASS |
| tenantId propagado a `OrcamentoExtraidoComPendenciaConfirmada` | idem, caminho de pendência confirmada humana | `confirmar-revisao-humana-extracao.test.ts::"...para OrcamentoExtraidoComPendenciaConfirmada publicado"` | PASS |
| tenantId propagado a `ExtracaoEscalonadaParaRevisaoHumana` | evento emitido no caminho de escalonamento carrega `extracao.tenantId` (código em `extrair-dados-orcamento.ts:118`); cenário sem confiança suficiente já cobertos por testes preexistentes de escalonamento, ver observação abaixo | `extrair-dados-orcamento.test.ts` (testes de escalonamento preexistentes, sem assert direto de `tenantId` no evento) | PARCIAL — ver observação |
| tenantId ausente no envelope → propagado como `undefined`, nunca rejeitado | envelope sem `tenantId` → handler não falha, `params.tenantId === undefined` | `extrator-queue.handler.test.ts::"tenantId ausente no envelope é propagado como undefined — nunca rejeitado"` | PASS |
| tenantId ausente no caso de uso → agregado e evento sem tenantId | `ExtrairDadosOrcamento.executar(PARAMS_BASE)` sem tenantId | `extrair-dados-orcamento.test.ts::"tenantId ausente é propagado como undefined — nunca rejeitado"` | PASS |
| tenantId malformado (não UUID v7) no envelope → falha tratada como erro genérico (batch item failure, sem `Error` especial) | envelope com `tenantId: 'nao-e-um-uuid'` → `executar` não chamado, `batchItemFailures` reporta o item | `extrator-queue.handler.test.ts::"reporta falha (batch item failure) quando tenantId presente é malformado"` | PASS |
| tenantId imutável no agregado (nunca sobrescrito) | `atualizarTenantId()` sempre lança `TenantIdImutavelError`; retry com tenantId divergente no caso de uso não sobrescreve o valor já persistido | `extracao-orcamento.aggregate.test.ts::"atualizarTenantId sempre lança erro de domínio"` + `extrair-dados-orcamento.test.ts::"retry com tenantId divergente nunca sobrescreve..."` | PASS |
| Persistência: coluna `tenant_id` nullable, roundtrip correto | schema tem `is_nullable = 'YES'`; salvar/recarregar preserva tenantId presente e ausente | `extracao-orcamento.schema.test.ts` (assert de `information_schema.columns`) + `drizzle-extracao-orcamento.repository.test.ts::"roundtrip do tenantId opcional"` e `"...persistido e recarregado como undefined"` | PASS |
| `grep -rn tenantId src/bounded-contexts/extracao/application/` não vazio | executado: 8 ocorrências (`extrair-dados-orcamento.ts`, `confirmar-revisao-humana-extracao.ts`) | comando reproduzido nesta validação | PASS |
| tsc/eslint/suíte completa limpos, sem `expected fail` novo | ver seção Ambiente | — | PASS |

### Observação sobre `ExtracaoEscalonadaParaRevisaoHumana`

O código de produção propaga `extracao.tenantId?.toString()` corretamente para
o evento de escalonamento (`extrair-dados-orcamento.ts:118`, mesma linha de
raciocínio dos outros dois eventos, confirmada por leitura do diff e por `tsc`
não reclamar de assinatura). Porém não encontrei um teste que instancie esse
caminho especificamente **com** `tenantId` presente e assira
`evento.tenantId` no evento de escalonamento — os testes existentes de
escalonamento (preexistentes, não tocados nesta PR) não passam `tenantId`.
Como o mecanismo de propagação é o mesmo objeto (`extracao.tenantId`) já
testado no caminho `OrcamentoExtraido`/`ConfirmarRevisaoHumanaExtracao`, o
risco residual é baixo (mesma linha de código, sem lógica condicional
adicional), mas fica registrado como lacuna de teste — não como defeito.
Não bloqueia o gate: não há branch/decisão nova nesse trecho que um teste
adicional pudesse capturar além do que já está coberto pelo padrão
`extracao.tenantId?.toString()` testado nos outros 2 eventos.

## Decisão de arquitetura (ACL vs. parse inline) — revisão

A PR documenta e justifica em comentário extenso no handler (`extrator-queue.handler.ts`)
a escolha de extrair `tenantId` inline, sem ACL nova — porque 002 nunca teve
ACL de tradução cross-BC (diferente de 003/005), e o envelope já mapeia 1:1
para `ExtrairDadosOrcamentoParams`. Coerente com YAGNI e com o precedente de
`classificador-queue.handler.ts` (spec 001, #280). Avaliado como decisão
razoável e devidamente registrada no código (satisfaz "decisão justificada na
PR" do critério de aceite).

## Decisão de comportamento para tenantId ausente/divergente — revisão

Decisão do dev (documentada em comentário no agregado e no caso de uso):
nunca rejeitar; ausência propagada como `undefined`; divergência em retry
nunca sobrescreve o valor já persistido (tenantId imutável). Diferente do
padrão AUSENTE/DIVERGENTE de 001 (#640) porque `ExtracaoOrcamento` é sempre
*criado* no caminho da fila — nunca há estado pré-existente de outro tenant
para divergir de fato; a única forma de "divergência" é retry contra um
agregado já criado pelo mesmo fluxo, tratado como no-op seguro (imutabilidade)
em vez de erro. Testado explicitamente (`"retry com tenantId divergente nunca
sobrescreve..."`). Avaliado como consistente com o resto do código e com o
racional exposto — não há ACL nem estado cross-tenant real em jogo aqui.

## Cobertura de código (indicador auxiliar)

Não foi executado relatório de cobertura dedicado (`vitest --coverage`) nesta
validação — o gate desta issue está baseado na suíte completa (176/176
arquivos, 1044/1044 testes) e na matriz de rastreabilidade por critério de
aceite acima, que é a prioridade real. Se necessário para o relatório
consolidado da spec 007, rodar `npx vitest run --coverage` separadamente.

## Bugs encontrados

Nenhum defeito de produção encontrado. Nenhum BUG-XXX aberto para esta issue.

## Riscos residuais

- Lacuna de teste direto para `tenantId` em `ExtracaoEscalonadaParaRevisaoHumana`
  (ver observação acima) — risco baixo, mesma linha de propagação já testada
  nos outros 2 eventos.
- `tenantId` continua opcional em toda a cadeia até a #632 tornar obrigatório
  nos 4 BCs — por design (expand/contract, ADR-008), não é lacuna desta issue.

## Parecer

APROVADO PELO QA
