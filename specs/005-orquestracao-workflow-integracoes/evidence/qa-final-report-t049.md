# QA final report — T049 (issue #255)

## SPEC_ID e versão testada

- SPEC_ID: `005-orquestracao-workflow-integracoes`
- PR: #709, branch `feat/005-255-integracao-externa`, commit `582bd54`
  (`582bd548cd33c892034b284ff730bff256220d3a`), contra `main`.
- Natureza: PR só de documentação. Nenhum arquivo de produção ou teste alterado.

## Resumo executivo

T049 pedia estender `ConsolidarEDecidirWorkflow` e `RegistrarDecisaoHumanaWorkflow`
para publicar `IntegracaoExternaSolicitada` junto do evento de desfecho quando
`requerIntegracaoExterna === true`. Investigação (auditada de forma independente
pelo coordenador e pelo `backend-reviewer`, que aprovou o PR com APPROVE) confirmou
que o comportamento já estava implementado em produção antes deste PR — desde a
extração de `criar-evento-desfecho.ts` (T042/#248). O PR apenas corrige o registro
em `tasks.md` e `docs/plano-finalizacao.md`, que descreviam a task como pendente.

O terceiro caso de uso citado no `tasks.md` histórico como faltante
(`RevisarDecisaoWorkflowComIA`) não existe em `src/` — foi removido do produto
junto do Agente Revisor de Workflow (nota da Fase 4 do `tasks.md`).

## Verificação de diff

```
git diff main...feat/005-255-integracao-externa --stat
 docs/plano-finalizacao.md                            | 4 ++--
 specs/005-orquestracao-workflow-integracoes/tasks.md | 2 +-
```

Confirmado: nenhum arquivo de produção (`src/`) ou teste (`tests/`) alterado.
`gh pr diff 709 --name-only` retorna a mesma lista de 2 arquivos.

## Evidência de código (produção, pré-existente ao PR)

- `src/bounded-contexts/orquestracao/application/use-cases/consolidar-e-decidir-workflow.ts`,
  linhas ~102-106: publica `IntegracaoExternaSolicitada` após o evento de desfecho
  quando `decisao.requerIntegracaoExterna`.
- `src/bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.ts`,
  linhas ~64-68: mesmo comportamento para a decisão humana via escalonamento.
- `src/bounded-contexts/orquestracao/domain/events/integracao-externa-solicitada.event.ts`:
  payload restrito a `orcamentoId`/`acaoOrigem`/`tenantId`/`ocorreuEm` — comentário
  no próprio código proíbe adicionar campo de protocolo específico, o que satisfaz
  literalmente o critério de aceite de desacoplamento do sistema parceiro.
- `RevisarDecisaoWorkflowComIA`: não encontrado em `src/` (`find src -iname
  '*revisar-decisao-workflow*'` sem resultado) — confirma que o terceiro caso de uso
  citado como pendente foi removido do produto, não é lacuna de código.

## Suítes executadas e comandos

Comando (necessário nesta máquina por causa do path com espaço — ver CLAUDE.md):

```
npx vitest run --reporter=default \
  tests/bounded-contexts/orquestracao/application/consolidar-e-decidir-workflow.test.ts \
  tests/bounded-contexts/orquestracao/application/registrar-decisao-humana-workflow.test.ts \
  tests/bounded-contexts/orquestracao/domain/events/domain-events.test.ts
```

Resultado:

```
 ✓ tests/bounded-contexts/orquestracao/domain/events/domain-events.test.ts (8 tests) 17ms
 ✓ tests/bounded-contexts/orquestracao/application/registrar-decisao-humana-workflow.test.ts (5 tests) 16ms
 ✓ tests/bounded-contexts/orquestracao/application/consolidar-e-decidir-workflow.test.ts (8 tests) 18ms

 Test Files  3 passed (3)
      Tests  21 passed (21)
```

Cenários que exercitam especificamente o comportamento da T049 (confirmados por
`grep` no corpo dos arquivos de teste, não apenas pela existência do arquivo):

- `consolidar-e-decidir-workflow.test.ts`: `'publica IntegracaoExternaSolicitada
  junto do desfecho quando requerIntegracaoExterna'` — assere
  `publisher.publicados[1]` é instância de `IntegracaoExternaSolicitada`.
- `registrar-decisao-humana-workflow.test.ts`: mesmo nome de cenário, mesma
  asserção, para o caminho de decisão humana.
- `domain-events.test.ts`: cobre a forma do evento `IntegracaoExternaSolicitada`
  (envelope, `schemaVersion`, `detailType`) isoladamente.

## Cobertura

Não aplicável a incremento — nenhum arquivo de produção foi alterado neste PR, logo
não há código novo para medir cobertura de feature. A suíte relevante (21 testes,
3 arquivos) já cobria o comportamento antes do PR e continua cobrindo depois,
inalterada. Nenhuma alteração de teste foi necessária (YAGNI — comportamento já
tinha teste correto e específico).

## Allure

Não gerado nesta validação: PR de documentação, sem alteração de código de
produção ou de teste. A execução via `--reporter=default` já é evidência suficiente
e reproduzível do resultado (ver seção "Suítes executadas"); gerar Allure para uma
suíte inalterada não agregaria evidência adicional e violaria YAGNI/ponytail.

## Requisitos cobertos

Critério de aceite da spec (`specs/005-orquestracao-workflow-integracoes/spec.md`,
linha 136-137):

> Uma decisão que exige integração externa publica um evento de integração
> desacoplado, sem quem decidiu precisar conhecer o contrato do sistema parceiro.

Satisfeito para os dois caminhos de decisão vigentes na spec (linha 105-106,
"por Orquestrador ou comprador via fila de escalonamento"):

- Orquestrador automático → `ConsolidarEDecidirWorkflow` (coberto).
- Comprador via escalonamento → `RegistrarDecisaoHumanaWorkflow` (coberto).

Nenhuma lacuna. O terceiro caminho citado historicamente em `tasks.md`
(`RevisarDecisaoWorkflowComIA` / Agente Revisor de Workflow) não faz mais parte do
produto, então não é um requisito em aberto.

## Bugs encontrados

Nenhum.

## Arquivos verificados/criados por este QA

- Verificados (leitura apenas): `consolidar-e-decidir-workflow.ts`,
  `registrar-decisao-humana-workflow.ts`, `integracao-externa-solicitada.event.ts`,
  os 3 arquivos de teste executados, `docs/plano-finalizacao.md`,
  `specs/005-orquestracao-workflow-integracoes/tasks.md`,
  `specs/005-orquestracao-workflow-integracoes/spec.md`.
- Criado: este relatório
  (`specs/005-orquestracao-workflow-integracoes/evidence/qa-final-report-t049.md`).

## Riscos residuais

Nenhum relacionado à T049. Riscos gerais do BC (guard `comprador-responsavel`
gated por ADR-010 T4, reenvio ao fornecedor #252/#254/#256) permanecem registrados
em `docs/plano-finalizacao.md`, fora do escopo deste PR.

## Limitações do ambiente

Nenhuma. Testes são unitários (fakes de publisher), não dependem de Postgres nem
LocalStack.

## Parecer final

APROVADO PELO QA
