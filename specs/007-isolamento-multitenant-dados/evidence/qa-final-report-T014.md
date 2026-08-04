# QA Final Report — T014 (tenantId no agregado Orcamento)

## SPEC_ID e versão testada
- SPEC_ID: `007-isolamento-multitenant-dados`
- PR: #627, branch `feat/277-tenantid-agregado`, commit `3285164`
- Issue: #277. Primeira validação (não é reteste).

## Resumo executivo
T014 adiciona `tenantId?: TenantId` (deliberadamente opcional, expand/contract),
getter `tenantId`, erro `TenantIdImutavelError` e método `atualizarTenantId(): never`
ao agregado `Orcamento`. O teste `orcamento-tenant.test.ts`, criado em T012 (#275)
como `it.fails` RED, foi promovido a `it()` GREEN nesta PR. Suíte completa,
typecheck e lint limpos; nenhuma regressão; nenhum defeito de produção.

## Requisitos cobertos
- `tenantId` carregado no agregado a partir de `Orcamento.receber(...)` — coberto.
- Imutabilidade pós-criação (`atualizarTenantId` sempre lança `TenantIdImutavelError`,
  mesmo padrão de `IndiceOrcamento` do BC Busca & Indexação) — coberto.
- Opcionalidade deliberada de `tenantId` nesta PR (expand/contract, para não quebrar
  a compilação de #279/#280/#281) — decisão de escopo confirmada com o dev-back-end
  antes desta validação; não é lacuna a reportar como bug, é escopo combinado.

## Lacunas (fora do escopo desta PR, não bloqueiam T014)
- T015-T018 (Domain Events com `tenantId`, `ReceberOrcamento` obrigatório via
  `TenantContext`, propagação/validação em `ClassificarOrcamento`/`ConfirmarRevisaoHumana`/
  `ConsultarStatusOrcamento`, `DrizzleOrcamentoRepository` tenant-scoped) — tasks
  subsequentes da mesma spec, ainda não implementadas.
- `tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`
  (T011, #274): cenário cross-tenant segue `it.fails` (RED por desenho) — depende
  de T017/T018, fora do escopo desta PR. Confirmado que é o único `it.fails` restante
  na suíte inteira e que não regrediu.

## Suítes executadas e comandos
```
source ~/.nvm/nvm.sh && nvm use 24
cd /home/victor1090/Documentos/Labs/wt-277-tenant-agregado
npx vitest run
npx vitest run tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts
npx vitest run --coverage
npx tsc --noEmit
npx eslint src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.ts \
  tests/bounded-contexts/ingestao-identificacao/domain/orcamento-tenant.test.ts
```

## Resultado
- Suíte completa: **157 arquivos passaram, 19 skip (176 total)** — **909 testes
  passaram, 1 expected fail, 99 skip (1009 total)**.
- `orcamento-tenant.test.ts` (T012/#275): 1/1 PASS, GREEN — não é mais `it.fails`.
- `tenant-isolation.test.ts` (T011/#274): 2 PASS + 1 expected fail (`it.fails`
  intencional, aguardando T017/T018) — comportamento correto, sem regressão.
- `npx tsc --noEmit`: sem erros.
- `npx eslint` nos 2 arquivos do diff: sem erros.
- Os 99 testes skip são os já conhecidos de ciclos anteriores desta spec
  (`describe.skipIf(!DATABASE_URL)`, suítes de integração Postgres sem banco
  disponível neste ambiente) — pré-existentes, não introduzidos por T014.

## Cobertura
Medida via `vitest run --coverage` (v8), escopo do arquivo alterado:
- `orcamento.aggregate.ts`: 91,89% statements/lines, 100% branches, 89,47% functions.
  Linhas não cobertas (111, 123, 131) são getters `referenciaExterna`/`resultadoAtual`/
  `historico`, pré-existentes e não tocados por este diff. O caminho de código
  adicionado por T014 (`_tenantId`, `get tenantId()`, `atualizarTenantId`,
  `TenantIdImutavelError`) está 100% coberto pelo teste promovido.

Cobertura do monorepo (`src/**`, referência, sem baseline formal específica de T014
por ser diff pequeno em arquivo já coberto): Statements 84,77%, Branches 80,99%,
Functions 81,18%, Lines 84,87%. Nenhuma redução de threshold existente.

## Allure
Não gerado neste ambiente — mesma incompatibilidade `allure-vitest`/`vitest@4.x`
já registrada em `qa-final-report-T007.md` (bug de ambiente pré-existente, não
introduzido por este diff). Execução e resultado obtidos via reporter default
do Vitest.

## Bugs encontrados
Nenhum defeito de produção. A opcionalidade de `tenantId` é decisão de estratégia
(expand/contract) documentada em código (comentários nas linhas 48-55 e 146-150 de
`orcamento.aggregate.ts`), na PR e na issue #277, e foi confirmada com o dev-back-end
antes desta validação — não é lacuna a reportar como bug.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos criados/alterados por este QA
- `specs/007-isolamento-multitenant-dados/qa/traceability-matrix.md` (seção T014 adicionada)
- `specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T014.md` (este arquivo)

Nenhum arquivo de produção ou de teste de produção foi alterado por este QA —
os 2 arquivos do diff (`orcamento.aggregate.ts`, `orcamento-tenant.test.ts`) já
tinham sido revisados e aprovados (com nits) pelo backend-reviewer antes desta
validação.

## Riscos residuais
- Enquanto `tenantId` for opcional (até a PR de contrato que endurece #279/#280/#281
  simultaneamente), qualquer site de construção de `Orcamento` que esqueça de
  propagar `tenantId` compila silenciosamente sem o campo. Mitigado pelo teste de
  contrato T011, que segue RED até T017/T018 fecharem a validação em tempo de
  execução — não é um risco novo introduzido por T014, é o próprio desenho
  expand/contract já acordado.

## Limitações do ambiente
- Suítes de integração Postgres seguem skip por ausência de `DATABASE_URL` local
  (comportamento esperado, mesmo padrão de ciclos anteriores).
- Allure não gerado (ver seção acima).

## Parecer final
**APROVADO PELO QA**
