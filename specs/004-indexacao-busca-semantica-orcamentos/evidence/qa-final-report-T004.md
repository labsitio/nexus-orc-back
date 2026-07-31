# QA Final Report — T004 (PR #470)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- PR: #470 (draft), branch feat/004-busca-indexacao
- Commit: 83c0ad6
- Task: T004 — provisionar fila SQS `indexador-queue` com DLQ própria,
  `maxReceiveCount` para retentativas automáticas e alarme CloudWatch em
  mensagem na DLQ (IaC). Sem fila de revisão humana de negócio (ADR-002).

## Resumo executivo
Task de infraestrutura pura (CDK), sem código de aplicação. Já aprovada pelo
backend-reviewer (APPROVE, sem achados). Implementação segue byte a byte o
mesmo padrão já em produção em `validador-queue-stack.ts` (spec 003) e
`decisao-workflow-queue-stack.ts` (spec 005): DLQ com retenção de 14 dias,
fila principal com `visibilityTimeout` de 5 minutos e `RedrivePolicy` com
`maxReceiveCount: 3`, alarme CloudWatch em
`ApproximateNumberOfMessagesVisible` (Maximum, período 1 min, limiar >= 1,
`TreatMissingData: notBreaching`). Nenhuma dessas stacks anteriores possui
teste unitário CDK dedicado no repositório — a verificação usada
consistentemente até aqui é `cdk synth` + inspeção do CloudFormation gerado;
`tasks.md` não associa teste automatizado a T004. Mantida a mesma convenção,
sem criar framework de teste novo para uma única stack.

Wiring em `infra/bin/app.ts` corretamente sem prop `dominioBus` — a regra
EventBridge de roteamento (`OrcamentoValidado`/`OrcamentoValidadoComRessalva`
-> `indexador-queue`) é T005/#165, ainda não implementada; escopo de T004
respeitado.

## Requisitos cobertos
- Fila `indexador-queue` provisionada — confirmado no CloudFormation
  sintetizado (`AWS::SQS::Queue`, `QueueName: indexador-queue`).
- DLQ própria `indexador-queue-dlq`, retenção 14 dias (`1209600` s) —
  confirmado (`AWS::SQS::Queue`, `MessageRetentionPeriod: 1209600`).
- `maxReceiveCount` para retentativas automáticas — confirmado
  (`RedrivePolicy.maxReceiveCount: 3`, apontando para a DLQ via
  `Fn::GetAtt`); mecanismo idêntico ao já aceito nas 4 outras filas do
  repositório (specs 001, 002, 003, 005) para o mesmo requisito textual
  ("retentativas automáticas com backoff" = redrive SQS padrão + visibility
  timeout de 5 min entre tentativas — não é backoff exponencial explícito,
  mas é a mesma interpretação já validada e em produção nas quatro stacks
  irmãs; não é uma lacuna nova introduzida por este diff).
- Alarme CloudWatch em mensagem na DLQ — confirmado
  (`AWS::CloudWatch::Alarm`, métrica `ApproximateNumberOfMessagesVisible`,
  namespace `AWS/SQS`, dimensão `QueueName` = DLQ, `Threshold: 1`,
  `ComparisonOperator: GreaterThanOrEqualToThreshold`).
- Ausência de fila de revisão humana de negócio — confirmado por inspeção do
  diff (nenhuma fila adicional criada) e por referência explícita ao ADR-002
  no comentário da stack e no plan.md (linha 44, tabela de Constitution
  Check, Princípio IV).
- `terminationProtection = true` na stack — presente, mesmo padrão das
  demais stacks de fila.

## Não coberto / não aplicável
- Regra EventBridge de roteamento para `indexador-queue`: fora de escopo de
  T004 (T005/#165, ainda não implementada) — corretamente não incluída
  neste diff.
- Teste unitário CDK dedicado (`aws-cdk-lib/assertions`): não existe
  convenção no repositório para esse tipo de teste em nenhuma das 4 stacks
  de fila anteriores (001/002/003/005); `tasks.md` não exige teste
  automatizado para T004. Verificação usada é `cdk synth` + inspeção do
  CloudFormation, consistente com a prática já estabelecida — não é uma
  lacuna nova, é ausência de convenção pré-existente.
- Comportamento em runtime real (mensagem entrando na fila, redrive de
  fato ocorrendo, alarme disparando em CloudWatch real): fora do alcance de
  uma stack ainda não deployada; responsabilidade de DevOps validar após
  deploy em ambiente real (mesmo risco já aceito nas stacks irmãs).

## Suítes executadas e comandos
- `npx tsc --noEmit -p infra/tsconfig.json` — sem erros.
- `npx eslint infra/lib/indexador-queue-stack.ts infra/bin/app.ts` — sem
  erros/warnings.
- `npx cdk synth IndexadorQueueStack` — sintetiza sem erro; CloudFormation
  inspecionado linha a linha (fila, DLQ, RedrivePolicy, alarme) — confere
  literalmente com o critério de aceite de T004.
- `npx cdk synth --all` — todas as stacks do repositório sintetizam sem
  erro; nenhuma stack de outra spec quebrada pela wiring nova em `app.ts`.
- `npx vitest run`: não aplicável — T004 não adiciona nem altera nenhum
  arquivo de teste Vitest (é IaC pura, sem Domain/Application/Infra de
  aplicação). O bloqueio de ambiente do runner Vitest identificado e
  documentado na validação anterior desta spec (T003, PR #468 —
  duplicação de módulo `vitest` via pnpm neste worktree, quebrando
  `allure-vitest/src/setup.ts`) permanece presumivelmente presente, mas é
  irrelevante para este diff porque não há suíte Vitest a executar aqui.

## Cobertura
Não aplicável a este PR: nenhum código de aplicação (Domain/Application/
Infrastructure de runtime) foi alterado, apenas definição de infraestrutura
CDK. Sem alteração de statements/branches/functions/lines exercitáveis por
suíte de unidade.

## Allure
Não gerado nesta sessão — não há suíte Vitest a executar (T004 é IaC pura,
sem teste automatizado associado nem convenção prévia para stacks CDK). Sem
regressão introduzida: o bloqueio de ambiente do Vitest já registrado em
T003 não é acionado por este PR.

## Bugs
Nenhum defeito de produção encontrado. Fila, DLQ, redrive e alarme
sintetizam exatamente como especificado no critério de aceite de T004 e
seguem o padrão já em produção nas 4 stacks de fila irmãs do repositório.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
- "Backoff" no texto da task é satisfeito pelo mecanismo de redrive SQS
  padrão (visibility timeout de 5 min entre tentativas), não por backoff
  exponencial explícito — mesma interpretação já aceita e em produção nas
  4 stacks irmãs (001/002/003/005); registrado como risco arquitetural
  pré-existente, não como defeito desta task.
- Comportamento em runtime real (deploy, redrive de fato, disparo do
  alarme) não verificado nesta sessão — depende de deploy real, fora do
  alcance de QA sobre uma stack ainda não deployada; responsabilidade de
  DevOps confirmar pós-deploy.

## Limitações do ambiente
- Nenhuma relevante a este diff: T004 não depende de banco de dados,
  Vitest ou serviços externos para ser verificada — `cdk synth` é
  suficiente e determinístico.

## Parecer final
APROVADO PELO QA

Critério de aceite de T004 cumprido literalmente: fila `indexador-queue`
provisionada com DLQ própria (`indexador-queue-dlq`), `maxReceiveCount: 3`
configurado para retentativas automáticas, e alarme CloudWatch em mensagem
na DLQ — confirmado por inspeção do CloudFormation sintetizado. Ausência de
fila de revisão humana de negócio, por decisão de ADR-002, respeitada.
Ausência de teste unitário CDK dedicado é aceitável: não há convenção
estabelecida no repositório para esse tipo de teste em nenhuma das stacks
de fila anteriores, e `tasks.md` não associa teste automatizado a T004; a
verificação por `cdk synth` + inspeção do CloudFormation é equivalente e
suficiente para o risco desta task (config declarativa determinística, sem
lógica condicional a exercitar). Sem defeito de produção.
