# QA Final Report — T015 (tenantId nos Domain Events de 001)

## SPEC_ID e versão testada
- SPEC_ID: `007-isolamento-multitenant-dados`
- PR: #629, branch `feat/278-tenantid-eventos`, commits `ad6c19c` + `cb99bf9`
- Issue: #278. Primeira validação (não é reteste).

## Resumo executivo
T015 adiciona `readonly tenantId?: string` (opcional, expand/contract) ao envelope
`DomainEventEnvelope` e aos 4 eventos de domínio de `ingestao-identificacao`
(`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`,
`OrcamentoReclassificadoPorRevisaoHumana`). `schemaVersion` mantido em `1` de
propósito, mesmo padrão de T014/#277 — tornar obrigatório quebraria a build de
#279/#280/#281, que ainda não preenchem o campo. Suíte completa, typecheck e lint
limpos; nenhuma regressão; nenhum defeito de produção.

## Requisitos cobertos
- `tenantId?: string` presente no envelope e nos 4 eventos — confirmado por leitura
  do diff e por instanciação manual com serialização JSON (ver seção Resultado).
- `schemaVersion` inalterado (`= 1 as const`) nos 4 eventos e no envelope — confirmado.
- Opcionalidade deliberada nesta PR (expand/contract, para não quebrar a compilação
  de #279/#280/#281) — decisão de escopo já registrada em `tasks.md` (T015, T034/#297,
  confirmação de zero tenant real em produção) e no corpo da PR; não é lacuna.

## Lacunas (fora do escopo desta PR, não bloqueiam T015)
- T016-T018 (propagação obrigatória de `tenantId` via `TenantContext` em
  `ReceberOrcamento`, validação em `ClassificarOrcamento`/`ConfirmarRevisaoHumana`/
  `ConsultarStatusOrcamento`, `DrizzleOrcamentoRepository` tenant-scoped) — tasks
  subsequentes da mesma spec, ainda não implementadas. Nenhum caso de uso hoje
  popula `tenantId` ao construir os eventos (confirmado por grep nos 4 call sites
  de produção) — esperado, é o próprio desenho expand/contract.
- Nenhum teste automatizado novo asserta a presença de `tenantId` no payload dos
  4 eventos (os testes existentes não foram alterados, conforme escopo declarado).
  Verificação desta PR foi feita por inspeção + instanciação manual (`tsx`), não por
  teste persistido no repositório — risco baixo, dado que o campo ainda não é
  consumido por nenhum caso de uso; recomenda-se que a asserção de payload venha
  junto da PR de wiring (#279/#280/#281 ou T016-T018), quando o campo passar a ter
  efeito observável de fato.
- Achado de atenção (não bloqueante): `tenantId` foi inserido na posição do
  construtor antes de `ocorreuEm` nos 4 eventos, deslocando a assinatura posicional.
  Nenhum call site atual quebra (nenhum passa `ocorreuEm` explicitamente), e o
  TypeScript acusaria erro de tipo (`Date` vs `string`) se algum dia alguém
  invertesse os argumentos por engano. Registrado na matriz de rastreabilidade
  como ponto de atenção para as PRs de wiring subsequentes.

## Ponto crítico verificado: teste RED por desenho não virou verde
`tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`
(`it.fails`, T011/#274) continua RED após esta mudança, como esperado — depende de
#280/#281 (agregado carregar `tenantId` real do repositório e validação no
controller), fora do escopo desta PR. Execução isolada e execução completa
confirmam: nenhum "expected to fail but passed" foi relatado pelo Vitest.

## Suítes executadas e comandos
```
source ~/.nvm/nvm.sh && nvm use 24
cd /home/victor1090/Documentos/Labs/wt-278-eventos-tenant
npx vitest run
npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/events/domain-events.test.ts \
  tests/bounded-contexts/ingestao-identificacao/infrastructure/eventbridge.publisher.test.ts \
  tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts \
  tests/bounded-contexts/ingestao-identificacao/application/classificar-orcamento.integration.test.ts
npx tsc --noEmit
npx eslint src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.ts \
  src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.ts \
  src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.ts \
  src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.ts \
  src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-reclassificado-revisao-humana.event.ts
npx tsx -e "instancia OrcamentoRecebido com tenantId e verifica JSON.stringify"
```

## Resultado
- Suíte completa: **157 arquivos passaram, 19 skip (176 total)** — **909 testes
  passaram, 1 expected fail, 99 skip (1009 total)** — idêntico ao baseline
  conhecido antes desta mudança. Nenhuma regressão.
- Subset dos 4 arquivos de teste relacionados a este diff: **16 passed | 1 expected
  fail** — o `it.fails` de `tenant-isolation.test.ts` continua expected fail, não
  virou verde.
- `npx tsc --noEmit`: sem novos erros. Erros pré-existentes em `src/dev/`
  (`@aws-sdk/client-sqs` ausente) confirmados como não relacionados a este diff.
- `npx eslint` nos 5 arquivos do diff: sem erros.
- Instanciação manual (`tsx`) de `OrcamentoRecebido('orc-1', 'PORTAL_WEB', {...},
  undefined, 'tenant-abc')` → `JSON.stringify` retorna
  `{"orcamentoId":"orc-1","canal":"PORTAL_WEB","referenciaBruta":{...},
  "tenantId":"tenant-abc","detailType":"OrcamentoRecebido","schemaVersion":1,
  "ocorreuEm":"..."}` — `tenantId` presente, `schemaVersion` = 1. Critério de
  aceite confirmado no nível de código.

## Cobertura
Não medida com `--coverage` isoladamente para este diff: as 4 classes de evento já
estavam cobertas pelos testes existentes (`domain-events.test.ts`,
`eventbridge.publisher.test.ts`), que continuam passando sem alteração. O parâmetro
`tenantId` em si (branch novo) não tem asserção dedicada — ver lacuna registrada
acima. Nenhuma redução de cobertura ou threshold existente.

## Allure
Não gerado neste ambiente — mesma incompatibilidade `allure-vitest`/`vitest@4.x`
já registrada em `qa-final-report-T007.md`/`qa-final-report-T014.md` (bug de
ambiente pré-existente, não introduzido por este diff). Execução e resultado
obtidos via reporter default do Vitest.

## Bugs encontrados
Nenhum defeito de produção. A opcionalidade de `tenantId` e a manutenção de
`schemaVersion: 1` são decisão de estratégia (expand/contract, ADR-008) já
documentada em código, em `tasks.md` (T015, T034/#297) e no corpo da PR #629.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos criados/alterados por este QA
- `specs/007-isolamento-multitenant-dados/qa/traceability-matrix.md` (seção T015 adicionada)
- `specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T015.md` (este arquivo)

Nenhum arquivo de produção foi alterado por este QA. Os 5 arquivos do diff
(`domain-event.ts` + 4 eventos) e o commit de metadado (`cb99bf9`, apenas
`tasks.md`) já estavam prontos antes desta validação.

## Riscos residuais
- Enquanto `tenantId` for opcional nos eventos (até a PR de contrato que endurece
  #279/#280/#281 simultaneamente, ADR-008), qualquer site de construção de evento
  que esqueça de propagar `tenantId` compila silenciosamente sem o campo. Mitigado
  pelo teste de contrato T011, que segue RED até T017/T018 fecharem a validação em
  tempo de execução — não é risco novo introduzido por T015, é o próprio desenho
  expand/contract já acordado.
- Inserção de `tenantId` antes de `ocorreuEm` na posição do construtor (ver achado
  de atenção acima) — risco residual baixo, mitigado pelo typechecker; atenção
  recomendada nas PRs de wiring subsequentes.

## Limitações do ambiente
- Suítes de integração Postgres seguem skip por ausência de `DATABASE_URL` local
  (comportamento esperado, mesmo padrão de ciclos anteriores).
- Allure não gerado (ver seção acima).

## Parecer final
**APROVADO PELO QA**
