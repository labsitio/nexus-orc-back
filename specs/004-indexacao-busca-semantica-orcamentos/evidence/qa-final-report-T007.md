# QA Final Report — T007 (PR #473)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- PR: #473 (draft), branch feat/004-busca-indexacao (Closes #167)
- Commit: 546b378
- Task: T007 — Domain: implementar VOs `OrcamentoId`, `Dinheiro`
  (redefinidos localmente neste BC, mesma validação das specs 001-003, sem
  import cruzado) em
  `src/bounded-contexts/busca-indexacao/domain/value-objects/`.

## Resumo executivo
Primeira validação (sem reteste anterior). VOs redefinidos byte a byte
equivalentes aos já em produção em
`src/bounded-contexts/validacao/domain/value-objects/{orcamento-id,dinheiro}.vo.ts`
(mesma regex UUID v7, mesma validação de `valorCentavos` inteiro >= 0,
mesma normalização de moeda para maiúsculas, mesmos erros de domínio).
Confirmado por `grep` que nenhum arquivo em
`src/bounded-contexts/busca-indexacao/domain/` importa de outro BC
(`validacao`, `classificacao`, `extracao`) nem do shared-kernel. Já
aprovado pelo backend-reviewer (APPROVE, sem achados).

## Requisitos cobertos
- `OrcamentoId.de` valida UUID v7 via regex idêntica à de `validacao`;
  rejeita valor inválido lançando `OrcamentoIdInvalidoError`; `equals`
  compara por valor — confirmado por teste e leitura de código.
- `Dinheiro.de` valida `valorCentavos` inteiro >= 0 (rejeita negativo e
  fracionário), rejeita moeda vazia/em branco, normaliza moeda para
  maiúsculas, `equals` compara por valor — confirmado.
- Ausência de import cruzado (critério explícito da task) — confirmado por
  `grep -rn "bounded-contexts/validacao\|bounded-contexts/classificacao\|bounded-contexts/extracao\|shared-kernel" src/bounded-contexts/busca-indexacao/domain/`,
  sem ocorrência.
- `ErroDominio` local ao BC (não reaproveita a classe de `validacao`) —
  redefinição local conforme convenção herdada, consistente com o padrão
  já usado nas specs 001-003 (cada BC tem sua própria hierarquia de erro).

## Não coberto / não aplicável
- Agregado `IndiceOrcamento` (T012) e demais VOs (T008-T011) — fora do
  escopo de T007, ainda não implementados.

## Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.test.ts tests/bounded-contexts/busca-indexacao/domain/value-objects/dinheiro.vo.test.ts`
  — executado nesta sessão de QA (não apenas relato do dev-back-end): 2
  arquivos, 7 testes, todos passaram.
- `npx tsc --noEmit -p tsconfig.json` — sem erros.
- `npx eslint` nos 5 arquivos do diff (produção + teste) — sem
  erros/warnings.
- `npx vitest run tests/.../orcamento-id.vo.test.ts` (sem
  `--reporter=default`) — reproduzido o erro "Vitest failed to find the
  runner" apontando para `allure-vitest/src/setup.ts`, confirmando que é
  bug de ambiente do reporter Allure configurado em `vitest.config.ts`
  neste worktree nested, não relacionado ao diff de T007 (mesmo sintoma já
  diagnosticado em T003/T004/T005 desta trilha).

## Cobertura
Não medida via `pnpm test` (bloqueado pelo bug de ambiente acima). Os 7
testes exercitam 100% dos ramos de decisão de ambos os VOs (válido/inválido
de UUID, `valorCentavos` válido/negativo/fracionário, moeda vazia/normal),
sem branch relevante sem cobertura visível por leitura de código — VOs sem
complexidade estrutural adicional que justifique medição de cobertura
agregada isolada.

## Allure
Não gerado nesta sessão: o reporter `allure-vitest` configurado em
`vitest.config.ts` falha neste worktree nested (bug de ambiente,
independente do diff). `allure-results/` não foi populado. Testes
executados e confirmados via `--reporter=default` (bypass do reporter
Allure).

Sobre o workaround do dev-back-end (`npx vitest run --reporter=default`):
válido e seguro para uso nas próximas validações desta trilha — reproduzido
nesta sessão, confirma que a falha é isolada ao reporter Allure (a flag
`--reporter` no CLI sobrescreve a lista de `reporters` do
`vitest.config.ts`, removendo o reporter Allure problemático da execução;
o runner, os testes e as asserções em si não são afetados). Recomendação:
registrar o bug de ambiente (setup.ts do allure-vitest não resolvendo o
runner em worktree nested/pnpm) como item de risco de infraestrutura de
testes para investigação por DevOps/Tech Lead fora do ciclo desta task —
QA não pode alterar `vitest.config.ts`/infraestrutura compartilhada de
Allure sem ferir o escopo desta validação pontual, mas o ajuste, quando
feito, é infraestrutura de testes (dentro da autoridade do QA), não código
de produção.

## Bugs
Nenhum defeito de produção encontrado.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
- Bug de ambiente do reporter `allure-vitest` em worktree nested continua
  sem correção definitiva (mitigado pelo workaround `--reporter=default`);
  sem evidência Allure gerada para T007, assim como para T003-T005.
- T012 (agregado `IndiceOrcamento`) depende destes VOs; qualquer regressão
  neles só será detectada quando os testes do agregado forem escritos.

## Limitações do ambiente
`pnpm test` (via `allure-vitest` reporter) inoperante neste worktree
nested — mesmo bug já registrado em T003/T004/T005. Testes confirmados via
`npx vitest run --reporter=default`.

## Parecer final
APROVADO PELO QA

Critério de aceite de T007 cumprido literalmente: VOs `OrcamentoId` e
`Dinheiro` redefinidos localmente no BC Busca & Indexação, com a mesma
validação (regex UUID v7, `valorCentavos` inteiro >= 0, normalização de
moeda) das specs 001-003, sem nenhum import cruzado de outro BC ou do
shared-kernel (confirmado por grep). Execução real dos 7 testes confirmada
nesta sessão de QA (não apenas relato do dev-back-end): todos passam.
`tsc`/`eslint` sem erros. Testes cobrem os casos relevantes de cada VO
(UUID válido/inválido, `equals`, `valorCentavos` negativo/fracionário,
moeda vazia, normalização de moeda) sem lacuna óbvia. Sem defeito de
produção.
