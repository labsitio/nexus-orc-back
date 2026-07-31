# QA Final Report — T004/T005 (spec-009-otimizacao-custo-operacional)

## 1. SPEC_ID e versão testada
- SPEC_ID: 009-otimizacao-custo-operacional
- Branch: feat/009-otimizacao-custo
- Commit: ba72484
- PR: https://github.com/labsitio/nexus-orc-back/pull/435 (draft)

## 2. Resumo executivo
T004 entrega o VO `AssinaturaEstrutural` (string opaca, validação de formato
SHA-256 hex 64 chars minúsculo, sem lógica de cálculo). Teste de produção já
escrito pelo dev-back-end cobre criação válida, 7 casos de malformação
(`it.each`) e igualdade por valor. Suíte 100% verde, cobertura de linha do
arquivo 100% em todas as métricas. Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto: "rejeita string vazia/malformada com erro de domínio" (tasks.md L29) — 7/7 casos malformados lançam `AssinaturaEstruturalInvalidaError` (subclasse de `ErroDominio`).
- Coberto (implícito ao VO): criação válida e `equals` por valor.
- Fora de escopo de T004 (não avaliado aqui): cálculo do hash a partir do output do MarkItDownConversaoACL + Canal — pertence a T010.

## 4. Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.test.ts --coverage`
- `npx vitest run tests/bounded-contexts/ingestao-identificacao/domain tests/bounded-contexts/extracao/domain` (regressão de domínio)
- `npx vitest run` (regressão completa do repo)
- `npx eslint <arquivo novo> <teste novo>`

## 5. Quantidade de testes por tipo
- Unitário (domínio): 9 (1 positivo, 7 negativos via `it.each`, 1 de igualdade)

## 6. Resultado
- Suíte da task: 9/9 passed.
- Regressão de domínio (ingestao-identificacao + extracao): 113/113 passed, 23 arquivos.
- Regressão completa do repo: 215/245 testes passed, 3 failed, 27 skipped; 10 arquivos falhando — todos em infraestrutura/interface (AWS SDK, pino, aws-lambda ausentes no worktree), nenhum em domínio, nenhum relacionado ao diff de T004. Ver qa/test-execution-report.md para lista completa.

## 7. Cobertura inicial e final
- Não há coverage-baseline.md prévio para spec-009 (primeira validação de QA da spec).
- Final (arquivo da task): statements 100%, branches 100%, functions 100%, lines 100% (`coverage/coverage-summary.json`).

## 8. Allure
- `allure-results/` gerado localmente via `allure-vitest/reporter` (já configurado em `vitest.config.ts`), 9 result-files, sem dado sensível.
- HTML não renderizado localmente (CLI `allure` não instalada no worktree); publicação de relatório fica a cargo do CI, conforme já configurado.

## 9. Bugs por severidade e status
Nenhum bug aberto nesta rodada.

## 10. Riscos residuais
- Falhas de infraestrutura na suíte completa (AWS SDK/pino/aws-lambda ausentes) são um risco de ambiente conhecido e já declarado pelo dev-back-end; não bloqueiam T004 mas seguem pendentes para quem validar as tasks que dependem dessas dependências (T008–T011).
- Nit de nomenclatura do reviewer (arquivo `assinatura-estrutural.ts` sem sufixo `.vo.ts`, diferente do padrão dos demais VOs do BC) é cosmético, não afeta comportamento nem cobertura; registrado aqui para rastreabilidade, decisão de manter ou padronizar cabe ao dev-back-end/tech lead.

## 11. Limitações do ambiente
- `npm run typecheck` completo falha por dependências não instaladas (pré-existente, não introduzido por este diff).
- Geração do HTML do Allure depende de CLI externa não presente no worktree local.

## 12. Parecer final (T004)
APROVADO PELO QA

---

# QA — T005 (spec-009)

## 1. SPEC_ID e versão testada
- SPEC_ID: 009-otimizacao-custo-operacional
- Branch: feat/009-otimizacao-custo-t005
- Commit: d9185d5
- PR: https://github.com/labsitio/nexus-orc-back/pull/438 (draft)

## 2. Resumo executivo
T005 entrega o VO `SinalCacheIdentificacao` (`{ assinatura: AssinaturaEstrutural,
resultadoAnterior: ResultadoClassificacao, ultimaConfirmacaoEm: Date }`), construído
via factory estático `criar`, seguindo o mesmo padrão de `AssinaturaEstrutural`
(construtor privado + factory). Rejeita `ultimaConfirmacaoEm` inválida com
`SinalCacheIdentificacaoInvalidoError` (subclasse de `ErroDominio`), conforme
critério de aceite. Teste já escrito pelo dev-back-end cobre caso feliz e o único
caminho de rejeição especificado. Nenhum defeito de produção encontrado.
backend-reviewer já aprovou (APPROVE) sem achados bloqueantes.

## 3. Requisitos cobertos e não cobertos
- Coberto: shape do VO (`assinatura`, `resultadoAnterior`, `ultimaConfirmacaoEm`) exposto e imutável (campos `readonly`).
- Coberto: construção via factory estático (`SinalCacheIdentificacao.criar`), sem construtor público, alinhado ao padrão dos demais VOs do BC.
- Coberto: "rejeitando data inválida com erro de domínio próprio" — `SinalCacheIdentificacaoInvalidoError`.
- Fora de escopo de T005 (não avaliado aqui): validação interna de `assinatura`/`resultadoAnterior` — já é responsabilidade dos VOs correspondentes, não duplicada aqui (decisão de design correta, evita validação redundante).
- Fora de escopo de T005: consumo do VO pelo `CacheIdentificacaoGateway` (T006) e pelo caso de uso `ClassificarOrcamento` (Phase 3/US1).

## 4. Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts`
- `npx vitest run --coverage --coverage.reporter=json-summary tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts`
- `npx vitest run --reporter=default` (regressão completa do repo)
- `npx eslint <arquivo novo> <teste novo>`
- `npx tsc --noEmit`

## 5. Quantidade de testes por tipo
- Unitário (domínio): 2 (1 positivo, 1 negativo)

## 6. Resultado
- Suíte da task: 2/2 passed.
- Regressão completa do repo: 249/276 testes passed, 0 failed, 27 skipped (skips pré-existentes de integração com banco/infra, não relacionados a este diff), 55 arquivos passed / 6 skipped.

## 7. Cobertura inicial e final
- Não há coverage-baseline.md prévio isolando T005 (task nova, arquivo novo).
- Final (arquivo da task): statements 100%, branches 100%, functions 100%, lines 100% (`coverage/coverage-summary.json`, chave `sinal-cache-identificacao.ts`).

## 8. Allure
- Reporter `allure-vitest` falha ao rodar sem `--reporter=default` (bug pré-existente do adaptador neste repo, já confirmado por outros agentes) — `allure-results/` não gerado nesta rodada. Limitação de ambiente, não bloqueia o gate (T005 não tem requisito ligado a Allure).

## 9. Bugs por severidade e status
Nenhum bug aberto nesta rodada.

## 10. Riscos residuais
- Bug pré-existente no reporter `allure-vitest` (`Vitest failed to find the runner`) impede evidência Allure automatizada em qualquer task deste repo até ser corrigido — risco de ferramenta de QA, não de produto; fora da autoridade deste agente (ajuste de config de teste seria aceitável, mas está fora do escopo desta validação pontual).

## 11. Limitações do ambiente
- `allure-results/` não gerado (ver item 8).

## 12. Parecer final (T005)
APROVADO PELO QA

---

# QA — T007 (spec-009)

## 1. SPEC_ID e versão testada
- SPEC_ID: 009-otimizacao-custo-operacional
- Branch: feat/009-otimizacao-custo-t007
- Commit: f1be263
- PR: https://github.com/labsitio/nexus-orc-back/pull/442

## 2. Resumo executivo
T007 estende `DomainEventEnvelope` (BC Ingestão & Identificação) com o campo
opcional `readonly prioridade?: 'PADRAO' | 'LOTE_BAIXA_PRIORIDADE'`. Mudança
puramente aditiva em uma `interface` TypeScript: nenhum evento novo, nenhuma
alteração nos 4 eventos concretos existentes (`OrcamentoRecebido`,
`OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`,
`OrcamentoReclassificadoPorRevisaoHumana`). Teste novo (adicionado pelo
dev-back-end) confirma, via `describe.each` sobre os 4 eventos, que
`evento.prioridade` é `undefined` quando o campo não é informado — satisfaz
literalmente o critério de aceite "payload sem o campo continua válido
(default implícito PADRAO)". `tsc --noEmit` confirma que o campo opcional não
quebra nenhum call-site existente (compatibilidade estrutural garantida pelo
compilador). Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto: campo `prioridade` aditivo e opcional na interface do envelope.
- Coberto: "payload sem o campo continua válido (default implícito PADRAO)" — validado para os 4 eventos concretos existentes.
- Coberto (regressão): shape prévio do envelope (`detailType`, `schemaVersion`, `orcamentoId`, `ocorreuEm`) inalterado.
- Fora de escopo de T007 (não avaliado aqui): uso efetivo de `prioridade` para roteamento de fila de baixa prioridade — pertence a tasks posteriores (US3, ADR-009-003) ainda não implementadas.
- Observação de rastreabilidade (não bloqueante): a descrição de T007 em `tasks.md` menciona "5 eventos já definidos em 001", mas o BC possui 4 classes de evento concretas (`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`, `OrcamentoReclassificadoPorRevisaoHumana`). Todas as 4 foram exercitadas pelo teste. Divergência textual em `tasks.md`, não em código; fora da autoridade deste agente (não altera `tasks.md`) — registrado para quem mantém a spec (arquiteto/Tech Lead) avaliar se é apenas erro de redação.

## 4. Suítes executadas e comandos
- `npx tsc --noEmit`
- `npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/events --reporter=default`
- `npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/events/domain-events.test.ts --reporter=default --coverage --coverage.reporter=json-summary`
- `npx vitest run --reporter=default` (regressão completa do repo)

## 5. Quantidade de testes por tipo
- Unitário (domínio, contrato do envelope): 8 (4 eventos × [1 caso de shape existente + 1 caso de `prioridade` ausente])

## 6. Resultado
- Suíte da task: 8/8 passed.
- Regressão completa do repo: 262/289 testes passed, 0 failed, 27 skipped (skips pré-existentes de integração com banco/infra, não relacionados a este diff), 56 arquivos passed / 6 skipped. As 3 falhas de timeout reportadas pelo dev-back-end (contract/auth) não reproduziram nesta rodada — consistentes com flakiness sob paralelismo, não com regressão do diff.

## 7. Cobertura inicial e final
- `domain-event.ts` (interface type-only): 0/0 em todas as métricas (100% trivial, sem statement executável).
- Os 4 eventos concretos que implementam o envelope: 100% statements/branches/functions/lines cada, inalterado em relação ao estado anterior a T007 (ver qa/coverage-final.md).

## 8. Allure
- Mesmo bug pré-existente do adaptador `allure-vitest` já registrado em T005 (`Error: Vitest failed to find the runner`), reproduzido nesta rodada independente do diff. Contornado com `--reporter=default`; `allure-results/` não gerado. Limitação de ambiente, não bloqueia o gate (T007 não tem requisito ligado a Allure).

## 9. Bugs por severidade e status
Nenhum bug aberto nesta rodada.

## 10. Riscos residuais
- Mesmo bug pré-existente do reporter `allure-vitest` já registrado em T004/T005 — risco de ferramenta de QA, não de produto.
- Divergência textual em `tasks.md` ("5 eventos" vs. 4 eventos concretos existentes) — ver item 3; não é defeito de código, registrado apenas para rastreabilidade.

## 11. Limitações do ambiente
- `allure-results/` não gerado (ver item 8).
- `node_modules` precisou ser reinstalado (`npm install`) neste worktree antes da execução — já resolvido pelo dev-back-end antes da entrega a este QA.

## 12. Parecer final (T007)
APROVADO PELO QA
