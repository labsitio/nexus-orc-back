# QA Final Report — T043 (Monitorar payload de OrcamentoExtraido contra limite de 256KB do EventBridge)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #108
- PR: #604 (draft), branch `feat/002-t043-monitorar-payload-eventbridge`
- Commit no topo do worktree: `1434b46`
- Diff real (`git diff f62c630~1..1434b46 --stat`): 3 arquivos
  - `src/bounded-contexts/extracao/infrastructure/eventbridge.publisher.ts`
  - `tests/bounded-contexts/extracao/infrastructure/eventbridge.publisher.test.ts`
  - `specs/002-extracao-dados-orcamento/tasks.md` (T043 concluída + gap T043a registrado)

## Resumo executivo
`EventBridgePublisher.publicar` agora mede `Buffer.byteLength(JSON.stringify(evento), 'utf8')`
para todo evento publicado deste BC (não só `OrcamentoExtraido`) e emite `logger.warn`
(pino) quando o tamanho é >= 80% de 256KB (262144 bytes,
`LIMITE_PAYLOAD_EVENTBRIDGE_BYTES`), antes de enviar o `PutEventsCommand`. Mudança
mínima e correta para o gap real de IaC do repositório: não existe ainda stack CDK
do Lambda consumidor de `extrator-queue` para um `cloudwatch.Alarm`/`logs.MetricFilter`
real se anexar — gap explicitamente rastreado como `T043a` em `tasks.md`, não escondido.
Consistente com o padrão do gap T046/Lambda MarkItDown, já registrado antes desta task.

## Suítes executadas e comandos
- `npx vitest run tests/bounded-contexts/extracao/infrastructure/eventbridge.publisher.test.ts`
  → 5 testes passaram (2 novos desta leva + 3 pré-existentes da leva T015, sem alteração
  de asserção nos antigos).
- `npx vitest run tests/bounded-contexts/extracao` (regressão completa do BC) → 494
  passed, 37 skipped (integração/DB dependente de ambiente local, skip pré-existente,
  não relacionado a esta mudança), 0 failed.
- `npx tsc --noEmit -p .` → sem erros.

## Verificação funcional do comportamento reportado
- Payload pequeno (evento fake padrão) → `logger.warn` NÃO chamado (teste 1).
- Payload sintético de ~230KB (campo extra `itens` com string repetida) → `logger.warn`
  chamado exatamente 1 vez, com `orcamentoId` correto, `tamanhoBytes >= 256*1024*0.8`
  e mensagem contendo "262144B" (teste 2). Mecanismo de geração do payload no teste
  (string repetida) é sintético mas irrelevante — o que a produção mede é
  `Buffer.byteLength` do JSON serializado real, agnóstico à origem do tamanho.
- Publicação (`PutEventsCommand`) inalterada: `EventBusName`, `Source: nexo.extracao`,
  `DetailType` e `Detail` seguem corretos (teste 3, pré-existente, ainda passa).
- Tratamento de falha do EventBridge inalterado: `FailedEntryCount > 0` com
  `ErrorMessage` → erro descritivo (teste 4); sem `ErrorMessage` → fallback "motivo
  desconhecido" (teste 5) — ambos pré-existentes, ainda passam sem alteração de
  asserção. Confirma que o `logger.warn` é observação lateral, não bloqueia nem
  altera o fluxo de publicação/erro.

## Fronteira de camada e segurança
- Lógica adicionada inteira em Infrastructure (`eventbridge.publisher.ts`), nenhuma
  mudança em Domain/Application — coerente com T015 (Infra implementando `EventPublisher`
  do Domain).
- Nenhum segredo, token ou dado sensível no log de alerta: apenas `detailType`,
  `orcamentoId` (identificador de negócio, mesmo padrão de correlação de T016),
  `tamanhoBytes` e `limiteBytes`. O payload completo do evento nunca é logado.
- `grep` por padrões de segredo (`process.env`, `token`, `secret`, `password`,
  `apiKey`) no diff → nenhuma ocorrência.

## Cobertura
Sem baseline/threshold específico de cobertura configurado para este arquivo além
do já medido em `qa/coverage-baseline.md` (leva T015). A mudança adiciona 2 branches
(`if (tamanhoBytes >= LIMIAR_ALERTA_PAYLOAD_BYTES)` — true/false) e ambos os ramos
são exercitados pelos 2 testes novos (teste 1 = ramo false, teste 2 = ramo true).
Nenhuma lacuna de branch nesta função.

## Bugs encontrados
Nenhum.

## Riscos residuais
- Alarme CloudWatch real (`cloudwatch.Alarm`/`logs.MetricFilter`) ainda não existe —
  gap de Infrastructure pré-existente (falta a stack CDK do Lambda consumidor de
  `extrator-queue`), rastreado como `T043a` em `tasks.md`. Até essa stack existir,
  a detecção de payload grande depende de alguém observar o log estruturado
  manualmente ou via query no CloudWatch Logs Insights — não há alerta automático
  ativo (PagerDuty/SNS/etc.).
- Threshold de 80% fixo em código, sem configuração por tipo de evento — marcado
  com `ponytail:` no código de produção, decisão consciente e proporcional (não há
  demanda real hoje para variar por BC/evento).

## Limitações do ambiente
Sem LocalStack neste worktree — sem teste de integração real contra EventBridge
(`PutEventsCommand` de verdade), mesma limitação já registrada na leva T015. Não
bloqueia esta task: o comportamento sob teste (cálculo de tamanho + decisão de log)
é isolado do transporte real.

## Parecer final
APROVADO PELO QA
