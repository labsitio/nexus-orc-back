# QA Final Report — T012 (PR #505) — Aggregate `DecisaoWorkflow`

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- PR: #505 (labsitio/nexus-orc-back)
- Branch: feat/005-t012-decisao-workflow-aggregate
- Commit testado: ee1d9e5
- Primeira validação (não é reteste de BUG).
- `backend-reviewer` já havia aprovado (APPROVE WITH NITS — 2 MAJOR e 1 NIT corrigidos em commits anteriores, 3bbe9ee/554e816/ee1d9e5).

## Resumo executivo
PR adiciona `src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.ts` (novo), agregado raiz puro do BC Orquestração, sem I/O. Máquina de estados `AGUARDANDO_CONTEXTO → CONTEXTO_CONSOLIDADO → DECIDIDO | PENDENTE_REVISAO_HUMANA`, com registro idempotente de 3 contextos upstream, consolidação estrita (nunca decisão parcial), decisão automática do Orquestrador sob limiar de confiança e decisão humana explícita a partir de `PENDENTE_REVISAO_HUMANA`. Teste correspondente já existente no PR (20 testes, dev-back-end), sem mocks — encontrei 3 lacunas reais de branch coverage (não de linha) e adicionei os testes faltantes, sem alterar produção.

## Requisitos cobertos
Mapeado contra `tasks.md` T012 e a invariante NON-NEGOTIABLE do Princípio IV (`spec.md`):

1. `registrarContexto{Classificacao,Extracao,Validacao}` idempotentes e imutáveis (reentrega divergente → `ContextoImutavelError`). Coberto para os 3 campos (o teste original só cobria `contextoClassificacao`; adicionei os cenários equivalentes para `contextoExtracao` e `contextoValidacao`).
2. `consolidarContexto()` nunca decide com contexto parcial — `ContextoIncompletoError` quando falta qualquer um dos 3, permanece `AGUARDANDO_CONTEXTO`; é no-op (nunca reverte status) quando reaplicado após `DECIDIDO`/`PENDENTE_REVISAO_HUMANA` (reentrega de evento). Adicionei variação com `contextoClassificacao` ausente especificamente (branch da checagem de campos ausentes só era exercitado com os outros 2 campos faltando).
3. `registrarTentativaOrquestrador`: só a partir de `CONTEXTO_CONSOLIDADO` (`TransicaoInvalidaDecisaoWorkflowError` caso contrário); confiança abaixo do limiar (`LIMIAR_CONFIANCA = 80`) transita direto para `PENDENTE_REVISAO_HUMANA` sem decidir; confiança suficiente aplica as invariantes de `DecisaoRoteamento.criar` (nunca aprovar sem validação bem-sucedida — incluindo o caso `VALIDADO_COM_RESSALVA` também aprovável —, nunca reenvio sem fundamento, nunca decisão automática sem critério) e só muta estado quando a criação do VO é bem-sucedida (testes confirmam `CriterioAusenteError`/`ReenvioSemFundamentoError` sem alteração de status/histórico).
4. `registrarDecisaoHumana`: só a partir de `PENDENTE_REVISAO_HUMANA`; nunca exige `nivelConfianca`; `criterio` ainda obrigatório (`JustificativaHumanaAusenteError`); `SOLICITAR_REENVIO` ainda exige fundamento mesmo vindo de humano; histórico append-only (nunca apaga a tentativa anterior do Orquestrador).
5. `reconstituir`: reidrata estado persistido preservando histórico/contextos/decisão; histórico é cópia defensiva (array de origem não afeta o agregado reidratado).

Invariante crítica (Princípio IV): confirmada estruturalmente — não existe caminho de código no agregado que produza `DECIDIDO` sem passar por `DecisaoRoteamento.criar` (que por sua vez nunca permite `APROVAR` sem `contextoValidacao` aprovável) ou por decisão humana explícita a partir de `PENDENTE_REVISAO_HUMANA`. Não há timer, contador de tentativas nem qualquer gatilho de auto-aprovação por exaustão/tempo/volume no código.

`AprovacaoSemValidacaoError` (VO `DecisaoRoteamento`) é estruturalmente inalcançável a partir do agregado no estado atual do domínio: `ContextoValidacao.resultado` só admite `VALIDADO`/`VALIDADO_COM_RESSALVA` (não existe `REJEITADO` neste VO — evento de rejeição de spec 003 não é traduzido por este ACL), e `consolidarContexto` garante que os 3 contextos estão presentes antes de `CONTEXTO_CONSOLIDADO`. A defesa em profundidade continua correta e já é validada isoladamente em `decisao-roteamento.vo.test.ts` (incluindo o caso de "resultado inesperado" via cast, simulando dado upstream malformado). Não é uma lacuna do agregado, é redundância de defesa esperada.

## Testes adicionados (lacunas reais de branch coverage fechadas)
Arquivo: `tests/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.test.ts` (só teste, produção não alterada):
1. `rejeita reentrega com payload divergente do já registrado — ContextoImutavelError (extração)`
2. `rejeita reentrega com payload divergente do já registrado — ContextoImutavelError (validação)`
3. `lança ContextoIncompletoError quando falta especificamente contextoClassificacao`

Total: 20 → 23 testes no arquivo do agregado.

## Suítes executadas e comandos
1. `npx vitest run` (suíte completa, regressão) — PASS, 545 passed / 45 skipped (pré-existentes, infra dependente de banco/AWS não relacionada a esta task), 104 arquivos passed / 9 skipped, 0 falhas.
2. `npx vitest run --coverage tests/bounded-contexts/orquestracao` — cobertura do agregado: **100% statements, 100% branches, 100% functions, 100% lines** (antes das 3 adições: 95%/83.33%/100%/96.49%, uncovered lines 165, 173, 194).
3. `npx tsc --noEmit` — PASS, sem erros.
4. `npx eslint tests/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.test.ts` — PASS, sem warnings.

## Cobertura inicial e final
- Baseline (antes dos testes adicionados): 95% statements / 83.33% branches / 100% functions / 96.49% lines, lacunas nas linhas 165 (`ContextoImutavelError` de `contextoExtracao`), 173 (idem `contextoValidacao`) e 194 (branch de `contextoClassificacao` ausente em `consolidarContexto`).
- Final: 100% em todas as métricas no arquivo de produção desta task.

## Allure
Não aplicável — stack de testes do repositório (vitest) não possui adaptador Allure configurado em nenhuma spec anterior desta base de código (mesma constatação dos relatórios de QA anteriores, ex. T010). Validação registrada via output determinístico do vitest/tsc/eslint acima, reproduzível.

## Bugs encontrados
Nenhum defeito de produção. As 3 lacunas de branch coverage eram lacunas de teste (item 2 da classificação de falhas), corrigidas diretamente pelo QA sem tocar produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Riscos residuais
1. `AprovacaoSemValidacaoError` permanece código de defesa em profundidade estruturalmente inalcançável a partir do agregado — não é ação necessária agora, mas se um futuro `ResultadoValidacao` incluir `REJEITADO`, revalidar que o ACL de tradução do evento de Validação (T009+) não permite que esse valor chegue a `registrarTentativaOrquestrador` sem passar pela checagem.
2. Application/Infrastructure/Interface deste BC (T013+) ainda não implementados — este gate cobre exclusivamente Domain puro, conforme escopo da task.

## Limitações do ambiente
Nenhuma bloqueante — Domain puro, sem AWS/banco envolvidos nesta task.

## Parecer final
**APROVADO PELO QA**

As invariantes exigidas pelo critério de aceite de T012 estão cobertas por unit tests determinísticos, sem mocks, incluindo os cenários explicitamente pedidos (consolidação/decisão com contexto incompleto sempre lança `ContextoIncompletoError`, nunca decisão parcial) e a invariante crítica do Princípio IV (nenhuma aprovação sem confiança suficiente ou decisão humana explícita, nunca por exaustão/tempo/volume — confirmado estruturalmente, sem gatilho de auto-aprovação no código). Cobertura elevada de 95%/83.33% para 100% em todas as métricas após fechamento de 3 lacunas reais de branch coverage (testes adicionados pelo QA, produção não tocada). `tsc` e `eslint` limpos. Suíte completa sem regressão.
