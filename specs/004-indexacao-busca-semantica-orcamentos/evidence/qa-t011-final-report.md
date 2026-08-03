# QA — T011: VOs CriterioBusca e ResultadoBusca

## SPEC_ID
004-indexacao-busca-semantica-orcamentos

## PR / commit testado
PR #499, branch `feat/004-t011-vos-criterio-resultado-busca`, commit `734ed57`
Worktree: `/home/victor1090/Documentos/Labs/wt-004-t011`

## Resumo executivo
Primeira validação. Task T011 (Domain: VOs `CriterioBusca` e `ResultadoBusca`).
Nenhuma alteração de código de produção foi necessária. Testes já escritos pelo
dev-back-end são suficientes, corretos e cobrem 100% dos critérios de aceite.

## Escopo
- src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.ts
- src/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.ts
- tests/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.test.ts
- tests/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.test.ts

## Requisitos cobertos
CriterioBusca:
- aceita apenas textoLivreResidual (sem filtros) — coberto
- aceita textoLivreResidual vazio quando filtros explícitos bastam — coberto
- aceita periodoRecebimento com inicio <= fim — coberto
- rejeita precoMinimo > precoMaximo — coberto
- rejeita precoMinimo/precoMaximo em moedas diferentes — coberto
- rejeita periodoRecebimento com inicio > fim — coberto
- rejeita periodoRecebimento com data inválida (NaN) — coberto
- categoria não validada contra catálogo no Domain (fora de escopo, confirmado por leitura de código: nenhuma validação de categoria presente) — conforme

ResultadoBusca:
- aceita score em [0,1] e trechoDestacado opcional — coberto
- aceita ausência de trechoDestacado — coberto
- rejeita score fora de [0,1], incluindo NaN (-0.01, 1.01, NaN) — coberto
- aceita limites exatos 0 e 1 — coberto

Nenhuma lacuna de requisito identificada para esta task.

## Suítes executadas e comandos
- `nvm use 24 && npx vitest run tests/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.test.ts tests/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.test.ts` → 13 passed (2 arquivos)
- `nvm use 24 && npm test` (regressão completa do monorepo) → 97 passed | 9 skipped (106 arquivos), 479 passed | 45 skipped (524 testes). Skips pré-existentes (integração dependente de LocalStack/Postgres, não relacionados a T011).
- `nvm use 24 && npx tsc --noEmit` → sem erros
- `nvm use 24 && npx eslint <4 arquivos do escopo>` → sem erros

## Cobertura (escopo desta task)
Rodando vitest com `--coverage.include` restrito aos 2 VOs:
- Statements: 100% (25/25)
- Branches: 100% (23/23)
- Functions: 100% (6/6)
- Lines: 100% (25/25)

Cobertura global do monorepo não é relevante aqui (maioria do código pertence a
outras tasks/specs ainda não implementadas ou fora deste escopo de QA).

## Allure
Não configurado adapter Allure para vitest neste monorepo até o momento (nenhum
`@vitest`/allure reporter presente em `package.json`/`vitest.config`). Fora do
escopo desta task pontual (VOs isolados, sem necessidade de fluxo E2E) introduzir
tooling novo de relatório sem alinhamento prévio — registrado como lacuna de
infraestrutura de testes, não bloqueante para esta task. Evidência de execução
mantida em texto neste relatório (comandos + resultados acima).

## Defeitos encontrados
Nenhum.

## Alterações feitas pelo QA
Nenhuma. Nenhum arquivo de teste ou produção foi alterado — os testes do
dev-back-end já eram suficientes.

## Riscos residuais
- `categoria` em `CriterioBusca` não é validada contra catálogo no Domain,
  por design (delegado ao gateway na Infra, T037) — confirmado, não é lacuna
  desta task.
- Ausência de reporter Allure no projeto — lacuna de tooling, não específica
  desta task; recomenda-se alinhar com Tech Lead/dev-back-end antes de
  introduzir globalmente.

## Limitações do ambiente
Nenhuma. VOs puros de Domain, sem dependência de banco/AWS/rede.

## Parecer final
APROVADO PELO QA
