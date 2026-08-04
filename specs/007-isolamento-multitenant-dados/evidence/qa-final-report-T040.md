# QA Final Report — T040 (tenantId nos Domain Events de 002)

## SPEC_ID e versão testada
- SPEC_ID: `007-isolamento-multitenant-dados`
- PR: #630, branch `feat/582-tenantid-eventos-002`, commit `7085e35` (HEAD),
  base `main`.
- Issue: #582. Primeira validação (não é reteste).

## Resumo executivo
T040 adiciona `readonly tenantId?: string` (opcional, expand/contract) ao
envelope `DomainEventEnvelope` e aos 2 eventos de domínio de `extracao`
(`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`).
`schemaVersion` mantido em `1` de propósito, mesmo padrão de T014/T015 —
tornar obrigatório quebraria os call sites de `extrair-dados-orcamento.ts` e
`confirmar-revisao-humana-extracao.ts`, que ainda não preenchem o campo.
Suíte completa, typecheck e lint limpos; nenhuma regressão; nenhum defeito de
produção.

## Requisitos cobertos
- `tenantId?: string` presente no envelope e nos 2 eventos de `extracao` —
  confirmado por leitura do diff e por teste automatizado novo (ver seção
  Testes criados/alterados).
- `schemaVersion` inalterado (`= 1 as const`) — confirmado (teste existente
  `domain-events.test.ts` continua verde sem alteração de asserção).
- Nenhum call site de produção afetado: `extrair-dados-orcamento.ts` e
  `confirmar-revisao-humana-extracao.ts` continuam instanciando os 2 eventos
  com 3 argumentos posicionais (`orcamentoId`, `itens`,
  `condicoesComerciais`); `tenantId` fica `undefined` e `ocorreuEm` continua
  usando o default `new Date()` — confirmado por grep nos 2 únicos call
  sites de produção e por teste.

## Testes criados/alterados
- `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` —
  cobertura ampliada para o novo campo opcional (lacuna identificada: os
  testes existentes não asseravam `tenantId`). Adicionados, para os 2
  eventos que ganharam o parâmetro:
  - `tenantId ausente por padrão (compatibilidade com sites de emissão
    atuais)` — instancia sem `tenantId` e confirma `undefined`.
  - `tenantId presente é preservado quando informado` — instancia com
    `tenantId` e confirma valor preservado e `schemaVersion` ainda `1`.
  - Total do arquivo: 3 → 7 testes (4 novos; `ExtracaoEscalonadaParaRevisaoHumana`
    não ganhou `tenantId` nesta PR, então não recebeu os 2 casos novos).

## Suítes executadas e comandos
```
source ~/.nvm/nvm.sh && nvm use 24
cd /home/victor1090/Documentos/Labs/wt-582-eventos-extracao
npm run typecheck
npx vitest run
npx vitest run tests/bounded-contexts/extracao/domain/events/domain-events.test.ts
npx eslint tests/bounded-contexts/extracao/domain/events/domain-events.test.ts
```

## Resultado
- Baseline pré-mudança (mesma sessão, antes de editar o teste): **157 arquivos
  passaram, 19 skip (176 total)** — **909 testes passaram, 1 expected fail, 99
  skip (1009 total)**.
- Pós-mudança (com os 4 testes novos): **157 arquivos passaram, 19 skip (176
  total)** — **913 testes passaram, 1 expected fail, 99 skip (1013 total)** —
  delta de +4 testes, exatamente os adicionados; nenhuma regressão, nenhum
  arquivo de teste a mais ou a menos passou a falhar/skipar.
- `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`
  (T011, `it.fails`) continua **1 expected fail** nas duas execuções — não
  virou verde por causa desta mudança. Nenhum "expected to fail but passed"
  relatado pelo Vitest.
- `npm run typecheck`: sem erros.
- `npx eslint` no arquivo de teste alterado: sem erros.

## Cobertura
Não medida com `--coverage` isoladamente para este diff (repositório não tem
threshold de cobertura configurado para bloquear PR, conforme observado nos
ciclos anteriores desta mesma spec — T007/T014/T015). O parâmetro `tenantId`
em si, que antes não tinha nenhuma asserção dedicada, passou a ter cobertura
positiva (presente) e negativa (ausente) nos 2 eventos afetados. Nenhuma
redução de cobertura ou threshold existente.

## Allure
Não gerado neste ambiente — mesma incompatibilidade `allure-vitest`/`vitest@4.x`
já registrada em `qa-final-report-T007.md`/`qa-final-report-T014.md`/
`qa-final-report-T015.md` (bug de ambiente pré-existente, não introduzido por
este diff). Execução e resultado obtidos via reporter default do Vitest.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos criados/alterados por este QA
- `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts`
  (4 testes novos cobrindo `tenantId` ausente/presente)
- `specs/007-isolamento-multitenant-dados/qa/traceability-matrix.md` (seção
  T040 adicionada)
- `specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T040.md`
  (este arquivo)

Nenhum arquivo de produção foi alterado por este QA.

## Riscos residuais
- Mesmo risco expand/contract já registrado em T014/T015: enquanto `tenantId`
  for opcional, nenhum caso de uso de `extracao` o propaga ainda; mitigado
  pelo teste de contrato T011 (RED por desenho) e pelo ADR-008 (cutover
  único). Não é risco novo introduzido por T040.

## Limitações do ambiente
- Suítes de integração Postgres seguem skip por ausência de `DATABASE_URL`
  local (comportamento esperado, mesmo padrão de ciclos anteriores).
- Allure não gerado (ver seção acima).

## Parecer final
**APROVADO PELO QA**
