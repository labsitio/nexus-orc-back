# QA Final Report — T023 (PR #708, issue #229) — Contract test: GET /v1/orcamentos/{orcamentoId}/workflow/status (BC orquestracao)

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- Issue: #229
- PR: #708 (labsitio/nexus-orc-back)
- Branch: feat/229-t023-contract-test-status-workflow
- Commit testado: d6a4c8e
- Primeira validação (não é reteste de BUG).
- `backend-reviewer` já retornou APPROVE WITH NITS — único achado (uso de `app.close()` dentro do próprio
  `it` no caso 401, em vez de só no `afterEach`) é padrão pré-existente no arquivo (mesmo racional já usado
  no caso "500" mais abaixo, linha 286) e não é regressão desta PR. Não substitui o gate; QA valida de forma
  independente abaixo.

## Resumo executivo
Sem alteração de código de produção. Diff restrito a 2 arquivos: `tests/bounded-contexts/orquestracao/contract/status.controller.test.ts`
(+66 linhas, 2 casos novos adicionados ao arquivo já existente desde T030/#236) e `specs/005-orquestracao-workflow-integracoes/tasks.md`
(T023 marcado concluído). Os 7 casos pré-existentes (AGUARDANDO_CONTEXTO, DECIDIDO, PENDENTE_REVISAO_HUMANA,
404 não encontrado, 400 orcamentoId malformado, 404 tenant divergente, 500 erro de infraestrutura) não foram
tocados.

## Requisitos cobertos
Critério de aceite da task (completar o contract test do endpoint de status com os 2 casos reais do
contrato ainda não exercitados):

1. **200 `CONTEXTO_CONSOLIDADO`** — verifica serialização de `contextoClassificacao`, `contextoExtracao` e
   `contextoValidacao` no corpo da resposta. Antes desta PR, nenhum teste do arquivo montava um agregado com
   os 3 contextos preenchidos e decisão ainda não tentada; os únicos testes que passavam por
   `consolidarContexto()` (DECIDIDO/PENDENTE_REVISAO_HUMANA) só assertavam `status`/`decisaoAtual`/`historico`,
   nunca os campos de contexto. Coberto — comparei o corpo esperado no teste (`status.controller.test.ts:193-207`)
   linha a linha contra a função `paraResposta` em `status.controller.ts:42-65`: os três blocos condicionais
   (`contextoClassificacao`, `contextoExtracao`, `contextoValidacao` com `resultado`+`inconsistenciasAceitas`)
   são exatamente os exercitados.
2. **401 Problem Details — fallback defensivo sem `tenantContext`** — cobre `status.controller.ts:101-111`
   (branch `if (!tenantId)`), que nenhum dos 7 casos anteriores alcançava (todos usam
   `criarPreHandlerFakeTenant`, que sempre popula `request.tenantContext`). O novo caso troca o `preHandler`
   por um que não popula nada (`{ preHandler: async () => {} }`) e assere `401` + `content-type:
   application/problem+json`. Coberto.

Nenhuma lacuna quanto ao escopo declarado da task.

## Verificação independente (reexecutada pelo QA)
1. `git log -1 d6a4c8e` — commit único no PR, sem arquivos de produção no diff (`git diff main...HEAD --stat`
   confirma apenas os 2 arquivos declarados: o teste e `tasks.md`).
2. Leitura completa de `status.controller.ts` (produção, não alterado) e comparação linha a linha com as
   asserções dos 2 casos novos — ver "Requisitos cobertos" acima. Os dois cenários exercitam ramos de código
   reais (não são tautológicos): removendo mentalmente qualquer um dos blocos condicionais em `paraResposta`
   (linhas 46-59) o teste `toEqual` do caso CONTEXTO_CONSOLIDADO quebraria por objeto divergente; removendo o
   `if (!tenantId)` o caso 401 receberia `500` (o use case tentaria `executar(..., undefined)`), não `401`.
   Não são falsos positivos.
3. Suíte alvo: `npx vitest run --reporter=default tests/bounded-contexts/orquestracao/contract/status.controller.test.ts`
   — 9/9 PASS (7 pré-existentes + 2 novos).
4. Cobertura isolada do arquivo de produção do endpoint:
   `npx vitest run --reporter=default tests/bounded-contexts/orquestracao/contract/status.controller.test.ts --coverage --coverage.include="src/bounded-contexts/orquestracao/interface/http/status.controller.ts"`
   — Statements 100% (23/23), Branches 92.3% (24/26), Functions 100% (6/6), Lines 100% (23/23). Branches não
   cobertas: linhas 18-22 (`paraDecisaoRoteamentoResposta` — `nivelConfianca?.valor ?? null` quando
   `nivelConfianca` é `undefined`, e a inclusão condicional de `motivoDadoAusente`). Fora do escopo desta task
   — esses ramos pertencem à serialização de `DecisaoRoteamento`/`decisaoAtual`, já exercitada por outros
   casos deste mesmo arquivo (DECIDIDO) e por `decisao-humana.controller.test.ts`; nenhum caso hoje monta uma
   tentativa sem `nivelConfianca` ou com `motivoDadoAusente`. Risco pré-existente, não introduzido nem
   agravado por este PR.
5. Suíte completa do BC: `npx vitest run --reporter=default tests/bounded-contexts/orquestracao` — 236
   passed, 17 skipped (persistência Drizzle, sem `DATABASE_URL` no ambiente local — mesma limitação já
   registrada em relatórios QA anteriores desta spec). Sem regressão.
6. `npx tsc --noEmit -p .` — exit 0, sem erros.
7. `npx eslint tests/bounded-contexts/orquestracao/contract/status.controller.test.ts` — sem achados
   (`tasks.md` gera apenas warning "ignored, no matching configuration", esperado para markdown).

## Suítes executadas e comandos
1. `npx vitest run --reporter=default tests/bounded-contexts/orquestracao/contract/status.controller.test.ts` — 9/9 PASS.
2. `npx vitest run --reporter=default ... --coverage --coverage.include=".../status.controller.ts"` — Stmts 100%, Branch 92.3%, Funcs 100%, Lines 100%.
3. `npx vitest run --reporter=default tests/bounded-contexts/orquestracao` (regressão do BC) — 236 passed, 17 skipped (Drizzle/DB).
4. `npx tsc --noEmit -p .` — 0 erros.
5. `npx eslint tests/bounded-contexts/orquestracao/contract/status.controller.test.ts` — 0 achados.

## Cobertura inicial e final
Sem alteração de produção — arquivo `status.controller.ts` já existia e já tinha cobertura de 7/9 caminhos
antes desta PR (baseline não medida separadamente em relatório anterior específico deste arquivo). Final,
medida nesta validação: Statements 100% (23/23), Branches 92,3% (24/26), Functions 100% (6/6), Lines 100%
(23/23). Lacuna de branch documentada no item 4 acima — não é lacuna introduzida por este PR, e não bloqueia
o critério de aceite da task (que é especificamente os 2 casos de contrato citados na issue #229).

## Allure
Não aplicável — stack de testes do repositório (vitest) não possui adaptador Allure configurado em nenhuma
spec anterior desta base de código (mesma constatação de relatórios QA anteriores desta spec, ex.
T010/T012/T014/T015/T018/T019/T026/T031). Validação registrada via output determinístico do vitest,
reproduzível pelos comandos acima.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
1. Branch de `paraDecisaoRoteamentoResposta` para `nivelConfianca` ausente e para `motivoDadoAusente`
   presente (`status.controller.ts:18-22`) sem cobertura direta neste arquivo — mitigado parcialmente por
   outros arquivos de contrato do mesmo BC; não é regressão, é lacuna pré-existente. Sem ação necessária para
   fechar esta task; registrar caso uma issue futura queira elevar branch coverage deste controller
   especificamente.
2. Nit do `backend-reviewer` sobre `app.close()` dentro do `it` do caso 401 — estilístico, padrão
   pré-existente no arquivo, não corrigido porque não é falha funcional e QA não corrige teste que já passa
   corretamente sem necessidade.

## Limitações do ambiente
Nenhuma nova. Suíte executada localmente com `--reporter=default` (contorno documentado no `CLAUDE.md` para
path com espaço em `C:\Users\Hugo\...`); CI roda em Linux e não é afetado, já confirmado verde no PR.

## Parecer final
**APROVADO PELO QA**

PR sem alteração de código de produção. Os 2 casos novos exercitam exatamente os ramos de contrato
declarados na issue #229 (serialização dos 3 contextos em CONTEXTO_CONSOLIDADO, fallback defensivo 401 sem
tenantContext) — confirmado por leitura linha a linha do controller e por raciocínio de mutação (remover o
branch correspondente quebra o teste pela razão certa). 9/9 testes do arquivo, 236/236 da suíte do BC, sem
regressão. `tsc` e `eslint` limpos. Cobertura do arquivo de produção 100% em statements/functions/lines,
92,3% em branches (lacuna documentada, pré-existente, fora do escopo da task). Sem defeito de produção a
reportar.
