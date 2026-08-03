# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T036

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #602
- Branch: `146-t036-decisao-humana-validacao`
- Commit testado: `5300caa` (2ª rodada, após achados MAJOR do `backend-reviewer`)
- Task: T036 [US2] Interface: controller
  `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana` (issue #146)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
Arquivo de produção novo: `decisao-humana.controller.ts` — parse (Zod) +
delegate, sem regra de negócio (achado da 1ª rodada do `backend-reviewer` já
corrigido: orquestração movida para `RegistrarDecisaoHumanaValidacao.construirDecisao`,
Application). Aggregate e VO ganharam campo opcional `justificativa`, aditivo,
sem quebrar chamadas existentes; exposto no histórico do GET status.

Inspecionei linha a linha:
- `registrarDecisaoHumana` (aggregate) só transiciona a partir de
  `PENDENTE_REVISAO_HUMANA` (`TransicaoInvalidaValidacaoError` fora disso);
  nunca marca `VALIDADO`/`VALIDADO_COM_RESSALVA` sem decisão humana explícita
  (Princípio IV / ADR-001) — condição testada em `orcamento-validacao.aggregate.test.ts`
  (pré-existente) e nos testes desta PR.
- `construirDecisao` (Application) reavalia as 3 regras determinísticas sem
  I/O externo sobre `dadosCorrigidos` mesclado a `dadosExtraidos` atual;
  `PRECO_FORA_DE_FAIXA`/`CNPJ_DIVERGENTE_CADASTRO` (dependem de gateway,
  T022/T023) são **carregadas do histórico, nunca recalculadas nem
  descartadas** — evita autoaprovação silenciosa. Verificado com teste
  dedicado (`CORRECAO_APLICADA nunca descarta PRECO_FORA_DE_FAIXA/...`).
- `justificativa` é persistida em `TentativaValidacao` (append-only,
  histórico nunca sobrescrito) e propagada ao GET status — auditabilidade
  confirmada via contract test (`historico.at(-1)` com `justificativa`).
- 409 Problem Details mapeado de `TransicaoInvalidaValidacaoError`; 404 de
  `OrcamentoValidacaoNaoEncontradoError`/`OrcamentoIdInvalidoError`; 400 para
  params/body inválidos e para `dadosCorrigidos` que não reconstrói
  `DadosExtraidosParaValidacao`/`PeriodoValidade` válidos.

Gap de teste encontrado (infraestrutura de teste, não defeito de produção):
o catch do controller para `DadosExtraidosParaValidacaoInvalidosError`/
`PeriodoValidadeInvalidoError` → 400 só era exercitado via teste unitário de
`construirDecisao` (chamada direta), nunca via `app.inject` fim a fim.
Corrigido por este QA — ver seção 3.

Nenhum defeito de produção encontrado. Nenhuma asserção foi enfraquecida.

## 3. Requisitos cobertos e não cobertos
Cobertos (todos os critérios de aceite testáveis de US2 relevantes a esta task):
- 200 `CORRECAO_APLICADA` sem inconsistência remanescente → `VALIDADO`,
  publica `OrcamentoValidado`, `justificativa` no histórico.
- 200 `ACEITE_COM_RESSALVA` → `VALIDADO_COM_RESSALVA`, publica
  `OrcamentoValidadoComRessalva`, `justificativa` no histórico.
- 409 Problem Details quando status atual ≠ `PENDENTE_REVISAO_HUMANA`.
- 404 Problem Details para `orcamentoId` sem validação registrada.
- 400 quando `CORRECAO_APLICADA` vem sem `dadosCorrigidos`.
- 400 quando body não tem `justificativa`.
- 400 quando `orcamentoId` malformado.
- 400 quando `dadosCorrigidos.periodoValidade` não reconstrói um
  `PeriodoValidade` válido — **teste novo adicionado por este QA**
  (`tests/bounded-contexts/validacao/contract/decisao-humana.controller.test.ts`,
  fechando o gap de cobertura do catch `DadosExtraidosParaValidacaoInvalidosError`/
  `PeriodoValidadeInvalidoError` a nível de contrato HTTP).
- Fail-safe de inconsistências dependentes de gateway (nunca descartadas por
  decisão humana sobre outro campo) — `construirDecisao`, unit test dedicado.

Não coberto / risco residual, não bloqueante:
- `construirDecisao`: branch `dadosCorrigidos ?? {}` (linha 87) e o merge de
  `dataEmissaoProposta` (linha 100) não têm teste dedicado — mesmo padrão de
  merge já validado para `cnpjFornecedor`/`condicoesComerciais`/`periodoValidade`,
  risco baixo (lógica simétrica, sem branch de negócio nova). Registrado, não
  corrigido — YAGNI, cobertura já suficiente para o risco.
- `decisao-humana.schema.ts` (`justificativa: z.string()`, pré-existente,
  fora do diff desta PR) não impõe `min(1)` — uma `justificativa: ""` passa o
  shape. Não é defeito introduzido por T036; registrado como risco residual
  de contrato para avaliação do dev-back-end/arquiteto se a auditabilidade
  exigir texto não vazio.
- Persistência real (Drizzle/Postgres) do histórico com `justificativa` —
  `drizzle-orcamento-validacao.repository.test.ts` `skipIf` por ausência de
  Docker local, condição pré-existente não introduzida por T036.

## 4. Suítes executadas e comandos
Ambiente: Node do sistema é v18 (incompatível), executado com
`/Users/paulolopes/.nvm/versions/node/v24.18.1/bin/node`. Reporter
`allure-vitest` removido temporariamente de `vitest.config.ts` só para
execução local (restaurado com `git checkout -- vitest.config.ts` ao final,
não commitado) — incompatibilidade ambiental pré-existente
(`allure-vitest/vitest`), não relacionada a este diff.

- `pnpm vitest run tests/bounded-contexts/validacao` → 32 arquivos passaram
  (186 testes), 3 arquivos skipped (15 testes, integração Postgres real sem
  Docker, `describe.skipIf` pré-existente). Zero falhas.
- Após o teste novo adicionado por este QA: 187 testes passaram, 15 skipped.
- `pnpm typecheck` → sem erros.
- `pnpm eslint` nos arquivos de produção e teste alterados/criados pela PR e
  pelo QA → sem achados.
- `pnpm vitest run tests/bounded-contexts/validacao --coverage` → cobertura
  por diretório (ver seção 7).

## 5. Quantidade de testes por tipo
- Unitário (Application, `construirDecisao` + `executar`): 10 no arquivo da
  task (6 novos de `construirDecisao` + 4 pré-existentes de `executar`).
- Contrato HTTP (`app.inject`, fakes in-memory de repositório/publisher): 8
  (7 do dev + 1 adicionado por este QA).
- Regressão do BC `validacao` completo: 169 testes adicionais, reexecutados
  sem falha.

## 6. Resultado
- Aprovados (escopo T036, incluindo o teste adicionado pelo QA): 18
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 187 passed, 15 skipped (integração Postgres,
  ambiental), 0 falhas

## 7. Cobertura inicial e final
Antes do teste adicionado pelo QA (`decisao-humana.controller.ts`):
- Statements: 86.11% — Branches: 73.68% — Functions: 100% — Lines: 86.11%
  (linhas 114-127 descobertas: catch de `DadosExtraidosParaValidacaoInvalidosError`/
  `PeriodoValidadeInvalidoError`)

Depois (com o teste do QA):
- Statements: 97.22% — Branches: 94.73% — Functions: 100% — Lines: 97.22%
  (resta só a linha 127, `throw erro` de fallback para erro não mapeado —
  defensivo, sem cenário de negócio correspondente a simular sem violar a
  interface pública do use case).

`registrar-decisao-humana-validacao.ts` (Application, inclui `construirDecisao`):
Statements 100% — Branches 94.44% (2 branches de merge simétrico não
exercitadas, seção 3) — Functions 100% — Lines 100%.

Threshold do projeto não foi reduzido; nenhum arquivo foi excluído da medição
para inflar percentual.

## 8. Allure
Não gerado nesta execução: reporter `allure-vitest` incompatível com a versão
local do `vitest` (ambiental, pré-existente, não relacionado a este diff).
Evidência é a saída completa de `vitest run` capturada acima. Nenhum dado
sensível nos testes — apenas UUIDs sintéticos e strings de negócio
(`"CNPJ corrigido após contato com o fornecedor."`).

## 9. Bugs por severidade e status
Nenhum bug de produção encontrado.

## 10. Riscos residuais
- `justificativa` aceita string vazia no contrato de borda (schema
  pré-existente, fora do diff) — ver seção 3, informar dev-back-end/arquiteto
  se auditabilidade exigir texto não vazio.
- Merge de `dataEmissaoProposta`/fallback `dadosCorrigidos ?? {}` em
  `construirDecisao` sem teste dedicado (mesmo padrão já validado para os
  outros 3 campos) — risco baixo.
- `ponytail:` documentado no próprio código de produção: correção de item
  individual (`itens[]`) não suportada nesta primeira versão — decisão de
  escopo do dev-back-end, não um gap de teste.

## 11. Limitações do ambiente
- Node do sistema (PATH) é v18, incompatível com `pnpm`/`vitest`; execução
  requer o binário Node 24 explícito.
- Reporter `allure-vitest` quebra localmente (bug de compat, não deste diff);
  contornado removendo temporariamente a entrada de `vitest.config.ts` e
  restaurando via `git checkout` ao final — nada commitado.
- Testes de integração Postgres (3 arquivos, 15 testes) skipped por ausência
  de Docker local — não relacionado a T036 (controller/caso de uso testados
  com fakes in-memory).

## 12. Parecer final
APROVADO PELO QA
