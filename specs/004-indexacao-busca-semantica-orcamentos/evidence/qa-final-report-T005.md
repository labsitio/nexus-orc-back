# QA Final Report — T005 (PR #471)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- PR: #471 (draft), branch feat/004-busca-indexacao (Closes #165)
- Commit: 0df9d0c
- Task: T005 — provisionar regra EventBridge no bus `nexo-dominio-bus`
  roteando `detail-type: OrcamentoValidado` e
  `detail-type: OrcamentoValidadoComRessalva`, `source: nexo.validacao` ->
  `indexador-queue`.

## Resumo executivo
Task de infraestrutura pura (CDK), sem código de aplicação. Já aprovada pelo
backend-reviewer (APPROVE, sem achados). Implementação segue byte a byte o
mesmo padrão já em produção em `validador-queue-stack.ts` (spec 003) e
`decisao-workflow-queue-stack.ts` (spec 005): `events.Rule` no bus importado
por referência (`dominioBus`), `eventPattern` com `source`/`detail-type`
literais (mesma justificativa de sincronia manual documentada no comentário
do arquivo — infra CDK não importa `src/`), target único via
`targets.SqsQueue`. Nenhuma das stacks irmãs possui teste unitário CDK
dedicado; verificação usada consistentemente é `cdk synth` + inspeção do
CloudFormation gerado. `tasks.md` não associa teste automatizado a T005.

`dominioBus` tornado prop obrigatória do construtor e `infra/bin/app.ts`
ajustado para passá-la — mudança mecânica, mesma forma já usada pelas 6
stacks de fila anteriores (`ExtratorQueueStack`, `ValidadorQueueStack`,
`ContextoClassificacaoQueueStack`, `ContextoExtracaoQueueStack`,
`DecisaoWorkflowQueueStack`), sem alterar nenhuma delas.

## Requisitos cobertos
- `AWS::Events::Rule` no bus de domínio (`EventBusName` resolvido via
  `Fn::ImportValue` de `DominioEventBusStack`, não um bus novo) — confirmado.
- `EventPattern.source: [nexo.validacao]` — confirmado.
- `EventPattern.detail-type: [OrcamentoValidado, OrcamentoValidadoComRessalva]`
  — confirmado, os dois literais exatos exigidos pela task.
- Target aponta para a fila principal `indexador-queue`
  (`IndexadorQueueB9B213EA`), nunca para a DLQ (`IndexadorQueueDlq9935DD03`)
  — confirmado por inspeção do `Arn`/`Fn::GetAtt` do target no
  CloudFormation sintetizado.
- Permissão para EventBridge publicar na SQS: `AWS::SQS::QueuePolicy`
  gerado automaticamente pelo `targets.SqsQueue` — `Effect: Allow`,
  `Principal: events.amazonaws.com`, ações
  `sqs:SendMessage`/`GetQueueAttributes`/`GetQueueUrl`, `Condition.ArnEquals`
  restringindo `aws:SourceArn` ao ARN da regra específica
  (`OrcamentoValidadoParaIndexadorQueue0107177E`) — least privilege correto,
  não é uma policy aberta a qualquer regra do bus.
- Wiring em `infra/bin/app.ts`: `IndexadorQueueStack` recebe
  `dominioBus: dominioEventBusStack.dominioBus` — confirmado.
- `npx cdk synth --all`: todas as stacks do repositório (incluindo as 6
  outras que também dependem de `dominioBus`) sintetizam sem erro —
  mudança de prop obrigatória não quebrou nenhuma stack irmã.

## Não coberto / não aplicável
- Teste unitário CDK dedicado (`aws-cdk-lib/assertions`): sem convenção
  pré-existente no repositório para esse tipo de teste em nenhuma das
  stacks de fila com regra EventBridge (001/002/003/005); `tasks.md` não
  exige teste automatizado para T005. Verificação por `cdk synth` +
  inspeção do CloudFormation é a prática já estabelecida e aceita nas
  validações anteriores desta mesma trilha (T004, PR #470) — não é lacuna
  nova introduzida por este diff.
- Comportamento em runtime real (evento publicado no bus real roteado de
  fato para a fila, entrega efetiva à `indexador-queue`): fora do alcance
  de uma stack ainda não deployada; responsabilidade de DevOps confirmar
  pós-deploy.
- `npx vitest run`: não aplicável — T005 não adiciona nem altera nenhum
  arquivo de teste Vitest (IaC pura).

## Suítes executadas e comandos
- `npx tsc --noEmit -p infra/tsconfig.json` — sem erros (executado pelo
  dev-back-end, resultado conferido).
- `npx eslint` — sem erros/warnings (executado pelo dev-back-end, resultado
  conferido).
- `npx cdk synth IndexadorQueueStack` — sintetiza sem erro; CloudFormation
  inspecionado linha a linha (EventPattern, target, queue policy) nesta
  sessão de QA.
- `npx cdk synth --all` — todas as stacks sintetizam sem erro, executado
  nesta sessão de QA.

## Cobertura
Não aplicável a este PR: nenhum código de aplicação (Domain/Application/
Infrastructure de runtime) foi alterado, apenas definição de infraestrutura
CDK.

## Allure
Não gerado nesta sessão — não há suíte Vitest a executar (T005 é IaC pura,
sem teste automatizado associado nem convenção prévia para stacks CDK).

## Bugs
Nenhum defeito de produção encontrado. `EventPattern`, target e queue
policy sintetizam exatamente como especificado no critério de aceite de
T005 e seguem o padrão já em produção nas stacks irmãs do repositório.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
- Comportamento em runtime real (evento efetivamente roteado, entrega à
  fila) não verificado nesta sessão — depende de deploy real, fora do
  alcance de QA sobre uma stack ainda não deployada; responsabilidade de
  DevOps confirmar pós-deploy.
- T006 (coordenação do payload enriquecido de `OrcamentoValidado`/
  `OrcamentoValidadoComRessalva` com a spec 003) permanece pendente
  conforme `tasks.md` — não bloqueia T005 (que trata apenas do roteamento
  do evento, não do conteúdo do payload), mas é pré-requisito para T018/
  T029 (ACL/caso de uso) mais adiante nesta mesma spec.

## Limitações do ambiente
Nenhuma relevante a este diff: T005 não depende de banco de dados, Vitest
ou serviços externos para ser verificada — `cdk synth` é suficiente e
determinístico.

## Parecer final
APROVADO PELO QA

Critério de aceite de T005 cumprido literalmente: regra EventBridge
provisionada no bus `nexo-dominio-bus`, roteando `OrcamentoValidado` e
`OrcamentoValidadoComRessalva` (source `nexo.validacao`) para a fila
`indexador-queue` (nunca para a DLQ) — confirmado por inspeção do
CloudFormation sintetizado. Queue policy de permissão EventBridge -> SQS
gerada automaticamente pelo `targets.SqsQueue`, com `Condition.ArnEquals`
restringindo o `SourceArn` à regra específica (least privilege). Ausência
de teste unitário CDK dedicado é aceitável: não há convenção estabelecida
no repositório para esse tipo de teste em nenhuma das stacks de fila
irmãs (001/002/003/005), e `tasks.md` não associa teste automatizado a
T005; a verificação por `cdk synth` + inspeção do CloudFormation é
equivalente e suficiente para o risco desta task (config declarativa
determinística, sem lógica condicional a exercitar). Sem defeito de
produção.
