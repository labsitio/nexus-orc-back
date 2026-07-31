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

# QA — T006 (spec-009)

## 1. SPEC_ID e versão testada
- SPEC_ID: 009-otimizacao-custo-operacional
- Branch: feat/009-otimizacao-custo-t006
- Commit: eec0db2
- PR: https://github.com/labsitio/nexus-orc-back/pull/440 (draft)

## 2. Resumo executivo
T006 entrega a interface `CacheIdentificacaoGateway` (contrato puro, sem implementação —
implementação DynamoDB é T010, fora de escopo). Assinatura confere exatamente com
tasks.md L31: `buscar(assinatura: AssinaturaEstrutural): Promise<SinalCacheIdentificacao | null>`
e `registrar(assinatura: AssinaturaEstrutural, resultado: ResultadoClassificacao): Promise<void>`.
`backend-reviewer` já aprovou (APPROVE, sem achados). Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto: assinatura do contrato conforme tasks.md L31 (verificação por leitura + `tsc --noEmit`).
- Fora de escopo de T006 (não avaliado aqui): implementação DynamoDB (T010), tratamento
  de erro throttle/timeout (responsabilidade da implementação, não do contrato), injeção
  de dependência (T018), testes de comportamento do caso de uso (T012–T015).

## 4. Suítes executadas e comandos
- `npx tsc --noEmit -p .`
- `npx eslint src/bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.ts`
- `npx vitest run --reporter=default` (regressão completa do repo)

## 5. Quantidade de testes por tipo
- Nenhum teste novo. Interface pura sem lógica executável — nenhum comportamento a
  exercitar nesta task (ver justificativa em qa/test-execution-report.md).

## 6. Resultado
- Typecheck: sem erros.
- Lint: sem erros/warnings.
- Regressão completa do repo: 285 testes (258 passed, 27 skipped pré-existentes),
  0 falhas, 62 arquivos (56 passed, 6 skipped). Os dois testes citados pelo dev-back-end
  como flaky por timeout (`upload-url.controller.test.ts`, `auth-cognito.middleware.test.ts`)
  passaram nesta execução, sem instabilidade observada.

## 7. Cobertura inicial e final
- Não aplicável: interface `type`-only não gera bytecode instrumentável, não aparece
  em `coverage/coverage-summary.json`. Verificação de conformidade feita por typecheck
  e revisão de assinatura, não por cobertura de execução.

## 8. Allure
- Mesma limitação pré-existente do adaptador `allure-vitest` já registrada em T005
  (`Vitest failed to find the runner` sem `--reporter=default`). Não bloqueia o gate.

## 9. Bugs por severidade e status
Nenhum bug aberto nesta rodada.

## 10. Riscos residuais
- Nenhum risco novo introduzido. Risco de contrato ficar desalinhado com a futura
  implementação (T010) é mitigado por `tsc` ao compilar `DynamoCacheIdentificacaoGateway`
  contra esta interface quando T010 for implementada.

## 11. Limitações do ambiente
- Bug pré-existente do reporter `allure-vitest` (ver item 8), já conhecido e sem
  impacto no gate desta task.

## 12. Parecer final (T006)
APROVADO PELO QA
