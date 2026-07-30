# Test Plan — T004/T006–T009 (issues #9, #11, #12, #13, #14)

## Escopo
Domain do BC Ingestão & Identificação: Value Objects (`OrcamentoId`, `Canal`,
`NivelConfianca`, `ResultadoClassificacao`, `ReferenciaS3`,
`TentativaClassificacao`), agregado `Orcamento`, 4 Domain Events, interfaces
de repositório/gateway. `src/bounded-contexts/ingestao-identificacao/domain/**`.

## Fora de escopo
Application/Infrastructure/Interface (ainda não implementadas, T010+). CI
(T003, ainda não existe). Lint/Husky (T002).

## Riscos
- Confiança < 80% não escalonar corretamente para `PENDENTE_REVISAO_HUMANA`
  (regra crítica de negócio, Princípio não-negociável).
- Transição de estado inválida do agregado não barrada (reentrega SQS
  corrompendo estado).
- Regra de negócio vazando para fora do Domain (import de infra/AWS).
- `referenciaBruta` sendo sobrescrita (viola imutabilidade do dado bruto).
- Ambiente de execução: sandbox de implementação usou Node 16 + vitest 0.34
  (não commitado); repo declara Node >=24 + vitest ^4.1.10 — risco de
  divergência de comportamento entre versões do runner.

## Níveis e tipos de teste
Unitário apenas (Domain puro, sem I/O). Sem integração/contrato/E2E aplicável
nesta fase (não há repositório/gateway implementado).

## Ambientes e dependências
Node 24.14.1 (via nvm, sandbox QA tinha apenas Node 16/18 além do 24), pnpm
11.18.0 (via corepack), vitest 4.1.10 real do projeto (não a 0.34 usada pelo
dev-back-end).

## Estratégia de dados
Fixtures inline nos próprios arquivos de teste (builders locais tipo
`novoOrcamento()`), sem fixture compartilhada — volume de dados é trivial.

## Estratégia de mocks/fakes
Nenhuma (Domain puro, sem dependência externa).

## Critérios de entrada
PR #394 (draft), branch `feat/001-fundacao-domain`, commit `3b05061`.

## Critérios de saída
40/40 testes existentes passando com vitest 4.x real; `tsc --noEmit` limpo;
100% branch coverage nas invariantes de validação dos VOs e do agregado; sem
regra de negócio vazando do Domain; sem defeito crítico/alto aberto.

## Abordagem Allure
Adicionado `allure-vitest` (reporter) + `vitest.config.ts` mínimo como
infraestrutura de teste (autoridade de QA). `allure-results/` gerado em cada
execução, ignorado no git (artefato de build, análogo a `coverage/`).

## Ordem de execução
1. `pnpm exec tsc --noEmit`
2. `pnpm exec vitest run --coverage`

## Limitações
- Sandbox de QA não tinha Node 24 nem pnpm 11 pré-instalados; usado Node
  24.14.1 já disponível via nvm local e `corepack prepare pnpm@11.18.0
  --activate` para reproduzir o ambiente real do projeto.
- `pnpm install` regenerou `pnpm-lock.yaml` com as entradas de `vitest`,
  `@vitest/coverage-v8` e `allure-vitest` (esperado — sinalizado no PR que o
  lockfile ainda não tinha sido regenerado). Ação de commitar esse lockfile
  atualizado cabe ao dev-back-end/DevOps (T003).
