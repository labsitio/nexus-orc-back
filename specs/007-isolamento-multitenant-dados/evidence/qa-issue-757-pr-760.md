# QA — issue #757 (HttpApiStack + wiring, ADR-017) — PR #760

SPEC_ID: 007-isolamento-multitenant-dados (issue transversal, sem task própria em `tasks.md` —
pré-requisito de infra para as 12 rotas HTTP derivadas do ADR-017)
PR: labsitio/nexus-orc-back#760
Branch: feat/757-http-api-stack
Commit testado: 35e5c91
Tipo: primeira validação (sem BUG anterior)

## Escopo

- `infra/lib/http-api-stack.ts`: `HttpApiStack` — 1 `apigatewayv2.HttpApi` (`createDefaultStage:
  true`), `terminationProtection = true`. Método público `adicionarRota({id, method, path,
  funcao})` — mecanismo de registro que as 12 tasks derivadas do ADR-017 (T069/001, T047/002,
  T051/003, T047/004, T058/005) vão consumir.
- `infra/bin/app.ts`: instancia `HttpApiStack` sem nenhuma chamada a `adicionarRota` ainda
  (nenhuma rota HTTP existe no repositório hoje — comentário no próprio arquivo documenta isso).
- `infra/lib/http-api-stack.test.ts` (já criado pelo dev-back-end): síntese isolada provando
  1 `AWS::ApiGatewayV2::Api` (protocolo HTTP), 0 `AWS::ApiGatewayV2::Authorizer`, e que
  `adicionarRota` gera `AWS::ApiGatewayV2::Route` com `AuthorizationType: NONE` e
  `AuthorizerId` ausente.

Diff real da PR (`gh pr diff 760 --name-only`) restrito a esses 3 arquivos — confirmado, sem
alteração em role-stack, function-stack ou qualquer outro arquivo de produção fora do escopo.

## Comandos executados

```
gh issue view 757 --repo labsitio/nexus-orc-back --json body -q '.body'
npx vitest run infra/lib --reporter=default --pool=forks --maxWorkers=2
pnpm typecheck:infra
rm -rf cdk.out && pnpm lint
npx cdk synth --all   # --all é opção desconhecida no CDK 2.1133 mas ignorada; sem argumento
                       # de stack o synth já processa o app inteiro (28 stacks)
```

`pnpm test` não foi usado (path com espaço — `allure-vitest` falha, comportamento conhecido e
documentado em CLAUDE.md; contornado com `npx vitest run --reporter=default`).

## Resultados

| Comando | Resultado |
|---|---|
| `npx vitest run infra/lib` (`--pool=forks --maxWorkers=2`) | 6 arquivos / 14 testes, 0 falha — inclui os 3 testes novos de `http-api-stack.test.ts` |
| `pnpm typecheck:infra` | OK, limpo |
| `pnpm lint` (após `rm -rf cdk.out`) | OK, limpo (inclui regra de fronteira de BC) |
| `npx cdk synth` (28 stacks) | "Successfully synthesized to cdk.out", sem erro. `cdk.out/*.template.json` = 28 arquivos, incluindo `HttpApiStack.template.json` |

## Critérios de aceite

1. **`http-api-stack.ts` criada e wired em `infra/bin/app.ts`** — confirmado. `HttpApiStack`
   instanciada em `app.ts` (linha final, após as 27 stacks já existentes), sem argumento de
   rota — nenhuma `NodejsFunction` HTTP existe ainda no repositório, coerente com o texto da
   issue.
2. **Convenção de registro de rota pronta para as 12 tasks** — confirmado. `adicionarRota`
   aceita `{id, method, path, funcao: lambda.IFunction}` e chama `httpApi.addRoutes` com
   `HttpLambdaIntegration`. Cada task futura só precisa criar sua `NodejsFunction` (já ligada à
   role dedicada pré-provisionada) e chamar `httpApiStack.adicionarRota(...)` — sem decidir
   convenção própria de path/integração. Testado via síntese com uma função fake
   (`http-api-stack.test.ts`): gera `AWS::ApiGatewayV2::Route` com `RouteKey: 'POST
   /v1/rota-fake'`.
3. **Nenhum JWT authorizer no API Gateway** — confirmado por dois ângulos: (a) leitura do
   código — `HttpApi` é criado sem `defaultAuthorizer`, `adicionarRota` não recebe nem repassa
   nenhum parâmetro de authorizer; (b) síntese — `http-api-stack.test.ts` afirma
   `resourceCountIs('AWS::ApiGatewayV2::Authorizer', 0)` e a rota sintetizada tem
   `AuthorizationType: 'NONE'`/`AuthorizerId: Match.absent()`; confirmei manualmente inspecionando
   `cdk.out/HttpApiStack.template.json` da síntese de produção (sem `adicionarRota` chamada):
   só `AWS::ApiGatewayV2::Api`, `AWS::ApiGatewayV2::Stage` e `AWS::CDK::Metadata` — nenhum
   `Authorizer` em nenhum cenário.
4. **`npx cdk synth --all` limpo, com teste de síntese** — confirmado. Síntese das 28 stacks sem
   erro (só o warning padrão de cross-stack-reference-strength, não relacionado a esta issue,
   já presente antes dela). Teste de síntese dedicado (`http-api-stack.test.ts`) passa.
5. **`pnpm typecheck:infra` e `pnpm lint` limpos** — confirmado, ambos sem saída de erro.

## Observações (não são defeito)

a. `npx cdk synth --all` — `--all` não é uma flag reconhecida nesta versão do CDK (2.1133.0);
   é ignorada e o synth roda o app inteiro por padrão (nenhum stack id informado = todas as
   stacks). Resultado equivalente ao pedido pela issue: síntese completa sem erro. Registrado
   como nota de comando, não como defeito — o texto da issue ("`npx cdk synth --all` continua
   limpo") está satisfeito no efeito, ainda que a flag literal não exista nesta versão do CDK.
b. `HttpApiStack` não referencia nenhuma outra stack (nenhuma prop cruzada), logo não há risco
   de `DependencyCycle` como o já resolvido em #748 para `ReceberOrcamentoLambdaRoleStack` —
   confirmado por leitura de `app.ts` e pela síntese limpa das 28 stacks juntas.
c. `terminationProtection = true` na stack: não exigido pela issue, mas coerente com o padrão
   de infra de produção de longa duração do repositório (API Gateway não deve ser destruído por
   engano). Não é lacuna, é decisão do dev-back-end dentro do escopo — mencionado apenas para
   registro.

## Gap de cobertura

Nenhum identificado. Os 3 testes de `http-api-stack.test.ts` cobrem exatamente os 3 critérios
de aceite verificáveis por síntese (HTTP API único, zero authorizer, rota registrada sem
auth). Não há regra de negócio, branch condicional ou tratamento de erro nesta stack que
justifique teste adicional — `adicionarRota` é uma chamada direta a `addRoutes`, sem lógica
própria a testar além do que já está coberto.

## Bugs encontrados

Nenhum.

## Parecer

APROVADO PELO QA.
