# QA Final Report — T022 (invariante "nunca omitir por relevância", `IndiceOrcamento`)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T022 (unit test de invariante "nunca omitir por relevância" no agregado `IndiceOrcamento`)
- PR: #545 (labsitio/nexus-orc-back, draft), branch `worktree-agent-ac8c6e45f43f4746b`
- Commits testados: 5a8fcd4, 80a43f7 (2º corrige isolamento de causa apontado pelo backend-reviewer na 1ª rodada)
- Primeira validação de QA (não é reteste de BUG)
- backend-reviewer: APPROVE (2ª rodada)

## Resumo executivo
Task puramente de teste. Nenhum arquivo de produção alterado — a invariante
já existia implementada em `IndiceOrcamento.registrarTentativaIndexacao`
(união fechada `RegistrarTentativaIndexacaoParams`: só `INDEXADO` ou
`FALHA_TECNICA`; qualquer outro valor de `resultado` colapsa hardcoded em
`FALHA_TECNICA`, e nenhum método público de exclusão de negócio é exposto no
prototype). Os 2 testes novos comprovam explicitamente, via forjar um
`resultado` de negócio ("EXCLUIDO_POR_RELEVANCIA") e via inspeção do conjunto
de métodos públicos do prototype, que não existe via estrutural para excluir
um orçamento do índice por "relevância" — só `INDEXADO` (com embedding) ou
`FALHA_TECNICA` (com `motivoFalha`) são outcomes possíveis. Nenhum defeito de
produção encontrado.

Arquivo de teste alterado:
- `tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` (2 testes novos, total 19 no arquivo)

## Testes executados
Comando: `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts`
(NÃO `pnpm test` — incompatibilidade ambiental conhecida do allure-vitest).

1. Suíte alvo isolada: 19/19 testes passando.
2. Suíte do BC completa (`tests/bounded-contexts/busca-indexacao`): 10 arquivos
   passando, 3 falhos por dependência ausente no `node_modules` deste worktree
   (`@opentelemetry/instrumentation-aws-lambda`, `pino` — pacotes já declarados
   em `package.json` mas não instalados; `pnpm install` pendente neste
   ambiente), 3 skip (integração de persistência sem Postgres real). 69
   testes passando, 21 skipped, nenhuma falha relacionada a T022.
3. Suíte completa do repositório: 100 arquivos passando, 21 falhos pela mesma
   causa ambiental acima (afeta também `extracao`, `validacao`,
   `ingestao-identificacao`, `platform/conformidade` — nenhum arquivo tocado
   por esta task consta entre os falhos), 18 skip. 577 testes passando, 97
   skipped.
4. `npx tsc --noEmit -p .` — mesmos 21 arquivos com `TS2307: Cannot find
   module` para os pacotes ausentes acima; nenhum erro nos arquivos desta
   task (aggregate de produção não alterado, arquivo de teste sem erro).
5. `npx eslint tests/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.test.ts` — sem findings.
6. `gh pr checks 545` — CI (build+testes) `pass` (1m12s). Debricked
   (vulnerabilidade de terceiros) `skipping`, não bloqueante para este gate.

## Cobertura (T022)
Isolando a suíte alvo (`--coverage.include` restrito a
`indice-orcamento.aggregate.ts`): 100% statements (39/39), 100% branches
(8/8), 100% functions (16/16), 100% lines (39/39) — sem regressão em relação
à baseline já 100% desde T012b/T021; os 2 testes novos não descobrem linha
nova (a invariante já era exercitada indiretamente), mas fecham a lacuna de
"prova explícita" pedida pela task.

## Cobertura dos requisitos
Ver `specs/004-indexacao-busca-semantica-orcamentos/qa/traceability-matrix.md`
(seção "T022"). Resumo:
- Nenhum método do agregado aceita parâmetro de exclusão de negócio: coberto
  (inspeção de `Object.getOwnPropertyNames(IndiceOrcamento.prototype)`).
- Única via para não indexar é falha técnica registrada, mesmo com
  `resultado` forjado de negócio: coberto (`EXCLUIDO_POR_RELEVANCIA` →
  `FALHA_TECNICA`).
- Nenhuma omissão silenciosa — `FALHA_TECNICA` sem `motivoFalha` continua
  rejeitado mesmo com `resultado` forjado: coberto.

Nenhuma lacuna de requisito do escopo de T022 identificada.

## Bugs encontrados
Nenhum. Nenhum defeito de produção identificado.

## Riscos residuais
Nenhum específico de T022.

## Limitações do ambiente
- Suíte de integração de persistência segue skip por ausência de Postgres
  real neste ambiente de validação — mesma limitação documentada nos
  relatórios anteriores da spec (T016, T017).
- 21 arquivos de teste em todo o repositório (fora do escopo desta task)
  falham por dependências declaradas em `package.json`
  (`@opentelemetry/instrumentation-aws-lambda`, `@opentelemetry/sdk-node`,
  `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`,
  `@opentelemetry/semantic-conventions`, `pino`, `@aws-sdk/client-bedrock-runtime`,
  `@aws-sdk/client-lambda`, `@aws-sdk/client-eventbridge`,
  `@aws-sdk/s3-request-presigner`, `aws-jwt-verify`, `aws-lambda`) mas
  ausentes no `node_modules` deste worktree local — `pnpm install`
  desatualizado neste ambiente, não relacionado ao diff desta task nem ao BC
  `busca-indexacao/domain`. CI remoto (`gh pr checks 545`) roda verde, o que
  confirma que a lacuna é local a este worktree, não do PR. Ação sugerida:
  dev-back-end ou DevOps rodar `pnpm install` neste worktree antes da próxima
  validação que dependa desses arquivos.

## Parecer final
APROVADO PELO QA
