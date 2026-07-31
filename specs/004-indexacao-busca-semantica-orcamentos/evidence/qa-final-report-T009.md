# QA Final Report — T009 (PR #476)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- PR: #476 (draft), branch feat/004-busca-indexacao (Closes #169)
- Commit: 3fca7b7
- Task: T009 — Domain: implementar VO `Embedding` — construtor valida
  `vetor.length === dimensao`; sem lógica de similaridade (isso é query,
  não Domain).

## Resumo executivo
Primeira validação (sem reteste anterior). VO implementado em
`src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.ts`
com factory estático `de()` (construtor privado), estrutura
`{ vetor, dimensao, modeloId, geradoEm }` conforme `plan.md` linha 108,
validação central `vetor.length === dimensao` e cópia defensiva do array
`vetor`. Nenhuma lógica de similaridade/distância presente — em linha com o
texto da task e com o comentário do próprio plan.md ("comparação vetorial
... é uma operação de banco"). Já aprovado pelo backend-reviewer (APPROVE,
sem achados de bloqueio).

## Requisitos cobertos
- Invariante central: construtor rejeita `vetor.length !== dimensao`,
  lançando `EmbeddingInvalidoError` (subclasse de `ErroDominio`) antes de
  qualquer `new` — confirmado por teste e leitura de código, e reforçado
  pelo caso de vetor vazio com `dimensao > 0`.
- Estrutura de dados conforme task/plan: `vetor: readonly number[]`,
  `dimensao: number`, `modeloId: string`, `geradoEm: Date` — confere com o
  shape pedido em `plan.md` linha 108.
- Ausência de lógica de similaridade/distância no VO — confirmado por
  leitura de código (única responsabilidade do `de()` é validar e
  construir).
- Cópia defensiva de `vetor` no construtor (spread), impedindo que mutação
  do array original de entrada reflita na instância já construída —
  confirmado por teste dedicado.

## Avaliação das validações extras (`geradoEm`, `modeloId`) — pedido explícito do dev-back-end
A task, no texto literal, menciona apenas a invariante de `length`. O VO
implementado adiciona duas validações não mencionadas na redação da task:
`geradoEm` deve ser uma data válida (`!Number.isNaN(getTime())`) e
`modeloId` não pode ser vazio/whitespace.

Aceito, sem ressalva. Razões:
1. Ambas decorrem diretamente do shape de dados que o próprio `plan.md`
   (linha 108) atribui ao VO — `modeloId: string` e `geradoEm: timestamp`
   fazem parte da definição da entidade, não são campos decorativos.
   Um `Embedding` com `geradoEm` inválido (`Invalid Date`) ou `modeloId`
   vazio não é uma representação vetorial rastreável válida — o
   `plan.md` (Princípio I, rastreabilidade ponta a ponta;
   `TentativaIndexacao.modeloEmbedding`) depende de `modeloId` ser um
   identificador real para reconstruir qual modelo gerou cada embedding.
2. Não contradizem nem enfraquecem o critério de aceite da task — são
   invariantes estruturais adicionais dentro do mesmo VO, não lógica de
   similaridade (que é o único tipo de regra que a task proíbe
   explicitamente).
3. Não ampliam escopo de forma arriscada: são validações de forma (data
   parseável, string não-vazia), não regras de negócio novas sujeitas a
   interpretação.

Não há motivo para reprovar ou pedir remoção dessas validações. NIT do
backend-reviewer (ausência de limite superior de sanidade temporal em
`geradoEm`, ex. não aceitar datas futuras) confirmado como não-acionável:
não há critério de aceite em `spec.md`/`plan.md` que exija esse limite.

## Não coberto / não aplicável
- Uso real do VO pelo agregado `IndiceOrcamento` (T012, ainda não
  implementado) e pelo `AgenteEmbeddingGateway` (T016/T028) — fora do
  escopo de T009.
- Geração real de embeddings via Bedrock — dependente de infraestrutura
  ainda não implementada nesta trilha.

## Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain/value-objects`
  — executado nesta sessão de QA (não apenas relato do dev-back-end): 4
  arquivos (`dinheiro`, `orcamento-id`, `conteudo-indexavel`, `embedding`),
  20 testes, todos passaram (6 do arquivo de T009).
- `npx tsc --noEmit` — sem erros.
- `npx eslint` sobre `embedding.vo.ts` e `embedding.vo.test.ts` — sem
  erros/warnings.
- `npx vitest run --coverage --reporter=default tests/bounded-contexts/busca-indexacao/domain/value-objects`
  — reproduzido o mesmo bug de ambiente do reporter Allure em worktree
  nested (já registrado em T003-T008 desta trilha); contornado com
  `--reporter=default`.

## Cobertura
Medida via `coverage/coverage-final.json` isolando o arquivo do diff:
`embedding.vo.ts` — **statements 12/12 (100%)**, **branches 6/6 (100%)**.
Todos os ramos de decisão (length igual/diferente, vetor vazio,
geradoEm válido/inválido, modeloId preenchido/vazio, cópia defensiva) estão
exercitados pelos 6 testes do arquivo. Sem lacuna de cobertura no arquivo
desta task.

## Allure
Não gerado nesta sessão: mesmo bug de ambiente do reporter `allure-vitest`
em worktree nested já registrado em T003-T008 (`setup.ts` não resolve o
runner). `allure-results/` não populado. Testes confirmados via
`--reporter=default`, workaround já validado como seguro nas validações
anteriores desta trilha.

## Bugs
Nenhum defeito de produção encontrado.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
- Bug de ambiente do reporter `allure-vitest` em worktree nested continua
  sem correção definitiva (mesmo item já registrado em T003-T008); sem
  evidência Allure gerada para T009.
- VO ainda sem consumidor real (`AgenteEmbeddingGateway`/`IndiceOrcamento`
  chegam em T012/T016/T028) — qualquer incompatibilidade de formato só
  será detectada quando esses componentes forem implementados e testados.

## Limitações do ambiente
`pnpm test` (via `allure-vitest` reporter) inoperante neste worktree
nested — mesmo bug já registrado em T003-T008. Testes confirmados via
`npx vitest run --reporter=default`.

## Parecer final
APROVADO PELO QA

Critério de aceite de T009 cumprido literalmente: VO `Embedding` com
construtor privado + factory `de()`, validando `vetor.length === dimensao`
como invariante central (erro de domínio `EmbeddingInvalidoError`, nunca
instância "válida" com length divergente) e sem qualquer lógica de
similaridade/distância. Estrutura de dados conforme `plan.md` linha 108.
Validações extras (`geradoEm`, `modeloId`) são consistentes com o shape de
dados definido no plan e não configuram lógica de negócio proibida —
aceitas sem ressalva. Execução real dos 6 testes confirmada nesta sessão
(não apenas relato do dev-back-end): todos passam. `tsc`/`eslint` sem
erros. Cobertura 100% (statements/branches) no arquivo do diff, medida via
`coverage-final.json`. Cópia defensiva do array `vetor` confirmada testada.
Sem defeito de produção.
