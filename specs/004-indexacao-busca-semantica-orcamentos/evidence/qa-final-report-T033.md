# QA Final Report — T033 (`BedrockInterpretacaoConsultaACL`)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T033 (Unit test `BedrockInterpretacaoConsultaACL` — saída estruturada restrita ao catálogo de categorias configurado, nunca categoria/filtro inventado fora do catálogo)
- PR: #552 (labsitio/nexus-orc-back), branch `feat/004-t033-bedrock-interpretacao-consulta-acl`
- Commit HEAD testado: a1d9094 (após nit "asserção específica CriterioBuscaInvalidoError")
- Primeira validação de QA (não é reteste de BUG)
- backend-reviewer: APPROVE WITH NITS (nit já corrigido no commit a1d9094)
- CI (`gh pr checks 552`): `ci` pass; Debricked (vulnerabilidade de terceiros) skipping, não bloqueante

## Resumo executivo
`BedrockInterpretacaoConsultaACL` é a ACL de tradução pura (sem chamada
AWS/Bedrock real) que converte a saída estruturada esperada do Bedrock em
`CriterioBusca` (VO já existente), fazendo cumprir a regra central desta task:
`categoria`, quando presente, precisa pertencer ao `catalogoCategorias`
informado pelo chamador — nunca é corrigida/aproximada, sempre rejeitada com
`BedrockInterpretacaoConsultaACLInvalidaError` explícito. Um type guard
estrutural (`ehInterpretacaoConsultaBruta`) valida cada campo aninhado
opcional antes de a ACL repassar o shape ao VO, para nunca lançar exceção não
controlada em campo malformado. Nenhum defeito de produção encontrado.

Arquivo de produção alterado:
- `src/bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretacao-consulta.acl.ts` (novo)

`BedrockInterpretadorConsultaGateway` (chamada Bedrock real, IAM) é escopo de
outra task/issue (T037/#197), fora deste PR — confirmado por leitura de
`tasks.md` e do próprio arquivo de produção (comentário JSDoc da classe).

## Testes executados
Comando: `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretacao-consulta.acl.test.ts`
(evitado `pnpm test` puro — incompatibilidade ambiental conhecida do
allure-vitest, já documentada em relatórios anteriores desta spec).

1. Suíte alvo isolada: 11/11 testes do dev-back-end passando (baseline).
2. QA adicionou 3 asserções em 2 novos cenários (branch coverage, ver seção
   Cobertura) — suíte final: **13/13 passando**.
3. `npx eslint` no arquivo de produção e no arquivo de teste alterado — sem
   findings.
4. `npx tsc --noEmit -p .`: nenhum erro nos arquivos desta task. Erros
   pré-existentes reportados em módulos não relacionados (`@aws-sdk/*`,
   `pino`, `@opentelemetry/*`, `aws-jwt-verify`, `aws-lambda`) são ambientais
   — dependências não instaladas neste worktree (`node_modules/@aws-sdk` e
   `node_modules/pino` inexistentes), mesma classe de limitação já registrada
   em relatórios anteriores; não bloqueiam este gate porque não tocam nenhum
   arquivo desta task.
5. `gh pr checks 552` — CI verde.

## Cobertura (T033)
Isolando a suíte alvo, arquivo de produção `bedrock-interpretacao-consulta.acl.ts`:

| Métrica | Baseline (11 testes, dev-back-end) | Final (13 testes, após QA) |
|---|---|---|
| Statements | 92.3% | 100% |
| Branches | 93.18% | 100% |
| Functions | 100% | 100% |
| Lines | 100% | 100% |

Lacuna fechada pelo QA: linhas 37/43 do arquivo (`typeof valor !== 'object'`
nos type guards `ehFaixaPrecoBruta`/`ehPeriodoRecebimentoBruto`) nunca eram
exercitadas com o próprio campo raiz (`precoMinimo`/`precoMaximo`/
`periodoRecebimento`) sendo um valor não-objeto (ex.: string ou `null`) em vez
de um objeto com propriedade aninhada de tipo incorreto. Leitura de código
confirmou que o comportamento já era correto (guard rejeita corretamente,
retorna `false`) — gap era só de cobertura de teste, não defeito de produção.
QA adicionou os cenários faltantes em
`tests/bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretacao-consulta.acl.test.ts`
(3 `expect` novos em 2 `it` novos, mais 1 asserção extra no `it` de
`periodoRecebimento` para cobrir o segundo operando do `&&` em
`ehPeriodoRecebimentoBruto`). Nenhuma linha de produção alterada.

## Cobertura dos requisitos
Ver `specs/004-indexacao-busca-semantica-orcamentos/qa/traceability-matrix.md`
(seção "T033"). Resumo:
- Type guard estrutural valida shape completo, inclusive campos aninhados
  opcionais, antes de repassar ao VO: coberto (11 casos do dev-back-end + 3
  casos adicionados pelo QA para o campo raiz não-objeto).
- Núcleo do requisito — rejeita (nunca corrige/aproxima) `categoria` fora do
  `catalogoCategorias`, inclusive grafia parecida a categoria válida: coberto
  por 2 testes dedicados.
- Propagação de erro de domínio do VO (`CriterioBusca`) em moeda divergente e
  data inválida, em vez de exceção não controlada: coberto por 2 testes
  dedicados, com asserção específica de tipo (`CriterioBuscaInvalidoError`)
  no caso de data inválida.
- Caminho feliz completo (todos os filtros presentes) e caminho mínimo
  (apenas texto livre): cobertos.

Nenhuma lacuna de requisito do escopo de T033 identificada. Consumo desta ACL
pelo `BedrockInterpretadorConsultaGateway` (chamada Bedrock real) é escopo de
T037/#197, ainda não implementado — não é lacuna desta task.

## Bugs encontrados
Nenhum. Nenhum defeito de produção identificado.

## Riscos residuais
Nenhum específico de T033. Risco geral já registrado em relatórios anteriores
desta spec: o gateway real (T037) precisará garantir que o `catalogoCategorias`
passado a esta ACL seja sempre a lista determinística de categorias do
tenant/sistema no momento da chamada — fora do escopo verificável nesta task,
que testa apenas a função pura de tradução/rejeição.

## Limitações do ambiente
Nenhuma limitação de ambiente específica desta task além do allure-vitest já
documentado (ambiental, conhecido, não bloqueante — `vitest run` isolado
usado como alternativa). `tsc --noEmit` do projeto completo aponta módulos
`@aws-sdk/*`/`pino`/`@opentelemetry/*` ausentes neste worktree, não relacionados
a esta task.

## Parecer final
APROVADO PELO QA
