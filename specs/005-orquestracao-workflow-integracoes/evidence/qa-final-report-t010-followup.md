# QA Final Report — T010 follow-up (issue #216) — troca de contrato local pelo VO real `ContextoValidacao`

## SPEC_ID e versão testada
- SPEC_ID: 005-orquestracao-workflow-integracoes
- PR: #500 (labsitio/nexus-orc-back)
- Branch: fix/005-decisao-roteamento-contexto-validacao-real
- Worktree: /home/victor1090/Documentos/Labs/wt-005-divida-t010
- Commit testado: 397f53fb7ee5786c67021e5920504f2a852e1040
- Não é task nova de tasks.md: dívida técnica pontual do PR #497/issue #216 (T010), risco residual já registrado em `evidence/qa-final-report-t010.md` ("Riscos residuais", item 1).
- `backend-reviewer`: APPROVE, sem achados.
- Primeira validação (não é reteste de BUG).

## Resumo executivo
PR remove o contrato local `ContextoValidacaoParaDecisao` (mock estrutural criado em T010 porque T009 ainda não estava mergeado) e troca por import do VO real `ContextoValidacao` (T009, mergeado via PR #494). Diff restrito a 2 arquivos: o VO de produção (`decisao-roteamento.vo.ts`, apenas troca de tipo no import e na assinatura de `CriarDecisaoRoteamentoInput.contextoValidacao`, nenhuma linha de lógica de negócio alterada) e o teste correspondente (troca de object literal `{ resultado } as unknown as ContextoValidacaoParaDecisao` por `ContextoValidacao.de({ resultado, inconsistenciasAceitas })` real). Nenhum comportamento novo.

## Requisitos cobertos
As 3 invariantes estruturais de `DecisaoRoteamento` seguem corretas com o VO real:

1. `AprovacaoSemValidacaoError` — `acao === 'APROVAR'` exige `contextoValidacao.resultado` em `VALIDADO`/`VALIDADO_COM_RESSALVA`. Verificado contra `ContextoValidacao` real: ausência total, resultado inesperado (`REPROVADO` via cast, defesa contra dado upstream malformado) e aceitação nos dois resultados válidos via `it.each`, agora construindo o VO real com `ContextoValidacao.de(...)` (incluindo `inconsistenciasAceitas` exigido pelo próprio VO quando `resultado === 'VALIDADO_COM_RESSALVA'`).
2. `ReenvioSemFundamentoError` — `acao === 'SOLICITAR_REENVIO'` exige `motivoDadoAusente` não vazio. Inalterado pelo diff; não depende de `ContextoValidacao`.
3. `CriterioAusenteError` — decisão automática (`agenteOrigem !== 'HUMANO'`) exige `criterio` não vazio. Inalterado pelo diff; não depende de `ContextoValidacao`.

Total: 11 testes, 3 invariantes — mesma cobertura de T010, agora sem cast estrutural (`as unknown as`) para o campo crítico da invariante 1.

## Avaliação do fechamento do risco residual
Risco registrado em `qa-final-report-t010.md` ("quando T009 mergear, é necessário substituir o import local pelo VO real e reexecutar este teste para confirmar que a forma real do `ContextoValidacao` de T009 preserva o campo `resultado` com os mesmos 2 valores aprováveis"): **confirmado, fechado**. `ContextoValidacao.resultado` é `ResultadoValidacao = 'VALIDADO' | 'VALIDADO_COM_RESSALVA'` (`contexto-validacao.vo.ts:4`), superset idêntico ao contrato local removido; `RESULTADOS_VALIDACAO_APROVAVEIS` em `decisao-roteamento.vo.ts` continua checando por valor, não por tipo — robusto ao VO real ter campos adicionais (`inconsistenciasAceitas`) não usados por `DecisaoRoteamento`.

## Suítes executadas e comandos
Ambiente: `source ~/.nvm/nvm.sh && nvm use 24` (Node v24.14.1) obrigatório — Node padrão do PATH é v16. `node_modules` symlinkado do repo principal, sem reinstalação.

1. `npx vitest run tests/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.test.ts` — PASS, 11/11 testes.
2. `npx vitest run` (suíte completa, regressão de todo o repo) — PASS, **502 passed / 45 skipped** (101 arquivos passed / 9 skipped de 110), 0 falhas. Os 9 arquivos skipped são testes de integração Drizzle/Postgres que exigem `DATABASE_URL` (limitação de ambiente documentada nos próprios arquivos, pré-existente, não relacionada a esta PR — CI provisiona Postgres e roda essas suítes).
3. `npx tsc --noEmit` — PASS, sem erros.
4. `npx eslint src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.ts tests/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.test.ts` — PASS, sem warnings.
5. `npx vitest run --coverage --coverage.include='src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.ts' tests/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.test.ts` — cobertura do arquivo isolado: **100% statements (17/17), 100% branches (14/14), 100% functions (5/5), 100% lines (17/17)**.

## Cobertura inicial e final
Baseline (T010, `qa-final-report-t010.md`): 100% em todas as métricas no arquivo isolado. Final (esta PR): 100% em todas as métricas, sem regressão — mesmas 17 linhas/17 statements/14 branches/5 funções do arquivo de produção, agora exercitadas contra o VO real em vez do mock estrutural.

## Allure
Não aplicável — stack de testes do repositório (vitest) não possui adaptador Allure configurado em nenhuma spec desta base de código (confirmado em relatórios de QA anteriores, ex. `qa-final-report-t010.md`, `qa-final-report.md`). Validação registrada via output determinístico de vitest/tsc/eslint acima, reproduzível.

## Bugs encontrados
Nenhum.

## Bugs enviados ao dev-back-end
Nenhum — não há defeito de produto.

## Riscos residuais
Nenhum novo. O único risco residual da task original (troca do contrato local pelo VO real de T009) está fechado por esta PR.

## Limitações do ambiente
Node do PATH padrão é v16 (incompatível com o toolchain); `nvm use 24` necessário para todos os comandos vitest/tsc/eslint. 9 arquivos de teste de integração skipped por ausência de `DATABASE_URL` local — comportamento esperado e documentado, não relacionado a este diff.

## Parecer final
**APROVADO PELO QA**

Diff restrito à troca de tipo (contrato local → VO real de T009), sem alteração de lógica de negócio ou de invariante. As 3 invariantes estruturais de `DecisaoRoteamento` continuam corretas e cobertas pelos mesmos 11 testes, agora sem cast artificial para o campo usado na invariante crítica de aprovação. Suíte completa do repositório sem regressão (502 passed / 45 skipped, mesmos skips pré-existentes de ambiente). `tsc` e `eslint` limpos. Cobertura 100% mantida no arquivo de produção. Risco residual da task original está fechado.
