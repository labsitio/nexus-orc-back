# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T039

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #672
- Branch: `feat/003-categorizacao-item`
- Commit testado: `e88250bbfece550ca4f9f87174b69bd0b581b6b7`
- Task: T039 [P] [US3] Unit test `BedrockCategorizacaoACL` (issue #149)
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
Arquivo de produção novo: `src/bounded-contexts/validacao/infrastructure/
bedrock-categorizacao.acl.ts` — ACL pura de tradução (sem chamada AWS) da
saída estruturada (tool-use/JSON Schema) do Bedrock para `CategoriaItem`.
Mesmo padrão de `BedrockInterpretacaoConsultaACL` (spec 004, T033) e
`BedrockExtracaoACL` (spec 002): o JSON bruto do modelo nunca cruza para o
Domain sem passar por um tradutor explícito, e o modelo nunca decide sozinho
que categoria existe — `converter()` rejeita (nunca "corrige para o mais
próximo") qualquer `categoria` fora do `catalogoCategorias` informado pelo
chamador, com `Array.includes` (comparação exata, sem normalização de case
nem fuzzy match).

Type guard `ehCategorizacaoBruta` confirma o shape estrutural (`categoria`
string) antes de repassar a `BedrockCategorizacaoACL.converter`, mesma
disciplina defensiva das ACLs análogas.

Escopo confirmado contra `tasks.md` (Phase 5, US3): T039 é explicitamente
apenas a ACL de tradução; `BedrockCategorizadorItemGateway` (chamada Bedrock
real, catálogo vindo de `faixas_preco_categoria`) permanece escopo de
T041/#151 — nenhuma integração AWS real testada ou esperada nesta task.

Nenhum defeito de produção encontrado.

## 3. Requisitos cobertos e não cobertos
Cobertos (escopo de T039, critério de aceite "saída estruturada restrita ao
catálogo de categorias, nunca uma categoria inventada"):
- shape guard aceita `{ categoria: string }`, rejeita objeto sem campo,
  `null`, `undefined`, tipo incorreto (`categoria: 42`) e valor não-objeto
  (`'ferragens'` cru);
- conversão bem-sucedida quando `categoria` pertence ao catálogo;
- rejeição (`BedrockCategorizacaoACLInvalidaError`) quando `categoria` não
  pertence ao catálogo, incluindo caso de grafia parecida com case diferente
  (`'Ferragens'` vs `'ferragens'` no catálogo) — confirma que não há
  normalização implícita que mascare uma categoria inventada pelo modelo;
- catálogo vazio configurado → nenhuma categoria é aceita, nem mesmo uma que
  seria válida com catálogo não vazio;
- delegação da regra "categoria não vazia" ao VO real (`CategoriaItem.de`):
  quando `categoria` pertence ao catálogo mas é string vazia, o erro
  propagado é `CategoriaItemInvalidaError` (do Domain), não um erro da ACL —
  confirma que a ACL não duplica a regra de VO, apenas a restrição de
  catálogo que é responsabilidade dela.

Não coberto / fora do escopo desta task, não lacuna:
- chamada real ao Bedrock (tool-use/JSON Schema request/response) — depende
  de `BedrockCategorizadorItemGateway`, T041/#151, ainda não implementado;
- catálogo real vindo de `faixas_preco_categoria` via
  `ParametroFaixaPrecoGateway` — mesma dependência de T041.

## 4. Suítes executadas e comandos
Ambiente: worktree isolado em commit `e88250b` (branch principal do
repositório está sob uso concorrente de múltiplos agentes; `node_modules`
linkado via junction NTFS ao repo principal para evitar reinstalação).

- `npx vitest run tests/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.test.ts --coverage.enabled --coverage.include='src/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.ts'`
  → 7 testes passed, 0 falhas; cobertura do arquivo: 100% statements/branches/functions/lines.
- `npx vitest run tests/bounded-contexts/validacao` (regressão completa do BC)
  → 34 arquivos passed, 3 skipped (integração Postgres/Drizzle sem
  `DATABASE_URL` local, pré-existente, não relacionado a T039); 206 testes
  passed, 17 skipped, 0 falhas.
- `npx tsc --noEmit -p .` → sem erros.
- `npx eslint src/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.ts tests/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.test.ts`
  → sem achados.
- `gh pr view 672` / `gh run list --branch feat/003-categorizacao-item` →
  nenhum workflow de CI disparado para este branch/PR (apenas check neutro
  de "Vulnerability analysis" via Debricked, não relacionado a testes).

## 5. Quantidade de testes por tipo
- Unitário (escopo desta task): 7 no arquivo
  `bedrock-categorizacao.acl.test.ts` (2 do type guard `ehCategorizacaoBruta`
  + 5 da classe `BedrockCategorizacaoACL`).
- Regressão do BC `validacao` completo (pré-existente, não alterada por esta
  task): 199 testes adicionais (206 − 7), reexecutados sem falha.

## 6. Resultado
- Aprovados (escopo T039): 7
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 206 passed, 17 skipped (integração
  Postgres/Drizzle, ambiental), 0 falhas

## 7. Cobertura inicial e final
Arquivo desta task (`bedrock-categorizacao.acl.ts`) isolado: 100% statements
(8/8), branches (6/6), functions (3/3), lines (7/7) — todas as decisões
(`ehCategorizacaoBruta` guard, `includes` no catálogo, delegação a
`CategoriaItem.de`) exercitadas nos dois sentidos.

BC `validacao` completo (contexto, não indicador direto desta task pontual):
- Statements: 89.71% (445/496)
- Branches: 91.16% (227/249)
- Functions: 84.1% (127/151)
- Lines: 89.97% (440/489)

Não havia `coverage-baseline.md` registrado para comparação incremental
específica desta task. Nenhum threshold reduzido; nenhum arquivo excluído da
medição para inflar percentual.

## 8. Allure
Não gerado nesta execução: reporter Allure do projeto (`pnpm test`)
ambientalmente incompatível com a versão local do vitest — mesma condição
`project_allure_vitest_incompat` já registrada em relatórios QA anteriores da
mesma spec (T038, T035, T029). Execução e evidência usam `vitest run` com
output completo capturado acima. Sem dados sensíveis: os únicos valores
usados no teste são categorias sintéticas (`ferragens`, `eletrica`,
`hidraulica`, `categoria-inventada-pelo-modelo`).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Nenhum introduzido por esta task. A ACL depende de receber o catálogo
  correto do chamador (`BedrockCategorizadorItemGateway`, T041) — a
  responsabilidade de montar `catalogoCategorias` a partir de
  `faixas_preco_categoria` fica fora do escopo verificável agora; quando
  T041 existir, cabe reteste de integração (catálogo real x resposta real do
  Bedrock).
- Revisão de código (`backend-reviewer`) já aprovou sem achados (APPROVE).

## 11. Limitações do ambiente
- `pnpm test` (Allure) quebra por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run`.
- 3 arquivos de teste de integração Postgres/Drizzle skipped por ausência de
  `DATABASE_URL` local — não relacionado a T039.
- Nenhum workflow de CI (GitHub Actions) disparado para este branch/PR no
  momento da validação — apenas verificado localmente.
- Diretório de trabalho principal do repositório está sob uso concorrente de
  múltiplos agentes; validação executada em worktree isolado
  (`feat/003-categorizacao-item` @ `e88250b`) para evitar interferência de
  HEAD mutável.

## 12. Parecer final
APROVADO PELO QA
