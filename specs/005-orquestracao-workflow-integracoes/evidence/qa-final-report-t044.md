# QA Final Report — T044 (PR #699, issue #250, absorve #688) — Interface: controller `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana` (BC orquestracao)

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- Issue: #250 (absorve #688)
- PR: #699 (labsitio/nexus-orc-back)
- Branch: feat/250-controller-decisao-humana
- Commit testado: aa6bfad
- Primeira validação (não é reteste de BUG).

## Resumo executivo
PR adiciona 2 arquivos de produção novos: `decisao-humana.schema.ts` (contrato Zod de borda) e
`decisao-humana.controller.ts` (rota `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana`), expondo o
caso de uso já existente `RegistrarDecisaoHumanaWorkflow` (T042/#248, não alterado neste PR) e reaproveitando
`ConsultarStatusDecisaoWorkflow` + `paraResposta` (T030) para montar a resposta 200. Papel
`comprador-responsavel` é exigido via `criarExigenciaPapel` (ADR-010), sempre concatenado ao final do array
de `preHandler` — issue #688 (rota nascer desprotegida) fica estruturalmente impossível, não apenas coberta
por teste: não existe caminho de código para registrar a rota sem o guard. `tenantId` só é lido de
`request.tenantContext` (populado por middleware a partir do JWT verificado), nunca de
body/query/header/path. `requerIntegracaoExterna` é hardcoded `false` no controller, coerente com o contrato
aprovado (`docs/openapi.yaml`, schema `DecisaoHumanaWorkflowRequest`, sem esse campo no corpo). Wiring de
composição raiz (Lambda real, autenticação Cognito de produção) fica fora do escopo de T044 — mesma nota já
registrada em T029/T030/T031 desta spec, deferida para a issue de deploy (#624).

Dev-back-end entregou 12 testes de contrato (a task/handoff citava 11; a contagem real no arquivo é 12).
QA estendeu o arquivo com 3 testes adicionais para fechar os 3 branches de cobertura ainda não exercitados
(fallback 401, `opts` totalmente omitido, rethrow de erro não mapeado) — nenhuma alteração em código de
produção.

## Requisitos cobertos
Mapeado contra `spec.md` (US2) e spec 007 (isolamento multi-tenant):

1. "O comprador, ao revisar e confirmar explicitamente a ação correta, avança o orçamento" — coberto por
   `200 — APROVAR com justificativa registra decisão HUMANO e retorna status DECIDIDO` e
   `200 — SOLICITAR_REENVIO com motivoDadoAusente registra decisão`. `agenteOrigem: 'HUMANO'` é hardcoded no
   agregado (`registrarDecisaoHumana`), o controller não tem campo para forjar outro agente. PASS.
2. "Nunca aprovado automaticamente por tempo/volume/exaustão" — o único caminho de código que chama
   `registrarDecisaoHumana` é este controller, atrás do guard de papel; não há timer, contador de tentativas
   ou trigger de fila que alcance esse método (confirmado por leitura do agregado e do caso de uso, sem
   alteração deste PR). Coerente com o já validado em T040/T042.
3. Autorização por papel (ADR-010) — 3 testes: 403 sem papel `comprador-responsavel` (mesmo com `papeis`
   forjado no corpo, ignorado pelo schema Zod — sem efeito no guard), 403 fail-closed sem preHandler externo
   nenhum, e teste de ordem de execução confirmando autenticação → guard. PASS.
4. Isolamento multi-tenant (spec 007) — `tenantId` só lido de `request.tenantContext`; teste "papeis forjado
   no body" confirma que campos estranhos ao schema são ignorados; teste 404 com tenant divergente
   (`TenantDivergenciaError`) confirma que o agregado de outro tenant não é exposto nem alterado. PASS.
5. Contrato de borda (`docs/openapi.yaml`, `DecisaoHumanaWorkflowRequest`) — `acao`/`justificativa`
   obrigatórios, `motivoDadoAusente` obrigatório quando `acao === 'SOLICITAR_REENVIO'`, inclusive contra
   valor só com espaços (`.trim().min(1)`) — 4 testes 400 cobrindo cada caso, todos com
   `content-type: application/problem+json`. PASS.
6. Mapeamento de erro de domínio → HTTP — 404 (não encontrado / tenant divergente / `orcamentoId` malformado
   nos params) e 409 (transição inválida a partir de status diferente de `PENDENTE_REVISAO_HUMANA`). PASS.
7. Resposta 200 reaproveita o mesmo contrato de `GET .../workflow/status` (`paraResposta`, T030) —
   confirmado por leitura de código (nenhuma tradução duplicada) e pelos `toMatchObject` dos testes 200.

Cobertura adicionada pelo QA (branches defensivos, sem lacuna de requisito):
8. 401 Problem Details quando `request.papeis` está presente mas `request.tenantContext` não é populado
   (defeito de composição hipotético, não de requisição) — antes descrito só em comentário, agora coberto.
9. Rota registrada com `opts` totalmente omitido (`{}` default) continua protegida pelo guard (403) — hoje
   todo `montarApp` do dev-back-end passava `preHandler` explicitamente; este teste comprova o caminho do
   parâmetro default.
10. Erro não mapeado no `catch` (ex.: falha de infraestrutura no repositório) propaga como 500 em vez de
    virar Problem Details silencioso ou ser engolido — comportamento correto de "defesa em profundidade sem
    mascarar bug real".

Nenhuma lacuna de cobertura de requisito identificada para T044/#250.

## Verificação independente (reexecutada pelo QA)
1. `git fetch origin feat/250-controller-decisao-humana`; commit confirmado `aa6bfad`.
2. Leitura completa de `decisao-humana.controller.ts`, `decisao-humana.schema.ts`,
   `registrar-decisao-humana-workflow.ts`, `decisao-workflow.aggregate.ts` (método `registrarDecisaoHumana`),
   `decisao-roteamento.vo.ts` (`DecisaoRoteamento.criar`), `role-guard.middleware.ts` e `status.controller.ts`
   — confirma que os erros mapeados no `catch` (`AprovacaoSemValidacaoError`, `CriterioAusenteError`) são de
   fato estruturalmente inalcançáveis por este controller hoje (agente sempre `'HUMANO'`,
   `ContextoValidacao` só instanciável com resultado aprovável), como documentado no comentário do PR — não
   é afirmação vazia, é verificável por leitura das invariantes.
3. Confirmado no `docs/openapi.yaml` (linhas 1066-1075): `DecisaoHumanaWorkflowRequest` não inclui
   `requerIntegracaoExterna`; `required: [acao, justificativa]` — coerente com o schema Zod implementado.
4. Confirmado que a rota não está wired em nenhuma composição raiz de produção ainda
   (`grep -rn registrarRotaDecisaoHumanaWorkflow src`, único hit é a própria definição) — consistente com
   a nota "wiring real fica para a issue de deploy #624", já o mesmo padrão aplicado a T029/T030/T031 nesta
   mesma spec. Não é lacuna desta task.
5. Suíte de contrato do controller (dev-back-end + 3 testes QA):
   `npx vitest run tests/bounded-contexts/orquestracao/contract/decisao-humana.controller.test.ts --reporter=default`
   — 15 testes passed.
6. Cobertura isolada do arquivo alterado:
   `npx vitest run tests/bounded-contexts/orquestracao/contract/decisao-humana.controller.test.ts --coverage --coverage.include='src/bounded-contexts/orquestracao/interface/http/decisao-humana.*' --reporter=default`
   — 100% statements/branches/functions/lines (38/38, 27/27, 6/6, 38/38). Antes dos 3 testes adicionados pelo
   QA: 86,84% statements, 74,07% branches (linhas 30, 103-109, 165 descobertas).
7. Suíte completa do BC orquestracao: `npx vitest run tests/bounded-contexts/orquestracao --reporter=default`
   — 30 arquivos passed | 2 skipped (32), 231 testes passed | 17 skipped (248). Skips são exclusivamente
   persistência Drizzle por ausência de Postgres local (limitação de ambiente já registrada em relatórios
   anteriores desta spec).
8. Suíte completa do repositório: `npx vitest run --reporter=default` — 187 arquivos passed | 19 skipped
   (206), 1189 testes passed | 109 skipped (1298), zero falhas — sem regressão.
9. `npx eslint` nos 3 arquivos alterados/estendidos (`decisao-humana.schema.ts`, `decisao-humana.controller.ts`,
   `decisao-humana.controller.test.ts`) — zero achados.
10. `npx tsc --noEmit -p tsconfig.json` — zero erros.

## Suítes executadas e comandos
1. `npx vitest run tests/bounded-contexts/orquestracao/contract/decisao-humana.controller.test.ts --reporter=default` — 15 passed.
2. `npx vitest run tests/bounded-contexts/orquestracao --reporter=default` — 231 passed | 17 skipped (248) em 30 arquivos.
3. `npx vitest run --reporter=default` (repositório completo) — 1189 passed | 109 skipped (1298) em 187 arquivos.
4. `npx eslint src/bounded-contexts/orquestracao/interface/http/decisao-humana.schema.ts src/bounded-contexts/orquestracao/interface/http/decisao-humana.controller.ts tests/bounded-contexts/orquestracao/contract/decisao-humana.controller.test.ts` — sem achados.
5. `npx tsc --noEmit -p tsconfig.json` — sem erros.

Nota de ambiente: `allure-vitest` (configurado em `vitest.config.ts`) quebra nesta máquina Windows por
espaço no path (`C:\Users\Allan Brito\...`) — `vitest.config.ts` não foi alterado; `--reporter=default`
usado apenas para obter o resultado real da suíte, mesma limitação já registrada em relatórios QA anteriores
desta spec (T010, T012, T014, T015, T018, T019, T026, T031, T040).

## Cobertura inicial e final
- Baseline (12 testes do dev-back-end, arquivo do controller isolado): 86,84% statements, 74,07% branches,
  100% functions, 86,84% lines. Descoberto: fallback 401 sem tenantContext, `opts` omitido, rethrow de erro
  não mapeado.
- Final (15 testes, após extensão do QA): 100% statements, 100% branches, 100% functions, 100% lines nos
  2 arquivos de produção do PR (`decisao-humana.controller.ts`, `decisao-humana.schema.ts`).
- Nenhum código excluído da cobertura. Nenhuma lacuna residual estrutural.

## Allure
Não gerado — mesma limitação de ambiente Windows (path com espaço) já registrada em relatórios QA
anteriores desta spec. Validação registrada via output determinístico do vitest, reproduzível pelos
comandos acima.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
1. Wiring de composição raiz real (Lambda, autenticação Cognito de produção) ainda não existe para este
   endpoint — deferido para a issue de deploy (#624), mesma nota já aplicada a T029/T030/T031. Não é lacuna
   de T044.
2. Testes de persistência Drizzle seguem `skip` no ambiente local por ausência de Postgres — limitação de
   ambiente já registrada em relatórios QA anteriores desta spec, sem relação com este PR.

## Limitações do ambiente
1. Docker não foi iniciado para esta validação — não necessário: os testes de contrato usam fakes em
   memória (`DecisaoWorkflowRepositoryFake`, `EventPublisherFake`), sem Drizzle/EventBridge real.
2. Reporter `allure-vitest` quebra nesta máquina Windows — contornado com `--reporter=default`, sem alterar
   `vitest.config.ts`.

## Parecer final
**APROVADO PELO QA**

Controller e schema novos cobrem os critérios de aceite relevantes de T044/#250: decisão só avança mediante
confirmação humana explícita, nunca por gatilho automático; papel `comprador-responsavel` exigido de forma
estruturalmente inescapável (guard sempre concatenado, fail-closed sem preHandler, ordem
autenticação→guard testada); `tenantId` exclusivamente de `request.tenantContext`, nunca de
body/query/header, com defesa em profundidade contra tenant divergente (404); Problem Details (RFC 7807)
correto em 400/401/403/404/409; contrato de borda Zod fiel ao `docs/openapi.yaml` aprovado, incluindo o caso
de borda `motivoDadoAusente` só com espaços. 15 testes de contrato passando (12 do dev-back-end + 3
adicionados pelo QA para fechar cobertura defensiva), 100% de cobertura statements/branches/functions/lines
nos 2 arquivos de produção do PR, zero regressão na suíte completa do BC (231 testes) e do repositório (1189
testes), zero achados de lint/typecheck. Nenhum defeito de produção a reportar. Issue #688 (rota nascer
desprotegida) fica encerrada por construção, não apenas por teste.
