# QA Final Report — SPEC 003-validacao-consistencia-orcamentos

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch: `feat/003-validacao`, PR #414 (draft), base `main`
- Commits testados: `9ef6780` (estrutura de pastas), `743d43e` (tasks.md)
- Task: T001 (Fase Setup), issue #111
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
T001 é scaffolding puro: criação de 7 diretórios vazios (`.gitkeep`) do BC
Validação, sem código de domínio. Critério de aceite é estrutural, não
funcional. Verificação independente confirma estrutura conforme
`plan.md` § Structure Decision e ausência de regressão.

## 3. Requisitos cobertos e não cobertos
- Coberto: existência e localização das 7 pastas (`src/bounded-contexts/validacao/{domain,application,infrastructure,interface}`,
  `tests/bounded-contexts/validacao/{domain,application,contract}`) — verificado via `ls` e `git diff main..feat/003-validacao --stat`.
- Não aplicável nesta task: regra de negócio, contrato de API, segurança,
  idempotência, resiliência — T001 não introduz nenhum desses (sem código
  de produção). Matriz de rastreabilidade, coverage-baseline e test-plan
  formais não foram abertos para esta task por não haver comportamento
  executável a rastrear (0 linhas de lógica, 0 branches); reavaliar a
  partir da task que introduzir o primeiro código de domínio.

## 4. Suítes executadas e comandos
- `corepack pnpm run typecheck` → OK, sem erros.
- `corepack pnpm test` (suíte completa, vitest) → sem falhas.
- `corepack pnpm run lint` → OK, sem erros.

## 5. Quantidade de testes por tipo
Nenhum teste novo — T001 não introduz caso de uso testável. Suíte
executada é a regressão completa pré-existente (specs 001/002).

## 6. Resultado
- Aprovados: 142
- Falhos: 0
- Ignorados (skipped, pré-existentes de specs 001/002, não relacionados a esta task): 11
- Instáveis: 0
- Total de arquivos de teste: 31 passed, 2 skipped (33)

## 7. Cobertura inicial e final
Não medida separadamente: T001 não adiciona nem remove linha de código de
produção (apenas diretórios vazios com `.gitkeep`), logo statements,
branches, functions e lines do relatório de cobertura são idênticos antes
e depois desta task.

## 8. Allure
Não gerado. Não há caso de teste novo ou execução de comportamento para
anexar evidência de execução; Allure fica pendente da primeira task com
código de domínio.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
Nenhum risco funcional introduzido por T001. Risco a observar em tasks
futuras: nenhum lint/typecheck rule impede código dentro das pastas
recém-criadas — validar em T002+ quando o primeiro artefato de domínio for
adicionado.

## 11. Limitações do ambiente
- `gh` fora do PATH padrão (Bash) nesta worktree; não foi necessário
  consultar a API do GitHub para esta validação além de referências
  informadas pelo dev-back-end.
- `pnpm` executado via `corepack pnpm`, sem impacto no resultado.

## 12. Parecer final
APROVADO PELO QA

---

# QA Final Report — T004 (issue #114)

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR #422, branch `feat/003-t004-eventbridge-rule-validador-queue`, commit `c9cb206`
- Task: T004 (issue #114) — regra EventBridge `nexo-dominio-bus` → `validador-queue` (IaC)
- `backend-reviewer`: APPROVE, sem achados
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
T004 adiciona `events.Rule` em `ValidadorQueueStack` (`infra/lib/validador-queue-stack.ts`)
roteando `source: nexo.extracao` / `detail-type: OrcamentoExtraido,
OrcamentoExtraidoComPendenciaConfirmada` para a fila `validador-queue` já provisionada em T003
(#113, PR #421, mergeado). `infra/bin/app.ts` passa `dominioBus: dominioEventBusStack.dominioBus`
como prop (bus importado por referência, nunca recriado). Estrutura idêntica ao padrão já mergeado
em `extrator-queue-stack.ts` (regra `OrcamentoClassificado` → `extrator-queue`, PR #420) e
`classificador-queue-stack.ts`. Sem defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto: regra EventBridge no bus `nexo-dominio-bus`, `source: nexo.extracao`, dois
  `detail-type` (`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`), target
  `validador-queue` — verificado por leitura do código, `tsc --noEmit -p infra/tsconfig.json` e
  inspeção do template sintetizado (`cdk synth ValidadorQueueStack`).
- Template sintetizado confirma exatamente:
  - `AWS::Events::Rule` (`OrcamentoExtraidoParaValidadorQueue...`) com
    `EventPattern.source: ["nexo.extracao"]` e
    `EventPattern.detail-type: ["OrcamentoExtraido", "OrcamentoExtraidoComPendenciaConfirmada"]`;
  - `Targets[0].Arn` aponta via `Fn::GetAtt` para `ValidadorQueue6C91600B` (a fila `validador-queue`
    de T003), não uma fila nova;
  - contagem de recursos do stack: 2 `AWS::SQS::Queue` (fila + DLQ, ambas já existentes de T003,
    não recriadas), 1 `AWS::SQS::QueuePolicy` (gerada automaticamente pelo CDK para autorizar o
    target do Rule — efeito colateral esperado de `targets.SqsQueue`, não código manual), 1
    `AWS::Events::Rule`, 1 `AWS::CloudWatch::Alarm` (de T003, inalterado);
  - `0` recursos `AWS::Events::EventBus` no stack — confirma que o bus `nexo-dominio-bus` é
    importado por referência (`props.dominioBus`) e não recriado.
- `infra/bin/app.ts`: `dominioBus: dominioEventBusStack.dominioBus` passado a
  `ValidadorQueueStack`, coerente com o mesmo padrão usado por `ClassificadorQueueStack`.
- Não aplicável: contrato de API, autorização, idempotência de aplicação, handler Lambda — T004 é
  IaC pura, sem lógica de domínio nesta task (confirmado pelo escopo do dev-back-end).

## 4. Suítes executadas e comandos
Ambiente: Node 24.18.1 via `source ~/.nvm/nvm.sh && nvm use 24` (default do shell é 18.19.1,
incompatível — mesma limitação documentada em T003).

1. `corepack pnpm run typecheck:infra` (`tsc --noEmit -p infra/tsconfig.json`) → sem erros.
2. `corepack pnpm exec cdk synth ValidadorQueueStack --app "npx tsx infra/bin/app.ts"` → sintetiza
   sem erro; template inspecionado via script Node ad-hoc (ver seção 3).
3. `corepack pnpm run lint` (`eslint .`) → sem erros.
4. `git diff main..HEAD -- infra/ specs/.../tasks.md` → confirma escopo declarado pelo
   dev-back-end: apenas `infra/lib/validador-queue-stack.ts`, `infra/bin/app.ts` (produção) e
   checkbox de `tasks.md`. Nenhum arquivo `src/` alterado.

Nenhum teste automatizado novo criado: mudança é IaC pura, mesmo padrão de T003 (repositório não
tem testes de `aws-cdk-lib/assertions` para nenhum dos 3 stacks de fila — lacuna pré-existente e
uniforme, já registrada em T003, não agravada por esta task).

## 5. Quantidade de testes por tipo
Nenhum teste novo. Regressão: suíte Vitest completa não impactada (nenhum arquivo `src/`
alterado por esta task); não reexecutada nesta validação por não haver alteração no runtime da
aplicação — apenas `typecheck:infra`, `cdk synth` e `lint`, suficientes para o escopo IaC-only
declarado.

## 6. Resultado
- `typecheck:infra`: OK, 0 erros.
- `lint`: OK, 0 erros.
- `cdk synth ValidadorQueueStack`: OK, template sintetizado e validado conforme critério de aceite.
- Falhos: 0.

## 7. Cobertura inicial e final
Não aplicável — nenhum arquivo `src/` alterado por T004; cobertura de domínio/aplicação inalterada.
Stack CDK segue sem instrumentação de cobertura, mesma situação de T003.

## 8. Allure
Não gerado — mesma justificativa de T003: repositório não tem adaptador Allure configurado no
runner atual (Vitest); fora do escopo desta task alterar tooling de relatório sem ADR prévio.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Mesma lacuna já registrada em T003: nenhum dos 3 stacks de fila tem teste de
  `aws-cdk-lib/assertions`; nenhum teste hoje detectaria regressão no `EventPattern` ou no target
  do Rule por engano futuro. Não bloqueia esta entrega — dívida técnica de infra já sinalizada,
  não agravada por T004.
- `QueuePolicy` gerada automaticamente pelo CDK concede a `events.amazonaws.com` permissão de
  `sqs:SendMessage` na fila `validador-queue`, escopada por `aws:SourceArn` à Rule — comportamento
  padrão do CDK (`targets.SqsQueue`), idêntico ao usado pelos 2 stacks irmãos já mergeados; sem
  risco novo.

## 11. Limitações do ambiente
Node 18 é o default do shell; exige `nvm use 24` manual antes de `cdk synth`/testes, mesma
limitação documentada em T003 pelo dev-back-end.

## 12. Parecer final
APROVADO PELO QA

---

# QA Final Report — T008 (issue #118)

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch `feat/003-validacao`, commit `5919889`, PR #431 (draft)
- Task: T008 (issue #118) — Domain VOs `DadosExtraidosParaValidacao`, `ItemParaValidacao`, `TentativaValidacao`
- `backend-reviewer`: APPROVE (2 achados MINOR não bloqueantes, ambos aceitos: `DadosExtraidosParaValidacao` não valida coerência cruzada `periodoValidade`/`dataEmissaoProposta` — escopo de T010, comentário já referencia)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
T008 adiciona 3 VOs imutáveis do BC Validação: `DadosExtraidosParaValidacao` (payload
traduzido de `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`, valida
lista de itens não vazia e `dataEmissaoProposta` válida), `ItemParaValidacao`
(valida `descricao` não vazia e `quantidade > 0`; preserva `extraido: boolean` e
`categoria` opcional), `TentativaValidacao` (entrada de histórico append-only,
valida invariante `resultado` × `inconsistencias.length` e `timestamp` válido).
Sem defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto: critério de aceite da task — VOs preservam `extraido: boolean` do item
  de origem (`item-para-validacao.vo.test.ts`, caso "aceita item completo" com
  `extraido: true` e caso "aceita item sem categoria" com `extraido: false`);
  decisão de negócio (item com pendência confirmada ainda pode reprovar regra de
  campo obrigatório) fica testável a partir daqui — a asserção da regra em si é
  T031/T019, fora do escopo de T008 (aqui só o VO existe e preserva o dado).
- Coberto: validações de domínio dos 3 VOs — sucesso e falha para cada regra
  (itens vazio, data inválida, descrição vazia, quantidade ≤ 0, invariante
  resultado/inconsistências, timestamp inválido).
- Não aplicável nesta task: coerência cruzada `periodoValidade` ×
  `dataEmissaoProposta` (achado MINOR do backend-reviewer, escopo de T010),
  agregado `OrcamentoValidacao` (T009, ainda não implementado), regras de
  consistência (T010), contrato de API, segurança, resiliência — T008 é Domain
  VO puro, sem infraestrutura nem caso de uso.

## 4. Suítes executadas e comandos
1. `corepack pnpm vitest run tests/bounded-contexts/validacao/domain/value-objects/`
   → 10 arquivos, 37 testes, 0 falhas.
2. `corepack pnpm vitest run tests/bounded-contexts/validacao/domain/value-objects/ --coverage`
   (escopo `src/bounded-contexts/validacao/domain/value-objects/**`) → ver seção 7.
3. `corepack pnpm typecheck` (`tsc --noEmit`, repositório inteiro) → 0 erros.
4. `corepack pnpm eslint` nos 3 arquivos de produção + 3 arquivos de teste de T008
   → 0 erros.

## 5. Quantidade de testes por tipo
Unitários (Domain VO): 10 testes novos relacionados a T008 (4 de `ItemParaValidacao`,
3 de `DadosExtraidosParaValidacao`, 3 de `TentativaValidacao`) — criados pelo
dev-back-end. Suíte completa do diretório (incluindo VOs de T005–T007): 37 testes.

## 6. Resultado
- Aprovados: 37
- Falhos: 0
- Ignorados: 0
- Instáveis: 0

## 7. Cobertura inicial e final
Escopo: `src/bounded-contexts/validacao/domain/value-objects/**` (todas as VOs do
BC até aqui, T005–T008).
- Statements: 97.16% (103/106)
- Branches: 94.33% (50/53)
- Functions: 93.18% (41/44)
- Lines: 97.14% (102/105)
Os 3 arquivos de T008 (`dados-extraidos-para-validacao.vo.ts`,
`item-para-validacao.vo.ts`, `tentativa-validacao.vo.ts`) aparecem com 100% no
relatório (nenhuma linha listada em "Uncovered Line #s" para eles). As lacunas
residuais (`dinheiro.vo.ts` 80%, `periodo-validade.vo.ts` 85.71%) são de VOs de
T005, pré-existentes a esta task, não introduzidas nem agravadas por T008 —
registradas como risco residual, não bloqueiam este gate.

## 8. Allure
Não gerado — repositório não tem adaptador Allure configurado no runner Vitest
(mesma lacuna já registrada em T001/T004; fora do escopo desta task alterar
tooling de relatório sem ADR prévio).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Cobertura de `dinheiro.vo.ts` (80% linha/75% branch) e `periodo-validade.vo.ts`
  (85.71% linha) pré-existente de T005, não coberta por esta validação de T008 —
  sinalizar para quando essas VOs forem revisitadas.
- `DadosExtraidosParaValidacao` não valida coerência cruzada entre
  `periodoValidade` e `dataEmissaoProposta` — aceito como escopo de T010 (regra
  de "coerência de prazo de validade"), não é lacuna de T008.
- T009 (agregado `OrcamentoValidacao`) ainda não implementado — a decisão de
  negócio "campo com pendência confirmada ainda reprova regra obrigatória"
  (T031) só é testável de ponta a ponta a partir daí; T008 apenas garante que o
  dado (`extraido`) chega intacto ao VO.

## 11. Limitações do ambiente
- `pnpm` fora do PATH padrão do Bash desta worktree; executado via
  `corepack pnpm`, sem impacto no resultado.

## 12. Parecer final
APROVADO PELO QA
