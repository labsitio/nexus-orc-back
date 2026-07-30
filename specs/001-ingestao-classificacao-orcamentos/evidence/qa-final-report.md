# QA Final Report — T001 (issue #6)

## SPEC_ID e versão testada
`001-ingestao-classificacao-orcamentos`. PR #391 (draft), branch
`feat/001-fundacao-t001-monorepo`, commit `11b1959`, base `main`@`a8bb825`.
Primeira validação (não é reteste).

## Resumo executivo
T001 é fundação/scaffolding do monorepo: `package.json`, `tsconfig.json`,
`.npmrc`, `.gitignore`, `src/index.ts` (placeholder sem lógica) e
`pnpm-lock.yaml`. Nenhum código de domínio, endpoint ou regra de negócio.
Nenhum critério de aceite funcional de `spec.md` é aplicável a esta task —
o Bounded Context de Ingestão & Identificação só nasce a partir de T004.

## Requisitos cobertos e não cobertos
- Sem RF/RN/RNF de `spec.md` mapeado para T001.
- Riscos de infraestrutura verificados via smoke check manual (ver
  `qa/traceability-matrix.md`): strict mode efetivo, `noUncheckedIndexedAccess`
  efetivo, `packageManager` pinado respeitado, `pnpm install`/`tsc --noEmit`
  funcionam em ambiente limpo.

## Suítes executadas e comandos
Não há suíte de testes automatizada nesta task (não há framework de testes
configurado ainda — entra em T003). Execução: smoke check manual, comandos e
saídas completas em `specs/001-ingestao-classificacao-orcamentos/qa/test-execution-report.md`.

## Quantidade de testes por tipo
0 testes automatizados (nenhuma lógica de produção para testar). 5 smoke
checks manuais, não persistidos como suíte (não há framework de testes no
repo ainda para hospedá-los; nenhum ganho em criar arquivo `.test.ts` isolado
sem runner configurado).

## Resultado
5/5 smoke checks manuais com resultado esperado. Nenhuma falha.

## Cobertura inicial e final
Não mensurável — não há ferramenta de cobertura configurada (T003) e não há
função/branch de produção no diff (só `NEXO_VERSION`, constante literal).

## Allure
Não gerado. Não aplicável: não há suíte de testes de runtime para produzir
`allure-results` nesta task.

## Bugs por severidade e status
Nenhum bug aberto.

## Riscos residuais
- Cobertura estrutural (statements/branches/functions/lines) e Allure só
  passam a existir a partir de T003 (CI + Vitest). Registrar como pendência
  de baseline para a próxima task, não como defeito de T001.
- Versão `pnpm@11.18.0` pinada: fora do escopo do QA questionar escolha de
  versão de dependência (decisão de dev-back-end/arquitetura); confirmado apenas
  que o pin é respeitado pelo corepack.

## Limitações do ambiente
Execução local via worktree isolado (Node 24.14.1 via nvm, corepack), fora do
runner de CI oficial do projeto (que ainda não existe).

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T004/T006–T009 (issues #9, #11, #12, #13, #14)

## SPEC_ID e versão testada
`001-ingestao-classificacao-orcamentos`. PR #394 (draft), branch
`feat/001-fundacao-domain`, commit `3b05061`. Primeira validação (não é
reteste).

## Resumo executivo
T004/T006–T009 implementam o Domain do BC Ingestão & Identificação: 6 Value
Objects, agregado `Orcamento`, 4 Domain Events e 5 interfaces de
repositório/gateway. Todos os critérios de aceite literais do `tasks.md`
foram verificados diretamente no código e nos testes existentes (não apenas
aceitos por declaração do dev-back-end).

## Requisitos cobertos e não cobertos
Cobertos (ver `qa/traceability-matrix.md` para o detalhe):
- T006: cada VO rejeita valor inválido com `ErroDominio` — confirmado, 100%
  branch coverage dos 12 pontos de validação.
- T007: confiança < 80% transita direto para `PENDENTE_REVISAO_HUMANA`,
  nunca reprocessamento automático — confirmado por teste explícito;
  transição inválida forçada lança `TransicaoInvalidaError` — confirmado.
- T008: 4 Domain Events com `schemaVersion: 1` — confirmado nos 4 arquivos +
  teste `describe.each`.
- T009: 5 interfaces sem implementação — confirmado (grep não encontra
  nenhuma `class` implementando os contratos).
- Isolamento do Domain: nenhum import de infra/AWS/SDK dentro de
  `domain/` — confirmado.

Não cobertos (fora de escopo desta task, não é lacuna): Application,
Infrastructure, Interface, CI (T010+, T003).

## Suítes executadas e comandos
```
pnpm install
pnpm exec tsc --noEmit
pnpm exec vitest run tests/bounded-contexts/ingestao-identificacao/domain
pnpm exec vitest run --coverage
```
Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
40 testes unitários (8 arquivos), todos no Domain. Sem teste de integração,
contrato ou E2E aplicável (nada implementado fora do Domain ainda).

## Resultado
40 aprovados, 0 falhos, 0 ignorados, 0 instáveis. Executado com vitest 4.1.10
(versão real declarada em `package.json`), não a 0.34 usada pelo
dev-back-end para validação manual — resultado idêntico (40/40).

## Cobertura inicial e final
Inicial: 0% (sem ferramenta de cobertura configurada antes desta task).
Final: Statements 92.91% (118/127) · Branches 100% (38/38) · Functions 84%
(42/50) · Lines 92.8% (116/125). Lacuna de statements/functions é composta
apenas por acessores triviais (getters, `equals()`, `toString()`,
`reconstituir()` — usado só pelo futuro repositório T011), não por
invariantes de validação. Branch coverage 100% cobre integralmente as
invariantes exigidas pelo critério de T006. Detalhe em `qa/coverage-final.md`.

## Local do allure-results e do relatório Allure
`allure-results/` (raiz do repo, git-ignorado), 40 arquivos JSON, todos
`"status":"passed"`. Relatório HTML não gerado (requer CLI Java Allure, fora
do escopo Node do projeto) — ver `qa/allure-report.md`.

## Bugs por severidade e status
Nenhum bug aberto.

## Riscos residuais
- `pnpm-lock.yaml` regenerado localmente pelo QA (+744 linhas, entradas de
  `vitest`, `@vitest/coverage-v8`, `allure-vitest`) ainda não commitado no
  PR. Ação: dev-back-end deve commitar o lockfile atualizado (ou regenerar e
  commitar apenas a entrada de `vitest`, já que `@vitest/coverage-v8` e
  `allure-vitest` foram adicionados pelo QA como infra de teste — decisão de
  manter essas duas dependências permanentemente cabe ao dev-back-end/arquiteto
  em T003, junto com o restante do pipeline de CI).
- `vitest.config.ts` criado pelo QA nesta validação para habilitar cobertura
  e reporter Allure. Se T003 (CI) definir configuração própria, deve
  reconciliar com este arquivo em vez de duplicar.
- Getters e métodos utilitários (`equals`, `toString`, `reconstituir`) sem
  teste direto — risco baixo (sem lógica de decisão), mas registrado como
  lacuna estrutural para T011 (quando `reconstituir()` passa a ser
  exercitado pelo repositório real).

## Limitações do ambiente
Sandbox de QA por padrão só tinha Node 16 e sem corepack pnpm ativo — usado
Node 24.14.1 já disponível via nvm local e `corepack prepare pnpm@11.18.0
--activate` para reproduzir fielmente o ambiente declarado pelo projeto
(`engines.node >= 24`, `packageManager: pnpm@11.18.0`). Execução em worktree
isolado, fora do runner de CI oficial (que ainda não existe — T003).

## Parecer final
APROVADO PELO QA
