# QA — T049: métrica de inconsistência por regra e resultado de validação

## SPEC_ID e versão testada

- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #769 (`labsitio/nexus-orc-back`)
- Branch: `feat/159-metrica-inconsistencia-validacao`
- Commits testados: `f4e56c9`, `da2c30d` + este commit de evidência QA
- Primeira validação (não é reteste)

## Resumo executivo

T049 replica, no BC `validacao`, o mecanismo de métrica EMF/CloudWatch (ADR-016)
já aprovado em #752 (ingestao-identificacao) e #766 (extracao). Dois pontos de
emissão em `ValidarOrcamento.executar`:

- `InconsistenciaDetectada` (dimensão `regra`, 1 por inconsistência) — cobre
  "taxa de inconsistência por tipo de regra".
- `OrcamentoValidacaoConcluida` (dimensão `resultado` = `validacao.status`,
  1 por execução) — cobre "percentual de orçamentos validados automaticamente
  sem intervenção humana" (percentual real é métrica derivada no CloudWatch,
  fora do escopo de código — `spec.md` não define meta rígida).

`emitirMetrica` (`src/bounded-contexts/validacao/infrastructure/observability/metrica.ts`)
é byte-a-byte a mesma implementação já validada nos precedentes (namespace fixo
do BC, unidade padrão `Count`, `tenantId` nunca em dimensão por padrão).

## Verificação do critério de aceite (spec.md, "Métricas de Avaliação Contínua")

- **Taxa de inconsistência por tipo de regra**: confirmado. `InconsistenciaDetectada`
  emitida uma vez por item de `inconsistencias`, com `regra` = um dos 5 valores
  fechados de `RegraInconsistencia`. Verificado por teste de unidade e por
  inspeção do JSON EMF emitido em execução real do use case (não é mock do
  ponto de emissão — é o `emitirMetrica` de produção rodando).
- **Percentual de orçamentos validados automaticamente sem intervenção humana**:
  confirmado como leading indicator via métrica derivada. `OrcamentoValidacaoConcluida`
  com `resultado` = `validacao.status`. Verifiquei em
  `src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.ts` que,
  a partir de `PENDENTE`, `avaliarRegrasDeConsistencia` só produz `VALIDADO` ou
  `PENDENTE_REVISAO_HUMANA` — nunca `VALIDADO_COM_RESSALVA` (que só é alcançável
  via `registrarDecisaoHumana`, fora deste ponto de emissão). A descrição do PR
  ("`VALIDADO | PENDENTE_REVISAO_HUMANA` nesta rota") é precisa, não uma
  simplificação incorreta.
- **Sem quebra de contrato de evento**: `OrcamentoValidado`/`OrcamentoInconsistenciaDetectada`
  continuam carregando `tenantId` e `schemaVersion`, inalterados pela métrica.
- **Sem quebra de multi-tenancy**: `tenantId` nunca entra como dimensão da
  métrica (confirmado por teste existente em `metrica.test.ts` e por inspeção —
  `emitirMetrica` só usa `opcoes.dimensoes` explícito, e nenhum ponto de uso
  passa `tenantId`).
- **Verificável em CI/teste sem AWS**: confirmado. EMF é só uma linha de log
  JSON via pino; `metrica.test.ts` captura via `write` em memória,
  `validar-orcamento.test.ts` captura via logger fake (`.info`). Nenhum
  SDK/credencial AWS envolvido.

## Achados MINOR do backend-reviewer — verificação e ação

1. **Emissão antes da persistência/publicação (double count em reentrega SQS)**:
   confirmado no código — mesmo padrão já aceito como débito compartilhado em
   `extracao/extrair-dados-orcamento.ts`. Não é regressão desta PR, não bloqueia
   o gate (débito pré-existente e aceito).
2. **Nenhum teste cobria a emissão real no ponto de uso** (dimensão `regra` por
   inconsistência, dimensão `resultado` por status): **gap real, confirmado**
   antes da correção — `validar-orcamento.test.ts` não tinha nenhuma referência
   a logger/métrica. Fechado nesta rodada de QA (ver seção "Testes
   adicionados").

   Nota: a justificativa do PR de que "mesmo gap existe no precedente de
   extracao" não se confirma integralmente — `extrair-dados-orcamento.test.ts`
   já tem 3 testes cobrindo emissão real via `LoggerFake` local ao arquivo
   (`CampoMarcadoNaoExtraido`, `ConversaoMarkItDownFalhou`). Não é bloqueante:
   o padrão já existia no repositório e eu apliquei o mesmo padrão aqui — mas
   registro a imprecisão para não propagar a ideia de que o precedente também
   tinha o gap.

## Testes adicionados (QA, apenas em teste — nenhum código de produção alterado)

`tests/bounded-contexts/validacao/application/validar-orcamento.test.ts` —
novo describe `métricas de observabilidade (T049)`, réplica do padrão
`LoggerFake`/`comoLogger` já usado em `extrair-dados-orcamento.test.ts`:

1. Caminho `VALIDADO`: zero `InconsistenciaDetectada`, uma
   `OrcamentoValidacaoConcluida` com `resultado=VALIDADO`, namespace
   `Nexo/Validacao` confirmado no EMF.
2. Caminho `PENDENTE_REVISAO_HUMANA` (CNPJ não cadastrado): uma
   `InconsistenciaDetectada` com `regra=CNPJ_DIVERGENTE_CADASTRO`, uma
   `OrcamentoValidacaoConcluida` com `resultado=PENDENTE_REVISAO_HUMANA`.
3. Entrega duplicada (idempotência, já coberta para persistência/publicação):
   confirmado que **nenhuma** métrica é emitida quando o agregado já saiu de
   `PENDENTE` — reforça que o achado MINOR 1 (double count) fica restrito à
   janela entre emissão e persistência/publicação em uma única execução, não a
   reentregas depois de já persistido.

## Suítes executadas e comandos

```
npx vitest run --reporter=default tests/bounded-contexts/validacao/application/validar-orcamento.test.ts tests/bounded-contexts/validacao/infrastructure/observability/metrica.test.ts
npx vitest run --reporter=default   # suíte completa, regressão
pnpm typecheck
npx eslint tests/bounded-contexts/validacao/application/validar-orcamento.test.ts
```

## Resultado

- `metrica.test.ts` (validacao): 2 passed.
- `validar-orcamento.test.ts`: 12 passed (9 pré-existentes + 3 novos desta
  rodada de QA).
- Suíte completa: **1294 passed, 130 skipped** (skip esperado sem
  `DATABASE_URL` local — 19 arquivos documentados no CLAUDE.md), **7 failed**
  — todos em `infra/lib/*-stack.test.ts` por timeout de hook de síntese CDK
  nesta máquina local, condição conhecida e documentada no CLAUDE.md do
  repositório, não relacionada a este PR, CI (Linux) roda verde. Nenhuma
  falha em teste de `validacao` ou de qualquer BC além do timeout de infra.
- `pnpm typecheck`: limpo.
- `eslint` no arquivo de teste alterado: limpo.

## Cobertura

Não recalculei cobertura numérica global (fora do escopo do achado a fechar:
o objetivo era cobrir os 2 pontos de emissão real, já verificado linha a linha
acima e por execução). Nenhuma lacuna nova identificada nos 2 pontos de uso da
métrica em `validar-orcamento.ts` — ambos exercitados em pelo menos 2 cenários
(status `VALIDADO` e `PENDENTE_REVISAO_HUMANA`) mais o caminho de idempotência.

## Riscos residuais

- Débito compartilhado de double-count em reentrega SQS entre emissão e
  persistência/publicação (achado MINOR 1) — pré-existente em outros BCs,
  aceito, não bloqueia este PR. Nenhuma ação de código nesta PR.

## Limitações do ambiente

- `DATABASE_URL` não configurado localmente: 130 testes puláveis por design
  (`skipIf`), esperado, CI cobre.
- 7 testes de síntese CDK com timeout de hook nesta máquina local (path com
  espaço), condição conhecida, não relacionada a este PR, CI (Linux) verde.

## Parecer final

**APROVADO PELO QA**

Implementação atende ao critério de "Métricas de Avaliação Contínua" do
spec.md, mecanismo verificável em CI/teste sem AWS, sem quebra de contrato de
evento nem de multi-tenancy. Gap de teste apontado pelo backend-reviewer
(achado MINOR 2) fechado nesta rodada. Achado MINOR 1 (double count em
reentrega) é débito pré-existente e aceito, não bloqueia.
