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

---

# QA Final Report — T016/T019 (issues #21, #24) — PR #402

## SPEC_ID e versão testada
`001-ingestao-classificacao-orcamentos`. PR #402, branch `feat/001-c-us1`,
commit `2fee2e2`, base `main`@`b1a2bf4`. Primeira validação (não é reteste).

## Resumo executivo
Trilha 001-C (US1 Ingestão), parcial: 2 de 11 tasks (T016, T019). Restante da
trilha bloqueado por dependência externa não implementada (T010/T011,
`DrizzleOrcamentoRepository`, issue #16). `backend-reviewer` já havia
aprovado (APPROVE WITH NITS); nit de teste duplicado corrigido no commit
`2fee2e2`. QA confirma diretamente no código e na execução, não apenas por
declaração do dev-back-end ou do reviewer anterior.

- **T016**: `Orcamento.receber` testado para os 4 canais fixos
  (`PORTAL_WEB`, `API_REST`, `SFTP`, `APP_MOBILE`) via `it.each`, status
  nasce `RECEBIDO`. Rejeição de canal fora dos 4 fixos já coberta na
  fronteira do VO `Canal` (T006, pré-existente) — redundante repetir no
  agregado, decisão de engenharia correta.
- **T019**: `S3ArmazenamentoBrutoGateway` — `armazenar()` grava com chave
  prefixada por canal + UUID, propaga erro explícito se o S3 não devolver
  `VersionId` (bucket sem versionamento); `lerConteudoBruto()` lê sempre
  pela `versionId` explícita da referência, propaga erro explícito se não
  vier `Body`. Ambos os caminhos de erro têm teste dedicado.

## Requisitos cobertos e não cobertos
Cobertos (detalhe em `qa/traceability-matrix.md`):
- Criação do agregado nos 4 canais fixos com status inicial correto (T016).
- Imutabilidade do dado bruto via versionamento S3 real, com erro explícito
  em vez de silêncio quando o S3 não confirma versionamento (T019,
  Princípio III).
- Leitura sempre pela versão explícita, nunca "latest" implícito (T019).

Não cobertos (fora de escopo desta entrega parcial, não é lacuna desta
task): T017 (contract test upload), T018 (integração 4 canais → mesmo
evento), T020–T026 (caso de uso `ReceberOrcamento`, controllers, Lambda
SFTP, lifecycle rule, Cognito, IAM) — todos bloqueados por T010/T011
(repositório) ainda não implementado, conforme informado pelo dev-back-end.

## Suítes executadas e comandos
```
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm exec vitest run --coverage
```
Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
63 testes unitários no total (suíte inteira, 12 arquivos) — 15 no escopo
direto deste PR (11 no agregado, 4 no gateway S3), 48 de rodadas/trilhas
anteriores, todos passando sem regressão. Sem teste de integração real
contra S3 (LocalStack indisponível neste ambiente — limitação conhecida e
aceita, ver abaixo). Sem contrato/E2E aplicável (fora do escopo de T016/T019).

## Resultado
63 aprovados, 0 falhos, 0 ignorados, 0 instáveis.

## Cobertura inicial e final
Inicial (baseline, `main`@`b1a2bf4`): Statements 92.91% · Branches 100% ·
Functions 84% · Lines 92.8% (domain-only).
Final (commit `2fee2e2`, suíte inteira): Statements 92.52% · Branches
91.37% · Functions 90.32% · Lines 92.44%. `s3-armazenamento-bruto.gateway.ts`
— o único arquivo de produção deste PR — está em **100%** statements/
branches/functions. A leve queda no agregado geral vem de arquivos de outra
trilha (001-E) coexistindo na suíte, não do diff deste PR. Detalhe em
`qa/coverage-final.md`.

## Local do allure-results e do relatório Allure
`allure-results/` (raiz do repo, git-ignorado), 63 arquivos JSON, todos
`"status":"passed"`. Relatório HTML não gerado (mesma limitação de rodadas
anteriores — requer CLI Java Allure). Ver `qa/allure-report.md`.

## Bugs por severidade e status
Nenhum bug de produção aberto.

## Riscos residuais
- Fake de `S3Client` no teste de `s3-armazenamento-bruto.gateway.test.ts`
  não afirma os argumentos exatos enviados a `GetObjectCommand`/
  `PutObjectCommand` (ex.: que `VersionId` do comando corresponde à
  `referencia.versionId`) — apenas o retorno é estimulado. Revisão manual
  do código de produção confirma que os argumentos estão corretos. Risco
  baixo, registrado para reforço futuro (assert em `send.mock.calls`), não
  bloqueia esta entrega.
- Sem teste de integração real contra S3 (LocalStack indisponível). Unit
  test contra fake é adequado ao escopo declarado da task (T019 é infra
  unitária); integração real fica para T018 (fase de US1 ainda bloqueada).
- Observação não bloqueante: commit `24c6403` (T019) trouxe `fastify` e
  `zod` para `package.json`/`pnpm-lock.yaml` sem uso no diff deste PR —
  aparenta arraste do worktree compartilhado com a trilha 001-E paralela.
  Não quebra build/lint/teste. Sinalizado ao dev-back-end para avaliar
  remoção em commit separado (não é bloqueio de gate).
- Trilha 001-C majoritariamente bloqueada (9 de 11 tasks) por T010/T011
  (`DrizzleOrcamentoRepository`, issue #16) ainda não implementada — sem
  repositório real, US1 não é testável ponta a ponta ainda.

## Limitações do ambiente
Sem LocalStack/AWS real disponível — teste de T019 usa fake de `S3Client`,
não integração real. Node ativo do shell era 18/24 dependendo da sessão;
usado `nvm use 24` para alinhar com `engines.node >= 24` do projeto.
Worktree compartilhado com agente paralelo (trilha 001-E, US4) — arquivos
não relacionados (`consultar-status-orcamento.ts`, `status.schema.ts`,
testes de contrato de status) presentes mas não commitados nesta PR;
ignorados nesta validação por não pertencerem ao diff de #402, exceto onde
coexistem na mesma execução de suíte (sem impacto — todos passam).

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T011 (issue #16) — PR #410

Ver detalhe completo em `specs/001-ingestao-classificacao-orcamentos/evidence/qa-T011.md`.
Resumo: `DrizzleOrcamentoRepository` (T011) validado por 5 testes de
integração contra Postgres real, incluindo o cenário de concorrência que
protege o achado MAJOR já corrigido pelo `backend-reviewer` (lock `SELECT
... FOR UPDATE`). 79/79 testes passando, sem regressão. Cobertura do arquivo
do diff: 0%→100% statements/lines/functions, 0%→88.09% branch. Nenhum
defeito de produção encontrado.

## Parecer final
APROVADO PELO QA

---

# QA Final Report — T044–T047 (issues #49–#52) — PR #404

## SPEC_ID e versão testada
`001-ingestao-classificacao-orcamentos`. PR #404 (draft), branch
`feat/001-e-us4-v2`, commit `56cf669`, base `main`@`6eaab14`. Primeira
validação (não é reteste).

## Resumo executivo
US4 (status consultável): `status.schema.ts` (T044/#49), controller `GET
/v1/orcamentos/{orcamentoId}/status` (T047/#52), `ConsultarStatusOrcamento`
(T046/#51). Os 3 testes já escritos pelo dev-back-end cobriam os 3 estados
via schema/contrato e o fluxo de integração com escalonamento + confirmação
humana (T045). QA identificou uma lacuna real na camada HTTP — o teste de
`PENDENTE_REVISAO_HUMANA` só verificava `status`, não o
`historico`/`resultadoAtual`, e não havia teste de HTTP (`app.inject`) para
a preservação do histórico após confirmação humana nem para o branch de
rethrow de erro inesperado do controller. Reforçou o teste existente e
adicionou 2 novos, sem tocar em código de produção.

## Requisitos cobertos e não cobertos
Cobertos (detalhe em `qa/traceability-matrix.md`):
- 3 estados (RECEBIDO/CLASSIFICADO/PENDENTE_REVISAO_HUMANA) consultáveis via
  `GET /v1/orcamentos/{orcamentoId}/status`, incluindo histórico com agente.
- 404 Problem Details (RFC 7807, `content-type: application/problem+json`)
  para `orcamentoId` inexistente.
- Histórico da tentativa do Classificador preservado (não sobrescrito) após
  confirmação humana — verificado tanto no caso de uso (T045, dev-back-end)
  quanto na camada HTTP completa (novo teste, QA).
- Erro inesperado do repositório não mascarado como 404 (novo teste, QA).

Não cobertos (fora de escopo desta task, aceito): persistência real via
`DrizzleOrcamentoRepository` (T011/#16, ainda `ready`); IAM (T048); métrica
CloudWatch de status consultável (T049).

## Suítes executadas e comandos
```
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
npx vitest run --coverage
```
Detalhe completo em `qa/test-execution-report.md`.

## Quantidade de testes por tipo
68 testes no total (suíte inteira, 12 arquivos): contrato de schema (7,
T044), contrato de controller/HTTP (7, T047 + 3 novos de QA), integração de
caso de uso (3, T045/T046), demais 51 de rodadas/trilhas anteriores sem
regressão.

## Resultado
68 aprovados, 0 falhos, 0 ignorados, 0 instáveis.

## Cobertura inicial e final
Inicial: Statements 92.52% · Branches 91.37% · Functions 90.32% · Lines
92.44%. Final: Statements 93.1% · Branches 94.82% · Functions 90.32% · Lines
93.02%. Os 3 arquivos de produção deste PR chegam a 100% statements/lines;
`status.controller.ts` sobe de 75%→91.66% branch com o teste de rethrow.
Detalhe em `qa/coverage-final.md`.

## Local do allure-results e do relatório Allure
`allure-results/` (raiz do repo, git-ignorado), 68 arquivos JSON, todos
`"status":"passed"`. Relatório HTML não gerado (mesma limitação de rodadas
anteriores — requer CLI Java Allure). Ver `qa/allure-report.md`.

## Bugs por severidade e status
Nenhum bug de produção encontrado.

## Riscos residuais
- Branch restante não coberto em `status.controller.ts` (linha 20, nullish
  coalescing de `motivoInsucesso`/`resultado` na serialização): caminho
  trivial sem decisão de negócio, risco baixo.
- `TentativaClassificacao.insucesso` (VO já existente, T006) nunca é
  invocado pelo agregado — `registrarTentativaClassificador` sempre usa
  `.sucesso()`, mesmo para confiança abaixo do limiar (o VO guarda o
  resultado completo com `nivelConfianca` baixa, não um `motivoInsucesso`
  textual). O fixture do contract test (T044) para `PENDENTE_REVISAO_HUMANA`
  usa a forma `resultado: null` + `motivoInsucesso: string`, que o schema
  aceita (campos opcionais/nulos) mas que a implementação real nunca produz
  hoje. Não é bug — o schema é intencionalmente permissivo e o comportamento
  real está coberto por outro teste — mas é uma divergência entre fixture
  sintético e comportamento observável real, registrada para consciência do
  time (não bloqueia esta entrega).

## Limitações do ambiente
`DrizzleOrcamentoRepository` real (T011/#16) ainda não mergeado — sem
wiring de produção contra Aurora; confirmado como aceito e fora de escopo
pelo dev-back-end na invocação. Node ativo do shell por padrão em v18 (nvm);
usado `nvm use 24` para alinhar com `engines.node >= 24`.

## Parecer final
APROVADO PELO QA
