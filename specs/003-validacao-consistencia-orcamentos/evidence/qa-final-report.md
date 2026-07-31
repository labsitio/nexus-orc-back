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

---

# QA Final Report — T009 (issue #119)

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch `feat/003-validacao`, commit `f1d0a46`, PR #450 (draft)
- Task: T009 (issue #119) — Domain: agregado `OrcamentoValidacao`
  (`orcamento-validacao.aggregate.ts`)
- `backend-reviewer`: APPROVE WITH NITS em duas rodadas — 1ª rodada MINOR
  (rótulo de histórico incorreto em `ACEITE_COM_RESSALVA`, corrigido no
  commit atual); 2ª rodada 1 NIT residual não bloqueante em
  `TentativaValidacao.de` (ver seção 10)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
T009 adiciona o agregado raiz `OrcamentoValidacao` com máquina de estados
`PENDENTE -> VALIDADO | PENDENTE_REVISAO_HUMANA -> VALIDADO |
VALIDADO_COM_RESSALVA`, histórico append-only via `TentativaValidacao`, e a
invariante não-negociável do Princípio IV: nunca existe segunda tentativa
automática a partir de `PENDENTE_REVISAO_HUMANA` — só `registrarDecisaoHumana`
reavalia. `dadosExtraidos` é imutável após criação (`atualizarDadosExtraidos`
sempre lança). Sem defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto (critério de aceite da task): "unit test que tenta forçar
  transição para VALIDADO com 1+ inconsistência pendente e espera erro de
  domínio" — teste "nunca transita para VALIDADO com inconsistência
  pendente" chama `avaliarRegrasDeConsistencia` uma segunda vez a partir de
  `PENDENTE_REVISAO_HUMANA` e espera `TransicaoInvalidaValidacaoError`;
  status permanece `PENDENTE_REVISAO_HUMANA` após a tentativa (efeito
  colateral também verificado, não só a exceção).
- Coberto: transição limpa `PENDENTE -> VALIDADO` (histórico com 1 entrada
  `VALIDADO`); `PENDENTE -> PENDENTE_REVISAO_HUMANA` com inconsistência(s)
  (histórico `INCONSISTENTE`); `registrarDecisaoHumana` com
  `CORRECAO_APLICADA` reavaliando para `VALIDADO` ou permanecendo em revisão
  humana se ainda falhar (nunca autoaprova); `ACEITE_COM_RESSALVA` terminal
  (`VALIDADO_COM_RESSALVA`, histórico preserva a(s) inconsistência(s)
  aceita(s), nunca as apaga); `registrarDecisaoHumana` só válido a partir de
  `PENDENTE_REVISAO_HUMANA`; imutabilidade de `dadosExtraidos`.
- Coberto (VO irmão desta task, `tentativa-validacao.vo.ts`): 3º resultado
  `ACEITE_COM_RESSALVA` aceito com invariante `resultado` × `inconsistencias`
  preservada (não força lista vazia, ao contrário de `VALIDADO`).
- Não aplicável nesta task: as 4 regras determinísticas em si (T010, ainda
  `[ ]` em `tasks.md`), Domain Events (T011), persistência (T013/T014),
  Application/`ValidarOrcamento` (T024/T034), contrato de API — T009 é
  Domain puro, agregado testável isoladamente sem infra.

## 4. Suítes executadas e comandos
1. `corepack pnpm vitest run tests/bounded-contexts/validacao/domain/`
   → 11 arquivos, 47 testes, 0 falhas.
2. `corepack pnpm vitest run tests/bounded-contexts/validacao/domain/
   --coverage --coverage.include="src/bounded-contexts/validacao/domain/**"`
   → ver seção 7.
3. `corepack pnpm run typecheck` (`tsc --noEmit`, repositório inteiro) →
   0 erros.
4. `corepack pnpm run lint` (`eslint .`, repositório inteiro) → 0 erros.

## 5. Quantidade de testes por tipo
Unitários (Domain): 9 testes do agregado `orcamento-validacao.aggregate.test.ts`
+ 6 testes de `tentativa-validacao.vo.test.ts` (VO ajustado nesta mesma task
para o achado de review) diretamente relacionados a T009. Suíte completa do
diretório `domain/` (inclui VOs de T005–T008): 47 testes, 11 arquivos.

## 6. Resultado
- Aprovados: 47
- Falhos: 0
- Ignorados: 0
- Instáveis: 0

## 7. Cobertura inicial e final
Escopo: `src/bounded-contexts/validacao/domain/**` (agregado + todas as VOs
do BC até aqui).
- Statements: 95.74% (135/141)
- Branches: 95.08% (58/61)
- Functions: 91.52% (54/59)
- Lines: 95.71% (134/140)

`orcamento-validacao.aggregate.ts`: 90.9% statements/lines, 100% branches,
85.71% functions — linhas não cobertas 87-95 correspondem ao método estático
`reconstituir` (usado pelo repositório, ainda não implementado — T014) e a
getters não exercitados diretamente pelos testes atuais (exercitados
indiretamente via `criar`). Classificação: risco ainda não testado, coberto
naturalmente quando T014 (repositório) e seus testes de integração
existirem — não é lacuna introduzida por T009 fora do escopo da task.

Lacunas residuais pré-existentes (não introduzidas por T009, já registradas
em relatórios anteriores desta suíte): `dinheiro.vo.ts` (80%/75%),
`periodo-validade.vo.ts` (85.71%). `tentativa-validacao.vo.ts` (VO alterado
nesta task) e `cnpj.vo.ts` aparecem sem linha não coberta relevante ao
3º resultado adicionado.

## 8. Allure
Não gerado — repositório não tem adaptador Allure configurado no runner
Vitest (mesma lacuna já registrada em T001/T004/T008; fora do escopo desta
task alterar tooling de relatório sem ADR prévio).

## 9. Bugs por severidade e status
Nenhum bug de produção encontrado. Nenhum BUG-XXX aberto.

## 10. Riscos residuais
- NIT residual do `backend-reviewer` (2ª rodada, não bloqueante, verificado
  e confirmado nesta validação por leitura do código): `TentativaValidacao.de`
  não valida `inconsistencias.length > 0` para o resultado
  `ACEITE_COM_RESSALVA` — hoje inofensivo porque o único chamador
  (`OrcamentoValidacao.registrarDecisaoHumana`) só alcança esse resultado a
  partir de `PENDENTE_REVISAO_HUMANA`, estado que já garante
  `this._inconsistencias.length > 0` por invariante do próprio agregado
  (toda transição para `PENDENTE_REVISAO_HUMANA` exige `inconsistencias.length
  > 0` em `aplicarResultadoAvaliacao`). Risco só se materializa se o VO for
  chamado de outro ponto do código no futuro sem passar por essa invariante.
  Não bloqueia este gate — registrado como observação para reavaliação se
  `TentativaValidacao.de` ganhar novo chamador fora do agregado.
- `reconstituir` (linha 86-88 do agregado) sem teste unitário direto — será
  naturalmente exercitado pelos testes de integração de T014
  (`DrizzleOrcamentoValidacaoRepository`); sinalizar se T014 não cobrir.

## 11. Limitações do ambiente
- `pnpm` fora do PATH padrão do Bash desta worktree; executado via
  `corepack pnpm`, sem impacto no resultado.

## 12. Parecer final
APROVADO PELO QA

---

# QA Final Report — T012 (issue #122)

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch `feat/003-t012-interfaces-repositorio-gateway`, commit `f2b74b9`, PR #479 (draft)
- Task: T012 (issue #122) — Domain: interfaces de repositório/gateway/ACL
  (`orcamento-validacao.repository.ts`, `agente-categorizador-item.gateway.ts`,
  `fornecedor-cadastrado.gateway.ts`, `parametro-faixa-preco.gateway.ts`,
  `orcamento-extraido-event.acl.ts`) — sem implementação, apenas contratos TypeScript.
- `backend-reviewer`: APPROVE, sem achados (diff `origin/main...feat/003-t012-interfaces-repositorio-gateway`).
- Primeira validação (sem BUG-XXX prévio).

## 2. Resumo executivo
T012 adiciona 5 arquivos, todos interfaces TypeScript puras (nenhum corpo de
função, nenhuma lógica executável) em `src/bounded-contexts/validacao/domain/{repositories,gateways}/`:
`OrcamentoValidacaoRepository` (`salvar`/`buscarPorOrcamentoId`), `AgenteCategorizadorItemGateway`
(`categorizar`, com `AgenteCategorizadorItemInput` restrito a `descricaoItem` + `catalogoCategorias`),
`FornecedorCadastradoGateway` (`estaCadastrado`), `ParametroFaixaPrecoGateway` (`listarTodas`) e
`OrcamentoExtraidoEventACL` (`traduzir(payloadBruto: unknown)`, retorno tipado
`OrcamentoExtraidoEventACLResultado`). Todas as assinaturas batem com o desenho de
Domain/Application/ACL descrito em `plan.md` (seções "Application — Casos de uso",
"Infrastructure" e "Anti-Corruption Layer obrigatória") e com as tasks subsequentes que as
implementam (T014 repositório, T015 ACL, T022 fornecedor, T023 faixa de preço, T041
categorizador), citadas no JSDoc de cada contrato. Nenhuma implementação concreta encontrada
nos 5 arquivos. Sem defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
- Coberto (critério de aceite da task): os 5 arquivos contêm exclusivamente `interface`
  (e um único type auxiliar de input/output por gateway, também sem lógica) — verificado por
  leitura integral dos 5 arquivos; nenhum `class`, nenhum corpo de método, nenhuma dependência
  de SDK AWS/Bedrock/Drizzle importada.
- Coberto: nomes de arquivo e localização (`domain/repositories/`, `domain/gateways/`)
  conferem exatamente com `plan.md` § Project Structure.
- Coberto: assinatura de `FornecedorCadastradoGateway.estaCadastrado(cnpj: CNPJ): Promise<boolean>`
  consistente com spec.md ("conferência de CNPJ" contra base de fornecedores conhecidos) e
  plan.md (regra de negócio separada da validação de formato do VO `CNPJ`).
- Coberto: `AgenteCategorizadorItemGateway` restringe a saída a `CategoriaItem` e a entrada
  inclui `catalogoCategorias` explícito — consistente com ADR-002 (saída restrita ao catálogo
  configurado, IA nunca decide consistência).
- Coberto: `OrcamentoExtraidoEventACL.traduzir(payloadBruto: unknown)` usa `unknown` de
  propósito (não um shape suposto do evento upstream) — consistente com a Anti-Corruption
  Layer obrigatória do plan.md ("nunca importando tipos de domínio do BC Extração").
- Não aplicável nesta task: qualquer implementação concreta (T013–T016, T022–T024, T041),
  contrato de API, segurança, resiliência, persistência — T012 é puramente definição de
  tipo, sem comportamento em runtime a exercitar. Nenhum teste de compilação/contrato
  adicional foi criado por não agregar valor real além do já garantido por `tsc --noEmit`
  (que já cobre "os 5 arquivos compilam e são type-safe" de forma determinística e sem
  duplicar cobertura); interfaces TypeScript são apagadas na emissão de JS e não produzem
  comportamento a testar em runtime — decisão de não forçar teste artificial ("coverage
  theater"), consistente com a nota de teste do BC Validação em `plan.md` § Project Structure.

## 4. Suítes executadas e comandos
1. `npm run typecheck` (`tsc --noEmit`, repositório inteiro) → 0 erros.
2. `npm run lint` (`eslint .`, repositório inteiro) → 0 erros.
3. `npx vitest run tests/bounded-contexts/validacao --reporter=default` → 12 arquivos
   passaram, 1 skipped (`validacao-orcamento.schema.test.ts`, dependente de `DATABASE_URL`,
   mesma lacuna pré-existente das tasks anteriores desta spec), 61 testes passaram, 1 skipped.
4. `npx vitest run --reporter=default` (suíte completa do monorepo, regressão) → 83 arquivos
   passaram, 7 skipped (90 total), 410 testes passaram, 30 skipped — nenhuma falha.
5. `gh pr checks 479` → `ci` (lint + typecheck + typecheck:infra + cdk synth + migração +
   `pnpm run test` + audit) `pass` no commit `f2b74b9`.

Nota de ambiente: nesta worktree, `npx vitest run <path>` sem `--reporter=default` falha com
`Vitest failed to find the runner` originado em `allure-vitest/src/setup.ts` — reproduzido
igualmente em BCs não relacionados a esta task (`extracao`, `ingestao-identificacao`) e
ausente no CI do GitHub Actions (`pnpm run test`, que passou no commit testado). Classificado
como problema de ambiente local (conflito do reporter `allure-vitest` quando invocado via CLI
override fora do script `test` do `package.json`), não relacionado a T012 e não bloqueante —
contornado usando `--reporter=default` e confirmado pela execução verde do CI da PR.

## 5. Quantidade de testes por tipo
Nenhum teste novo criado para T012 (interfaces puras, sem comportamento em runtime — ver
justificativa na seção 3). Regressão executada: suíte completa (410 testes) e suíte
específica do BC Validação (61 testes), ambas sem falha.

## 6. Resultado
- Aprovados: 410 (suíte completa) / 61 (BC Validação)
- Falhos: 0
- Ignorados: 30 (suíte completa, pré-existentes, dependentes de `DATABASE_URL`) / 1 (BC
  Validação, mesma causa)
- Instáveis: 0

## 7. Cobertura inicial e final
Não aplicável — T012 adiciona apenas `interface`/`type` TypeScript, apagados na emissão de
JS; não altera statements, branches, functions nem lines executáveis do relatório de
cobertura v8. Nenhuma configuração de threshold de cobertura existe hoje em
`vitest.config.ts` (sem regressão de baseline a registrar).

## 8. Allure
Não gerado — mesma lacuna já registrada em T001/T004/T008/T009: adaptador `allure-vitest`
está configurado no `vitest.config.ts`, mas a publicação do relatório HTML consolidado é
responsabilidade de tooling de CI ainda não configurada nesta spec; fora do escopo desta task
alterar sem ADR prévio. `allure-results/` é gerado localmente pela execução via script `test`
do `package.json` quando não há conflito de reporter (ver seção 4).

## 9. Bugs por severidade e status
Nenhum bug de produção encontrado. Nenhum BUG-XXX aberto.

## 10. Riscos residuais
Nenhum risco novo introduzido por T012. Os contratos ainda não têm implementação concreta
(T013–T016, T022–T024, T041 seguem `[ ]` em `tasks.md`) — comportamento real desses gateways
(timeout/retry do `FornecedorCadastradoHttpGateway`, saída estruturada restrita ao catálogo do
`BedrockCategorizadorItemGateway`, tradução do payload bruto no `OrcamentoExtraidoEventACL`)
só será testável quando essas tasks forem implementadas; nenhuma lacuna nova além da já
esperada pela ordem do `tasks.md`.

## 11. Limitações do ambiente
- `npm` usado nesta validação (node_modules já instalado via `pnpm`, conforme
  `node_modules/.modules.yaml`); scripts `npm run typecheck`/`npm run lint` equivalem aos
  scripts do `package.json` independente do gerenciador usado para invocá-los.
- Ver nota de ambiente sobre `allure-vitest`/`--reporter` na seção 4 — contornada, não
  bloqueante, confirmada como não-regressão via CI verde da PR #479.

## 12. Parecer final
APROVADO PELO QA
