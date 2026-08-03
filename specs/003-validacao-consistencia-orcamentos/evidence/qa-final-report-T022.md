# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T022

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- Branch: `feature/003-t022-fornecedor-cadastrado-http-gateway`
- Commits testados: `c9bfc60` (implementação), `08b035c` (fix — classes de
  erro movidas de Infrastructure para Domain, apontado pelo backend-reviewer)
- PR #538 (draft)
- Task: T022 [US1] Infrastructure: `FornecedorCadastradoHttpGateway` +
  `FornecedorCadastradoACL`
- Primeira validação (sem BUG-XXX prévio)

## 2. Resumo executivo
T022 implementa a primeira integração síncrona da arquitetura com um
sistema externo fora do controle do produto (cadastro de fornecedores).
Timeout curto por tentativa via `AbortController`, retry limitado (padrão
2 tentativas) restrito a falhas transitórias (rede, timeout, 5xx), nunca
para 4xx nem corpo malformado. Esgotadas as tentativas, lança
`FornecedorCadastradoIndisponivelError` (Domain), nunca a exceção
original — o chamador (fila SQS) decide a política sem travar o
processamento de outros orçamentos (Princípio II). Resposta HTTP tratada
como entrada não confiável: `FornecedorCadastradoACL` traduz o corpo bruto
antes de qualquer valor cruzar para o Domain; JSON malformado nunca
propaga como está, sempre como `FornecedorCadastradoACLInvalidaError`
(Domain). Classes de erro corretamente posicionadas em
`domain/errors/`, não em `infrastructure/` — confirma achado MAJOR já
corrigido pelo backend-reviewer (2ª revisão, APPROVE WITH NITS).

Nenhum defeito de produção encontrado. Nenhum enfraquecimento de asserção
necessário nos testes já escritos pelo dev-back-end.

## 3. Requisitos cobertos e não cobertos
Cobertos (cenário positivo e negativos relevantes, plan.md § Infrastructure
e § Segurança):
- sucesso na 1ª tentativa (`cadastrado: true` / `false`);
- retry em 5xx com sucesso na tentativa seguinte;
- retry em erro de rede com sucesso na tentativa seguinte;
- esgotamento de tentativas em 5xx repetido → `FornecedorCadastradoIndisponivelError`;
- não-retry em 4xx (falha definitiva na 1ª tentativa);
- não-retry em corpo 200 malformado (falha do ACL propagada sem retry);
- ACL: tradução de `{cadastrado: true|false}` e rejeição de 7 formatos
  malformados (`null`, `undefined`, string, número, objeto vazio, campo
  não-booleano em 2 variações);
- hierarquia de erros: ambas as classes estendem `ErroDominio` e vivem em
  `domain/errors/`, capturáveis por `instanceof` pela Application (T024,
  ainda não implementada) sem import de path de Infrastructure.

Não coberto / risco residual, já documentado no próprio código como
divergência conhecida, não como lacuna desta task:
- protocolo/contrato exato do sistema externo (`GET /fornecedores/{cnpj}`
  → `{cadastrado: boolean}`) é uma suposição de trabalho, não confirmado
  com produto — reavaliar ACL e testes quando o contrato real chegar;
- branch `String(ultimoErro)` (linha 102 do gateway, caso `ultimoErro` não
  seja instância de `Error`) não exercitado — caminho defensivo de baixo
  risco, não um comportamento de negócio.
- Application (T024) que consumirá este gateway ainda não existe — fora
  do escopo de T022, integração ponta a ponta fica para o teste de T024.

## 4. Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado-http.gateway.test.ts tests/bounded-contexts/validacao/infrastructure/fornecedor-cadastrado.acl.test.ts tests/bounded-contexts/validacao/domain/errors/fornecedor-cadastrado.errors.test.ts`
  → 3 arquivos, 18 testes, todos passando.
- `npx vitest run --reporter=default tests/bounded-contexts/validacao` (regressão do BC completo)
  → 100 testes passando, 13 skipped (pré-existentes, persistence/schema
  aguardando infra de banco), 3 suites falhando por dependência ausente em
  `node_modules` (`pino`, `@aws-sdk/client-eventbridge`,
  `@opentelemetry/instrumentation-aws-lambda` e módulos relacionados) —
  pré-existente, não relacionado a T022 (confirmado: nenhum dos 3 arquivos
  de teste de T022 depende desses pacotes).
- `npx tsc --noEmit -p .` → mesmos módulos ausentes acima aparecem como
  erro em todos os BCs (extração, ingestão-identificação, validação,
  platform/conformidade) — pré-existente e ambiental, nenhum erro nos 3
  arquivos novos de T022.
- `npx eslint <3 arquivos de produção + 3 arquivos de teste de T022>` → sem
  achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest,
  conhecida — `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Unitário (Infrastructure — gateway com `fetch` fake, sem I/O real): 7
- Unitário (ACL): 9
- Unitário (Domain — hierarquia de erro): 2
- Total novo: 18. Nenhum teste adicional foi necessário além dos já
  escritos pelo dev-back-end — cobrem os cenários de risco prioritários
  (retry correto, timeout, tradução ACL, erro de domínio capturável).

## 6. Resultado
- Aprovados (escopo T022): 18
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 100 passed, 13 skipped (pré-existentes), 3
  suites falhando por dependência ambiental pré-existente (não relacionada)

## 7. Cobertura inicial e final
Cobertura medida via `vitest run --coverage` (v8) restrita aos 3 arquivos
de teste de T022, lida em `coverage/coverage-final.json` (statements por
arquivo, já que a tabela textual do terminal trunca nomes de arquivo
semelhantes e pode confundir leitura visual):
- `domain/errors/fornecedor-cadastrado.errors.ts`: 2/2 statements (100%)
- `infrastructure/fornecedor-cadastrado.acl.ts`: 4/4 statements (100%), 5/5 branches (100%)
- `infrastructure/fornecedor-cadastrado-http.gateway.ts`: 30/31 statements (96.77%), 17/18 branches (94.44%)
  — única linha não coberta: fallback `String(ultimoErro)` quando o erro
  capturado não é instância de `Error` (defensivo, baixo risco).

Não havia baseline anterior (arquivos novos nesta task). Threshold de
cobertura do projeto não foi reduzido; nenhum arquivo foi excluído da
medição para inflar percentual.

## 8. Allure
Não configurado nesta execução: `pnpm test` (que dispara o reporter
Allure do projeto) está ambientalmente quebrado
(`project_allure_vitest_incompat`), condição pré-existente e já registrada
como conhecida, não introduzida por T022. Execução e evidência desta
validação usam `vitest run --reporter=default` com output completo capturado
acima; sem dados sensíveis nos testes (CNPJ de teste é um valor
publicamente conhecido de exemplo, `11222333000181`, sem correspondência a
fornecedor real).

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Contrato do sistema externo de cadastro de fornecedores não confirmado
  com produto — assumido `GET {baseUrl}/fornecedores/{cnpj}` →
  `{cadastrado: boolean}`. Risco documentado no código
  (`fornecedor-cadastrado-http.gateway.ts`, `fornecedor-cadastrado.acl.ts`)
  e aqui; revalidar ACL e testes assim que o contrato real for confirmado
  — ação do PM/produto, não do QA.
- `baseUrl`, `timeoutMs` e `maxTentativas` não têm ainda um ponto de
  composição/injeção visível (esperado, pois é o consumidor da Application
  — T024, ainda não implementada — quem fará essa fiação); revisitar
  quando T024 for validada.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- 3 suites do BC `validacao` (`eventbridge.publisher`,
  `observability/logger`, `observability/tracing`) falham por pacotes
  ausentes em `node_modules` (`pino`, `@aws-sdk/client-eventbridge`,
  `@opentelemetry/*`) — pré-existente, confirmado idêntico em outros BCs
  (extração, ingestão-identificação, platform/conformidade), não
  relacionado a T022.

## 12. Parecer final
APROVADO PELO QA
