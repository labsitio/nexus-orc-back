# QA Final Report — #623 (PR #662)

## SPEC_ID e versão testada
004-indexacao-busca-semantica-orcamentos — commit `7f81636`, branch `feat/623-lambda-producao-indexador-queue`. Primeira validação (não é reteste de BUG). Sem T-number dedicado em `tasks.md` — a própria T030 registra "Composição de produção fica para #623, escopo separado". `backend-reviewer` já aprovou (APPROVE, 2ª rodada) após corrigir 1 MAJOR (VPC/networking) com props opcionais.

## Resumo executivo
Primeira Lambda de produção do repositório: composition root real (`clientesProducao()`, `criarBuscaIndexacao(deps)`), IAM least-privilege e `NodejsFunction` + `SqsEventSource` ligando a `indexador-queue`. Nenhum código já aprovado (T029 `IndexarOrcamento`, T030 fábrica do handler) foi alterado. O achado técnico central do PR — `IndexarOrcamentoPorMensagem`, subclasse que constrói um `DrizzlePgvectorIndiceOrcamentoRepository` novo por mensagem em vez de reaproveitar instância fixa entre tenants — resolve corretamente a inconsistência real entre "repositório fixo no construtor de `IndexarOrcamento`" e "repositório exige instância por tenant" (ADR-005) numa fila única não particionada por tenant. Verificado por leitura de código e teste: a delegação é real (não é stub vazio), confirmado pelo teste único do dev-back-end que exercita `executar` até a rejeição da ACL, e reforçado por leitura de `IndexarOrcamentoPorMensagem.executar`. `typecheck`, `typecheck:infra`, `lint` e `cdk synth --quiet` (sem deploy, sem credencial AWS) passam sem erro. Suíte completa: 1004 aprovados (1001 pré-existentes + 3 novos escritos por QA), 106 pulados (integração real Postgres, ambiente sem `DATABASE_URL`, pré-existente e não relacionado a este PR), 0 falhos. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
1. Composição de produção existe e compõe corretamente a fábrica T030 (`criarIndexadorQueueHandler`) e o caso de uso T029 (`IndexarOrcamento`) — COBERTO. `indexador-queue.production.ts` só compõe (nenhuma regra de negócio própria); `criarBuscaIndexacao` monta `BedrockEmbeddingGateway`, `EventBridgePublisher`, `OrcamentoValidadoEventACL` e `IndexarOrcamentoPorMensagem` sem tocar T029/T030.
2. `NodejsFunction` liga role + fila + bus — COBERTO por `cdk synth --quiet`: as 18 stacks (incluindo `IndexadorFunctionStack`) sintetizam sem erro, bundling esbuild ESM do `entry` correto, `SqsEventSource` com `reportBatchItemFailures: true` sobre `indexadorQueue`.
3. Isolamento multitenant de `IndexarOrcamentoPorMensagem` está correto e testado — COBERTO. Teste do dev-back-end comprova delegação real (payload inválido rejeitado pela ACL dentro da execução real, não por um stub); leitura de código confirma que `repositorioNuncaUsado` nunca é invocado e que cada chamada de `executar` cria `DrizzleTenantScopedRepositoryBase`-derivado escopado ao `TenantId` daquela mensagem específica, nunca reaproveitado entre chamadas.
4. Nenhuma regressão nos testes pré-existentes — COBERTO. 1001 testes pré-existentes continuam passando; único delta é 3 testes novos (todos passando).
5. IAM least privilege (`bedrock:InvokeModel` restrito a ARN parametrizado, `events:PutEvents` restrito ao bus, sem policy Postgres/S3) — COBERTO por leitura de código (`indexador-lambda-role-stack.ts`) + sintaxe validada por `cdk synth`. **Não coberto**: comportamento IAM em runtime real (nenhuma credencial AWS disponível nesta sessão para `cdk diff`/deploy real) — ver limitações de ambiente.
6. `exigirAgenteIaBedrockEmProducao` (ADR-009, fail-fast) — não tinha teste do dev-back-end; QA escreveu 3 casos (`tests/composition/aws-clients.production.test.ts`) cobrindo ausente/valor errado/valor correto, único branch de decisão do arquivo.
7. VPC/networking da Lambda contra Aurora — fora de escopo de #623 por design (nenhuma stack de rede/Aurora existe ainda no repo); props opcionais `vpc`/`vpcSubnets`/`securityGroups` hoje `undefined`, documentado no próprio código como pendência da stack de rede futura, não como lacuna deste PR.

## Suítes executadas e comandos
- `source ~/.nvm/nvm.sh && nvm use --lts` (Node 24.19.0)
- `pnpm run typecheck` → sem erros.
- `pnpm run typecheck:infra` → sem erros.
- `pnpm run lint` → sem erros (1 falso positivo transitório de `cdk.out/` gerado pela própria sessão de QA ao rodar `cdk synth` antes de medir lint — `cdk.out/` está no `.gitignore`, removido antes da medição final; não é achado sobre o PR).
- `cdk synth --quiet` (raiz do repo, onde está `cdk.json`) → sintetiza as 18 stacks sem erro, incluindo `IndexadorFunctionStack`; sem deploy, sem credencial AWS.
- `pnpm run test` → suíte completa.
- `pnpm exec vitest run tests/composition/ --coverage --coverage.include='src/composition/**'` → cobertura isolada dos composition roots.

## Quantidade de testes por tipo
Unitário/composição: 7 no total em `tests/composition/` (1 pré-existente `extracao.test.ts`, 1 pré-existente `ingestao-identificacao.test.ts`, 2 do dev-back-end em `busca-indexacao.test.ts`, 3 novos de QA em `aws-clients.production.test.ts`). Nenhum teste de integração/E2E adicional necessário — `cdk synth` é o gate mais forte disponível sem credencial AWS.

## Resultado: aprovados, falhos, ignorados e instáveis
`tests/composition/`: 7 aprovados, 0 falhos, 0 ignorados, 0 instáveis.
Suíte completa do repositório: 1004 aprovados, 0 falhos, 106 ignorados (integração real Postgres/`DATABASE_URL` ausente, pré-existente, mesma limitação já registrada em validações anteriores desta spec), 0 instáveis.

## Cobertura inicial e final
Baseline: não medida separadamente para os composition roots (arquivos novos deste PR — baseline é 0% por definição).
Final, isolada em `src/composition/**`: `aws-clients.production.ts` 75% statements / 100% branches / 50% functions / 75% lines (linha 28 não coberta: corpo de `clientesProducao()`, construção direta de clientes SDK v3 sem branch — mesmo padrão não testado de `clientesLocais()` em `src/dev/config.ts`, classificado como **código inviável de ganho adicional**). `busca-indexacao.ts` 80% statements / 100% branches / 50% functions / 80% lines (linhas 42-52 não cobertas: `repositorioNuncaUsado`, stub que lança `never`, documentado no código como "nunca invocado", só satisfaz o tipo do parâmetro do construtor — classificado como **exclusão tecnicamente justificada**, estruturalmente inalcançável por design). Nenhuma lacuna representa risco de negócio não testado.

## Local do allure-results e do relatório Allure
`allure-results/` na raiz do repositório, gerado automaticamente por `allure-vitest/reporter` (já configurado em `vitest.config.ts`, reaproveitado sem configuração adicional) durante `pnpm run test`. Relatório HTML não gerado nesta rodada (fica a critério do pipeline/CI via `allure generate`); resultados brutos confirmados presentes após a execução da suíte completa.

## Bugs por severidade e status
Nenhum bug aberto nesta validação.

## Riscos residuais
- Comportamento IAM em runtime real (least privilege efetivo, trust policy) não exercitado — sem credencial AWS nesta sessão, `cdk synth` valida apenas sintaxe/bundling, não semântica de permissão em produção. Mitigação: revisão estática de código já feita (ARNs parametrizados, nenhum wildcard em `Resource`).
- VPC/networking da Lambda: props opcionais hoje `undefined` porque nenhuma stack de rede/Aurora existe no repositório — deploy real só funcionará se o Aurora de destino aceitar conexão fora de VPC, o que não é o cenário esperado em produção. Registrado no próprio código como pendência da stack de rede futura (fora de escopo de #623); recomendação de QA: acompanhar como item bloqueante do primeiro deploy real, não desta validação.
- Cobertura de `clientesProducao()`/`repositorioNuncaUsado` abaixo de 100% — justificada (ver seção de cobertura), sem ação necessária.

## Limitações do ambiente
Sem credencial AWS real nesta sessão — não foi possível fazer `cdk deploy` nem `cdklocal deploy`/LocalStack Lambda para exercitar a função de ponta a ponta contra SQS/Bedrock reais. `cdk synth --quiet` é o gate mais forte disponível sem credencial (valida sintaxe CDK e bundling esbuild ESM, não valida IAM em runtime nem cold start real). `DATABASE_URL` não configurado nesta sessão — 106 testes de integração real (Postgres/pgvector) permanecem pulados, comportamento já esperado e documentado nas validações anteriores desta spec (T025, T029, T030).

## Parecer final
APROVADO PELO QA
