# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T040

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #707
- Branch: `test/003-t040-integration-categorizacao-faixa-preco`
- Commit testado: `f760d9b1dcd74f97e89d197cbaf26b23f90cd5c8`
- Task: T040 [P] [US3] Integration test: item com descrição livre →
  `AgenteCategorizadorItemGateway` retorna categoria do catálogo → regra de
  preço compara contra a `FaixaPreco` correta → resultado determinístico
  (dentro/fora de faixa) independente da IA (issue #150)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
Nenhum arquivo de produção alterado. Diff do PR contra `main`: apenas
`specs/003-validacao-consistencia-orcamentos/tasks.md` (linha T040 marcada
`[x]`) e o novo arquivo de teste
`tests/bounded-contexts/validacao/application/validar-orcamento-categorizacao.integration.test.ts`
(229 linhas, 5 casos).

`ValidarOrcamento`, `AgenteCategorizadorItemGateway` e as 4 regras de
`regras-consistencia.ts` (T024/T042, já mergeadas em T041-T044) foram lidas
integralmente para confirmar que o teste exercita o fluxo real, não uma
reimplementação:
`categorizarItensSemCategoria` (`validar-orcamento.ts:147-185`) só invoca o
agente quando o item não tem `categoria` e há `descricao`, e só quando o
catálogo (`faixasPreco`) não está vazio; o resultado categorizado
substitui o item antes de `validarPrecoDentroDaFaixa` (linha 100) avaliar a
regra de preço — a IA nunca decide "dentro/fora de faixa" sozinha (ADR-002),
apenas seleciona a categoria usada como chave de lookup contra o catálogo.

O teste prova exatamente esse contrato com dois fakes de
`AgenteCategorizadorItemGateway` com ordens de resolução distintas
(`AgenteCategorizadorRapidoFake` resolve na mesma tick;
`AgenteCategorizadorLentoFake` resolve após um `queueMicrotask` adicional,
simulando latência de uma segunda implementação de IA — ex.: outro modelo
Bedrock ou o gateway Ollama local do ADR-009) retornando a mesma categoria
do catálogo (`embalagens`), e confirma:
1. preço dentro da faixa → `VALIDADO` + `OrcamentoValidado`, para as duas
   "IAs" (`it.each`);
2. preço fora da faixa → `PENDENTE_REVISAO_HUMANA` +
   `OrcamentoInconsistenciaDetectada` com `PRECO_FORA_DE_FAIXA`, para as duas
   "IAs" (`it.each`);
3. caso adversarial: preço fora da faixa de "embalagens" mas dentro da faixa
   de outra categoria do catálogo ("material de limpeza") → ainda
   `PRECO_FORA_DE_FAIXA` — prova que a comparação usa a faixa da categoria
   retornada pela IA, nunca aceita por coincidência com outra faixa
   cadastrada.

O nit do `backend-reviewer` (usar microtask em vez de `setTimeout` no fake de
"IA lenta", para não adicionar latência de wall-clock fixa à suíte) foi
corrigido no commit `c2d1e82`; o erro de tipo resultante
(`queueMicrotask` espera `() => void`, e `resolve` de `new Promise` sem
genérico é inferido como `(value: unknown) => void`) foi corrigido no commit
`f760d9b` tipando `new Promise<void>(...)`. Ambos os commits foram lidos e
confirmados equivalentes ao comportamento original (determinismo via
microtask, sem `setTimeout`), sem introduzir nova asserção nem alterar
comportamento do teste.

Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
Critério de aceite de T040 (issue #150) — coberto integralmente:
- item com descrição livre (sem `categoria` conhecida) é categorizado via
  `AgenteCategorizadorItemGateway` antes da regra de preço;
- resultado da regra de preço (dentro/fora de faixa) é o mesmo
  independentemente de qual implementação de IA (ordem de resolução/latência
  distinta) categorizou o item — a determinística é da regra, não da IA;
- a regra de preço compara contra a `FaixaPreco` da categoria retornada,
  nunca aceita por coincidir com outra faixa do catálogo.

US3 (spec.md) — critérios relacionados exercitados por este teste:
- "faixa esperada para a categoria do item" tratada como parâmetro
  configurável por categoria (catálogo de duas faixas distintas,
  `ParametroFaixaPrecoGatewayFake`), não valor fixo hardcoded na regra;
- inconsistência de preço fora de faixa gera
  `OrcamentoInconsistenciaDetectada` com a regra `PRECO_FORA_DE_FAIXA`
  identificável (comportamento esperado descrito em `spec.md`, seção
  "Inconsistência detectada").

Não coberto por este teste, não é lacuna desta task (fora de escopo de
T040, já testado em tasks anteriores mergeadas):
- `BedrockCategorizadorItemGateway` real (chamada AWS) — T041/#151,
  coberto por `bedrock-categorizador-item.gateway.test.ts` (mock de client).
- `BedrockCategorizacaoACL` (rejeição de categoria fora do catálogo na
  saída estruturada do modelo) — T039/#149,
  coberto por `bedrock-categorizacao.acl.test.ts`.
- Persistência real via Drizzle e endpoints HTTP de
  `faixas-preco-categoria` — T043/T044, cobertos por testes próprios
  (`drizzle-faixa-preco.repository.test.ts`,
  `faixa-preco-categoria.controller.test.ts`).

## 4. Suítes executadas e comandos
Ambiente: worktree isolado (`test/003-t040-integration-categorizacao-faixa-preco`
@ `f760d9b`). `pnpm test` (Allure) não usado diretamente — mesma
incompatibilidade `allure-vitest`/path com espaço já documentada no
`CLAUDE.md` do repo; contornado com `npx vitest run --reporter=default`.

- `npx vitest run --reporter=default tests/bounded-contexts/validacao/application/validar-orcamento-categorizacao.integration.test.ts`
  → 5 testes passed, 0 falhas.
- `npx vitest run --reporter=default tests/bounded-contexts/validacao`
  (regressão completa do BC) → 38 arquivos passed, 3 skipped (integração
  Postgres/Drizzle sem `DATABASE_URL` local, pré-existente, não relacionado
  a T040); 231 testes passed, 20 skipped, 0 falhas.
- `npx vitest run --reporter=default ... --coverage.enabled` restrito a
  `validar-orcamento.ts` + `regras-consistencia.ts`, usando os 3 arquivos de
  teste de `application/` que exercitam `ValidarOrcamento`
  (`validar-orcamento-categorizacao.integration.test.ts`,
  `validar-orcamento.test.ts`, `validar-orcamento.integration.test.ts`) → 16
  testes passed; cobertura consolidada abaixo (seção 7).
- `pnpm typecheck` (`tsc --noEmit`) → sem erros.
- `pnpm lint` (`eslint .`, repositório completo) → sem achados.
- CI do PR #707 (`gh pr view 707`): workflow `ci` = SUCCESS no commit
  `f760d9b`; `pnpm typecheck`, `pnpm lint` e `vitest run` (Linux, sem o
  problema de path com espaço) verdes.

## 5. Quantidade de testes por tipo
- Integração (escopo desta task): 5 no arquivo
  `validar-orcamento-categorizacao.integration.test.ts` (2 `it.each` com 2
  variantes de IA cada = 4, + 1 caso adversarial).
- Regressão do BC `validacao` completo (pré-existente, não alterada por esta
  task): 226 testes adicionais (231 − 5), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T040): 5
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 231 passed, 20 skipped (integração
  Postgres/Drizzle, ambiental), 0 falhas

## 7. Cobertura inicial e final
Não houve alteração de produção nesta task — cobertura de
`validar-orcamento.ts` e `regras-consistencia.ts` já existia via
`validar-orcamento.test.ts`/`validar-orcamento.integration.test.ts`
(mergeados em T042/T024). Medição com os 3 arquivos de `application/` que
exercitam `ValidarOrcamento`, incluindo o novo teste desta task:

- Statements: 94.73% (54/57)
- Branches: 88.23% (30/34)
- Functions: 100% (15/15)
- Lines: 94.54% (52/55)

Linha não coberta em `validar-orcamento.ts` (162): ramo de item já
categorizado dentro do `Promise.all` de `categorizarItensSemCategoria`
(`item.categoria` truthy) — coberto indiretamente por
`validar-orcamento.test.ts` em outro cenário, não pela task 040
especificamente; risco já testado, não lacuna introduzida por este PR.
Linhas não cobertas em `regras-consistencia.ts` (28, 95): ramos de outras
regras (`validarCamposObrigatorios`/`validarPrazoCoerente`) fora do escopo
de categorização, cobertos por `regras-consistencia.test.ts` (não incluído
neste recorte de cobertura). Nenhum threshold reduzido; nenhum arquivo
excluído da medição para inflar percentual.

## 8. Allure
Não gerado nesta execução: reporter Allure do projeto (`pnpm test`)
ambientalmente incompatível com path local contendo espaço — mesma condição
documentada no `CLAUDE.md` do repositório e em relatórios QA anteriores da
mesma spec (T038, T039, T043). Execução e evidência usam `vitest run
--reporter=default` com output completo capturado acima. Sem dados
sensíveis: os únicos valores usados no teste são CNPJ sintético válido
(`11222333000181`), categorias fictícias (`embalagens`, `material de
limpeza`) e valores monetários de teste em BRL.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Nenhum introduzido por esta task — apenas teste novo sobre código já
  mergeado e coberto (T041-T044).
- Revisão de código (`backend-reviewer`) já aprovou com 1 nit (microtask em
  vez de `setTimeout`), corrigido nos commits `c2d1e82`/`f760d9b` e
  reconfirmado nesta validação.
- Ramo "item já categorizado" de `categorizarItensSemCategoria` (linha 162)
  não é exercitado por este arquivo especificamente, mas é coberto por
  `validar-orcamento.test.ts` — sem lacuna de risco não testado.

## 11. Limitações do ambiente
- `pnpm test` (Allure) quebra por incompatibilidade `allure-vitest` com path
  local contendo espaço — ambiental, conhecida, contornada com `npx vitest
  run --reporter=default` (documentado no `CLAUDE.md`).
- 3 arquivos de teste de integração Postgres/Drizzle skipped por ausência de
  `DATABASE_URL` local — não relacionado a T040; CI roda esses testes de
  verdade em Linux.
- Este teste específico (T040) não depende de banco — sem impacto da
  limitação acima no escopo desta validação.

## 12. Parecer final
APROVADO PELO QA
