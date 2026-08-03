# QA Final Report — SPEC 003-validacao-consistencia-orcamentos — T024

## 1. SPEC_ID e versão testada
- SPEC_ID: `003-validacao-consistencia-orcamentos`
- PR: #542
- Branch: `003-t024-validar-orcamento-use-case`
- Commit testado: `dc731e7`
- Task: T024 [US1] Application: caso de uso `ValidarOrcamento` (issue #134)
- Primeira validação (sem BUG-XXX prévio)
- Revisão prévia de código: backend-reviewer, APPROVE WITH NITS (2 achados MINOR
  não bloqueantes: I/O redundante em caminho de erro — na verdade o código já
  evita essa redundância, ver seção 3 — e ausência de outbox pattern, débito
  arquitetural preexistente também presente na spec 002, não regressão desta task)

## 2. Resumo executivo
`ValidarOrcamento.executar` consome o payload traduzido por
`OrcamentoExtraidoEventACL`, aplica as 4 regras determinísticas de
`regras-consistencia.ts` (T010) mais a checagem de CNPJ contra cadastro externo
(`FornecedorCadastradoGateway`, T022) e faixas de preço (`ParametroFaixaPrecoGateway`,
T023), registra o resultado via `OrcamentoValidacao.avaliarRegrasDeConsistencia`
(T009), persiste via `OrcamentoValidacaoRepository` e publica `OrcamentoValidado`
ou `OrcamentoInconsistenciaDetectada` conforme o status resultante do agregado —
nunca decide o evento fora da regra do próprio agregado.

Idempotência contra entrega duplicada da fila SQS (at-least-once) é tratada
explicitamente: se já existe registro com status diferente de `PENDENTE`, o
caso de uso retorna sem reavaliar nem republicar.

Achado de código relevante confirmado nesta validação: a chamada ao
`FornecedorCadastradoGateway.estaCadastrado` já é condicionada a
`cnpjValido` (`cadastrado = cnpjValido ? await ... : true`) — quando o CNPJ já
reprova por formato/dígito verificador, o gateway externo não é chamado. Isso
está coberto pelo teste "nunca consulta o cadastro externo quando o CNPJ já é
inválido em formato/dígito verificador", que passou. O achado MINOR do
backend-reviewer sobre I/O redundante não se traduziu em comportamento
observável divergente nesta suíte — sem evidência de bug, tratado como nota de
estilo, não bloqueante.

Nenhum defeito de produção encontrado. Nenhum enfraquecimento de asserção foi
necessário.

## 3. Requisitos cobertos e não cobertos
Cobertos (critério de aceite spec.md US1, P1 — "orçamento extraído sem nenhuma
inconsistência de negócio é marcado 'validado' ... sem ação manual"):
- caminho feliz: todas as regras passam e CNPJ cadastrado → agregado transita
  para `VALIDADO`, persiste, publica `OrcamentoValidado`;
- CNPJ com formato válido mas não cadastrado → `CNPJ_DIVERGENTE_CADASTRO`,
  agregado vai para `PENDENTE_REVISAO_HUMANA`, publica
  `OrcamentoInconsistenciaDetectada` com a regra específica;
- CNPJ já inválido em formato/dígito verificador → gateway externo nunca
  chamado (evita I/O e falso-negativo de "não cadastrado" para um CNPJ que
  nem é um CNPJ válido), inconsistência `CNPJ_INVALIDO` reportada, não
  `CNPJ_DIVERGENTE_CADASTRO`;
- idempotência: entrega duplicada da fila (orçamento já fora de `PENDENTE`)
  não reavalia, não persiste de novo, não republica.

Medição de p95 (critério de aceite "em até 5 minutos, p95") continua coberta
por T021 (`validar-orcamento.integration.test.ts`), não alterado nesta task —
reexecutado como regressão, 2 testes passando.

Não coberto / fora do escopo desta task, não lacuna:
- publicação de `OrcamentoInconsistenciaDetectada` para as demais 3 regras
  (campos obrigatórios, faixa de preço, prazo) isoladamente no caso de uso —
  já cobertas unitariamente nas próprias regras (T019) e no agregado (T018);
  o caso de uso apenas orquestra, sem lógica de decisão própria por regra;
- categorização de item via IA (Bedrock) para itens sem `categoria` conhecida
  — explicitamente US3/T042, fora do escopo, documentado no próprio arquivo
  de produção;
- handler Lambda consumidor SQS (T025) e endpoint de status (T026/T027) —
  downstream, fora do escopo desta task;
- `RegistrarDecisaoHumanaValidacao` (US2, T035) — downstream.

## 4. Suítes executadas e comandos
- `npx vitest run --reporter=default tests/bounded-contexts/validacao/application/validar-orcamento.test.ts`
  → 1 arquivo, 4 testes, todos passando.
- `npx vitest run --reporter=default tests/bounded-contexts/validacao` (regressão do BC completo)
  → 22 arquivos, 104 testes passando, 15 skipped (testes de integração com
  Postgres real, sem `DATABASE_URL` nesta execução — `describe.skipIf`, mesmo
  padrão já usado nas tasks anteriores), 3 suites falhando por dependência
  ausente em `node_modules` (`pino`, `@aws-sdk/client-eventbridge`,
  `@opentelemetry/instrumentation-aws-lambda` e módulos relacionados) —
  confirmado ambiental e pré-existente pelo backend-reviewer, arquivos não
  relacionados a este diff, idêntico ao padrão já visto em T022/T023.
- `npx tsc --noEmit -p tsconfig.json` → mesmos módulos ausentes acima
  aparecem como erro em todos os BCs do monorepo (ambiental, pré-existente);
  nenhum erro atribuível a `validar-orcamento.ts` ou ao teste desta task.
- `npx eslint src/bounded-contexts/validacao/application/use-cases/validar-orcamento.ts tests/bounded-contexts/validacao/application/validar-orcamento.test.ts`
  → sem achados.
- `pnpm test` não usado (incompatibilidade ambiental allure-vitest, conhecida —
  `project_allure_vitest_incompat`).

## 5. Quantidade de testes por tipo
- Unitário (Application, com mocks/fakes de gateway/repositório/publisher): 4
  (caminho feliz; CNPJ não cadastrado; CNPJ inválido em formato não chama
  gateway; idempotência contra duplicidade). Cobrem os riscos prioritários do
  escopo desta task. Nenhum teste adicional criado pelo QA — os 4 já
  entregues pelo dev-back-end são suficientes e corretos para o escopo de T024.
- Integração (T021, pré-existente, não alterado): 2, reexecutados como
  regressão.

## 6. Resultado
- Aprovados (escopo T024): 4
- Falhos: 0
- Ignorados: 0
- Instáveis: 0
- Regressão do BC `validacao`: 104 passed, 15 skipped (22 suites), 3 suites
  falhando por dependência ambiental pré-existente (não relacionada, mesma
  condição documentada nos reports de T022/T023)

## 7. Cobertura inicial e final
Não havia baseline anterior (arquivo novo nesta task). Medida via
`vitest run --coverage` (v8) restrita a `validar-orcamento.ts`:
- Statements: 100% (20/20)
- Branches: 100% (12/12)
- Functions: 100% (3/3)
- Lines: 100% (20/20)

Threshold de cobertura do projeto não foi reduzido; nenhum arquivo foi
excluído da medição para inflar percentual.

## 8. Allure
Não configurado nesta execução: `pnpm test` (que dispara o reporter Allure do
projeto) está ambientalmente quebrado (`project_allure_vitest_incompat`),
condição pré-existente, não introduzida por T024. Execução e evidência desta
validação usam `vitest run --reporter=default` com output completo capturado
acima; sem dados sensíveis — os únicos dados usados nos testes são CNPJ
sintético válido (`11222333000181`, dígito verificador correto mas não
correspondente a empresa real) e valores monetários fictícios em centavos.

## 9. Bugs por severidade e status
Nenhum bug encontrado.

## 10. Riscos residuais
- Ausência de outbox pattern (achado MINOR do backend-reviewer): persistência
  do agregado e publicação do evento não são atômicas na mesma transação —
  débito arquitetural preexistente, já presente e aceito na spec 002, não é
  regressão introduzida por esta task. Registrado como risco residual, não
  como defeito bloqueante.
- Caminho de falha das outras 3 regras (campos obrigatórios, preço fora de
  faixa, prazo incoerente) através do caso de uso completo ainda não tem
  teste dedicado no nível de Application (só no nível de regra isolada e de
  agregado) — risco baixo, pois o caso de uso não bifurca lógica por regra
  (agrega a lista e delega a decisão ao agregado); recomenda-se cobrir
  explicitamente quando T034 (US2, "completar `ValidarOrcamento` para o
  caminho de falha") for implementada, já que ali o mesmo arquivo será
  estendido.

## 11. Limitações do ambiente
- `pnpm test` quebra a suíte inteira por incompatibilidade allure-vitest —
  ambiental, conhecida, contornada com `npx vitest run --reporter=default`.
- 3 suites do BC `validacao` (`eventbridge.publisher`,
  `observability/logger`, `observability/tracing`) falham por pacotes
  ausentes em `node_modules` (`pino`, `@aws-sdk/client-eventbridge`,
  `@opentelemetry/*`) — pré-existente, confirmado ambiental pelo
  backend-reviewer, não relacionado a T024.
- Testes de integração com Postgres real (15) foram skipped nesta execução
  por ausência de `DATABASE_URL` local; T021 (integração equivalente à p95
  do critério de aceite) roda sem dependência de banco e foi executado com
  sucesso.

## 12. Parecer final
APROVADO PELO QA
