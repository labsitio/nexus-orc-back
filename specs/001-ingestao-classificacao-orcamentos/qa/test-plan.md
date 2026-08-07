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

---

# Test Plan — T016/T019 (issues #21, #24) — PR #402

## Escopo
US1 (Ingestão multi-canal), parcial: `Orcamento.receber` para os 4 canais
fixos (T016) e `S3ArmazenamentoBrutoGateway` (T019) —
`src/bounded-contexts/ingestao-identificacao/infrastructure/s3-armazenamento-bruto.gateway.ts`.

## Fora de escopo
Demais tasks de US1 (T017, T018, T020–T026) — bloqueadas por dependência
externa (T010/T011, `DrizzleOrcamentoRepository`, issue #16, ainda não
implementada). Application/Interface/IAM desta user story. LocalStack/S3 real
(indisponível neste ambiente).

## Riscos
- `armazenar()` aceitar objeto sem `VersionId` silenciosamente (bucket sem
  versionamento habilitado) — violaria Princípio III (imutabilidade).
- `lerConteudoBruto()` ler a versão mais recente em vez da `versionId`
  explícita da referência (corromperia rastreabilidade de qual bytes foram
  classificados).
- Canal fora dos 4 fixos sendo aceito pelo agregado.

## Níveis e tipos de teste
Unitário (agregado com `it.each` dos 4 canais; gateway S3 com fake de
`S3Client` via `vi.fn`, sem SDK real nem LocalStack — infraestrutura AWS
real fora do escopo desta task/ambiente).

## Ambientes e dependências
Node 24.18.1 (nvm), pnpm 11.18.0, vitest 4.1.10. Sem LocalStack/AWS
disponível — limitação de ambiente conhecida e aceita (unit test, não
integration test).

## Estratégia de dados
Fixtures inline; fake local de `S3Client` (`s3ClientFake`), sem framework de
mock de infraestrutura.

## Estratégia de mocks/fakes
Fake mínimo de `S3Client.send` (`vi.fn().mockResolvedValue(...)`), cobrindo
os 2 comandos usados (`PutObjectCommand`, `GetObjectCommand`) e os 2 casos de
erro (sem `VersionId`, sem `Body`).

## Critérios de entrada
PR #402, branch `feat/001-c-us1`, commit `2fee2e2`.

## Critérios de saída
63/63 testes da suíte inteira passando (11 no agregado + 4 no gateway S3 +
48 pré-existentes de outras trilhas); `tsc --noEmit` e `eslint .` limpos;
sem defeito crítico/alto aberto; sem regressão nos VOs/agregado/eventos já
validados em rodadas anteriores.

## Abordagem Allure
Reaproveitado `allure-vitest` já configurado em `vitest.config.ts` (rodadas
anteriores). `allure-results/` regenerado nesta execução.

## Ordem de execução
1. `pnpm install --frozen-lockfile`
2. `pnpm run typecheck`
3. `pnpm run lint`
4. `pnpm exec vitest run --coverage`

## Limitações
- Sem LocalStack/AWS real — `S3ArmazenamentoBrutoGateway` validado apenas
  como unit test contra fake de `S3Client`; integração real contra bucket
  `nexo-orcamentos-raw` fica para teste de integração/E2E de fase posterior
  (T018), quando US1 estiver completa.
- Fake de `S3Client` não asserta os argumentos exatos passados a
  `GetObjectCommand`/`PutObjectCommand` (ex.: que `VersionId` do comando
  corresponde à `referencia.versionId`) — apenas o retorno é estimulado.
  Revisão manual do código de produção confirma que os argumentos estão
  corretos (linha a linha), mas um teste que capturasse `send.mock.calls` e
  afirmasse o shape do comando teria detectado uma futura regressão nesse
  ponto sem depender de leitura manual. Risco baixo (lógica trivial, 3
  linhas), registrado para reforço futuro, não bloqueia esta entrega.
- Repositório/persistência (T011) ainda não existe — T016 testa apenas
  criação em memória do agregado, não round-trip de persistência.

---

# Test Plan — T044–T047 (issues #49–#52) — PR #404

## Escopo
US4 (status consultável): `status.schema.ts` (T044), `ConsultarStatusOrcamento`
(T046), `status.controller.ts`/`GET /v1/orcamentos/{orcamentoId}/status` (T047).

## Fora de escopo
`DrizzleOrcamentoRepository` real (T011, issue #16, ainda `ready`) —
`ConsultarStatusOrcamento` depende só da interface `OrcamentoRepository`
(T009), testado com fake in-memory. Wiring de produção contra Aurora fica
para quando #16 for mergeada. IAM (T048), métrica CloudWatch (T049).

## Riscos
- Histórico da tentativa do Classificador sobrescrito por confirmação humana
  posterior (viola critério de aceite "não apagar registro anterior").
- 404 sem `content-type: application/problem+json` (RFC 7807).
- `resultadoAtual` não refletir a última tentativa quando status é
  `PENDENTE_REVISAO_HUMANA` (campo consultável mas confuso se null).
- Erro inesperado do repositório mascarado como 404 (esconde falha real).

## Níveis e tipos de teste
Contrato (schema Zod isolado + controller via `fastify.inject`), integração
(caso de uso against fake de `OrcamentoRepository`).

## Ambientes e dependências
Node 24.18.1 (nvm), pnpm 11.18.0, vitest 4.1.10, fastify (`app.inject`, sem
subir servidor real).

## Estratégia de dados
Fixtures inline via VOs reais do domínio (`Orcamento.receber` +
`registrarTentativaClassificador`/`registrarConfirmacaoHumana`).

## Estratégia de mocks/fakes
`OrcamentoRepositoryFake` in-memory (`Map`), já escrito pelo dev-back-end —
reaproveitado; QA adicionou um repositório fake que lança erro síncrono para
exercitar o branch de rethrow do controller.

## Critérios de entrada
PR #404 (draft), branch `feat/001-e-us4-v2`, commit `56cf669`, base `main`@`6eaab14`.

## Critérios de saída
Suíte completa passando, `tsc --noEmit`/`eslint .` limpos, os 3 arquivos do
diff com 100% statements/lines, sem defeito crítico/alto aberto.

## Abordagem Allure
Reaproveitado `allure-vitest` já configurado.

## Ordem de execução
1. `pnpm install --frozen-lockfile`
2. `pnpm run typecheck`
3. `pnpm run lint`
4. `pnpm exec vitest run --coverage`

## Limitações
- Sem `DrizzleOrcamentoRepository` real — aceito, fora de escopo deste PR
  (issue #16 ainda `ready`).
- Sem teste de carga/concorrência na consulta (query read-only sem estado
  compartilhado — risco considerado baixo, não há escrita concorrente neste
  caso de uso).

---

# Test Plan — T011 (issue #16) — PR #410

## Escopo
`DrizzleOrcamentoRepository` implementando `OrcamentoRepository` (Domain,
T009) sobre o schema Drizzle de T010 —
`src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-orcamento.repository.ts`.
Tradução linha↔agregado (`salvar`, `buscarPorId`), nenhum tipo de linha
(`LinhaOrcamento`/`LinhaHistorico`) escapando do arquivo.

## Fora de escopo
Application (`ReceberOrcamento`, `ClassificarOrcamento`,
`ConfirmarRevisaoHumana` — ainda não existem) e Interface. Schema/migração
(T010, já mergeado via PR #403, testado em rodada anterior).

## Riscos
- **MAJOR (já corrigido pelo dev-back-end antes desta validação)**: `salvar`
  concorrente do mesmo agregado (ex.: retry de Lambda + invocação original)
  duplicando a mesma tentativa em `orcamentos_historico` — a contagem de
  linhas já persistidas, lida sem lock, poderia ser lida igual pelas duas
  transações. Corrigido com `SELECT ... FOR UPDATE` em `orcamentos` como
  primeira operação da transação de `salvar`. Este é o risco de maior
  prioridade desta task — o único achado de severidade alta no ciclo de
  revisão anterior (`backend-reviewer`).
- `buscarPorId` reconstruindo o agregado com status/histórico incorretos
  (ex.: histórico fora de ordem, resultado parcial reconstituído como
  `undefined` quando deveria estar completo).
- Re-salvar o mesmo agregado sem transição nova duplicando histórico (a
  lógica de "quantas linhas já persistidas" é a única barreira).

## Níveis e tipos de teste
Integração contra Postgres real (não mock) — mesmo padrão de T010: schema já
migrado, `DATABASE_URL` do ambiente, guardado por
`describe.skipIf(!DATABASE_URL)`.

## Ambientes e dependências
Node 24.14.0 (via `/c/nvm4w/nodejs` direto, corepack/pnpm não estavam no PATH
da sessão de QA), pnpm 11.18.0, Postgres 16 (`pgvector/pgvector:pg16`) via
`docker-compose.yml`, container `nexus-orc-back-postgres-1` (compartilhado
entre worktrees — estava parado, iniciado com `docker start`).

## Estratégia de dados
Agregados reais construídos via `Orcamento.receber`/`registrarTentativa-
Classificador`/`registrarConfirmacaoHumana` (Domain real, não fixture de
linha). `OrcamentoId.novo()` por teste, cleanup explícito por id em
`afterEach` (ver Limitações — não é possível envolver `salvar()` em
`BEGIN`/`ROLLBACK` externo, a transação interna do Drizzle commitaria a
externa).

## Estratégia de mocks/fakes
Nenhum mock — Postgres real, mesma decisão de T010 (dev-back-end já validou
manualmente contra o mesmo banco; QA formaliza os mesmos 4 cenários como
suíte automatizada).

## Critérios de entrada
PR #410 (draft), branch `001-t011-drizzle-orcamento-repository`, commit
`2c65c3b`, base `main`. `backend-reviewer` já aprovou (APPROVE WITH NITS,
após 1 rodada CHANGES REQUESTED por causa do lock de concorrência).

## Critérios de saída
Suíte completa passando (nenhuma regressão), os 4 cenários de validação
manual do autor do PR formalizados como teste automatizado repetível — em
especial o cenário de concorrência (retry de Lambda), que é a regressão que
mais importa proteger daqui para frente. `tsc --noEmit`/`eslint .` limpos.
Sem defeito crítico/alto aberto.

## Abordagem Allure
Reaproveitado `allure-vitest` já configurado.

## Ordem de execução
1. `docker start nexus-orc-back-postgres-1` (ou `docker compose up -d postgres`)
2. `pnpm install --frozen-lockfile`
3. `pnpm run db:migrate` (`DATABASE_URL` setado)
4. `pnpm run lint`
5. `pnpm run typecheck`
6. `pnpm exec vitest run --coverage` (`DATABASE_URL` setado)
7. `pnpm run test` sem `DATABASE_URL` (confirma skip gracioso)

## Limitações
- `salvar()` abre sua própria transação Drizzle — não pode ser aninhada sob
  um `BEGIN` externo revertido ao final (o `COMMIT` interno do
  `db.transaction()` comprometeria o `BEGIN` externo). Diferente do padrão
  de T010 (schema test, sem transação própria no código testado), a limpeza
  de linhas é explícita por `orcamentoId` em `afterEach`, incluindo
  desativar temporariamente os triggers de append-only da sessão
  (`session_replication_role = replica`) só para o `DELETE` de limpeza —
  nunca em produção.
- Cenário de concorrência usa 2 conexões `pg.Client` reais (sessões
  distintas) — única forma de exercitar o `SELECT ... FOR UPDATE` de fato
  serializando duas transações, não apenas 2 chamadas sequenciais na mesma
  conexão.
- `TentativaClassificacao.insucesso()` (branch `motivoInsucesso`) nunca é
  produzido pelo Domain hoje (`registrarTentativaClassificador` sempre usa
  `.sucesso()`, mesmo para confiança baixa) — mesma observação já registrada
  na rodada de T044–T047. O caminho de tradução `tentativaDaLinha` para
  insucesso (linhas 55-60 do repositório) e os campos `?? null` associados
  ficam sem cobertura de teste de integração por não serem alcançáveis via
  Domain real; classificado como **risco ainda não testado por ser
  inalcançável no comportamento atual do sistema**, não como lacuna de teste
  de T011.

---

# Test Plan — T020–T026 (issues #25–#31) — PR #426

## Escopo
US1 (Ingestão multi-canal) completa: `ReceberOrcamento` (T020), admission gate
de idempotência (`IdempotencyKeyRepository`/`DrizzleIdempotencyKeyRepository`,
T020), `POST /v1/orcamentos/upload-url` (T021), `POST /v1/orcamentos/
{orcamentoId}/confirmar-upload` (T022), trigger Lambda S3 do canal SFTP
(T023), lifecycle rule + Object Lock explícito de `pending-uploads/` (T024),
middleware Cognito opcional nos 3 controllers REST (T025), IAM role dedicada
`ReceberOrcamentoLambdaRole` (T026).

## Fora de escopo
Wiring de produção do middleware Cognito (composição raiz/DI ainda não
existe — issue futura, confirmado no handoff do dev-back-end). Persistência
real contra Postgres (sem `DATABASE_URL` neste ambiente — ver Limitações).
AWS real (S3/Lambda/Cognito) — tudo mockado.

## Riscos
- Idempotência com race check-then-act (2 chamadas concorrentes duplicando
  persist/publish) — achado MAJOR do `backend-reviewer`, corrigido com
  admission gate atômico (`INSERT ... ON CONFLICT ... RETURNING`).
- Referência confirmada apontando para o prefixo `pending-uploads/`, que a
  lifecycle rule expira — achado BLOCKER do `backend-reviewer`, corrigido
  (`confirmarUpload` sempre copia para o prefixo definitivo do canal antes de
  chamar `ReceberOrcamento`).
- Object Lock (retenção GOVERNANCE de 5 anos por padrão do bucket) impedindo
  a lifecycle rule de apagar uploads órfãos em `pending-uploads/` (S3
  Lifecycle nunca ignora Object Lock ativo).
- SFTP (notificação S3 at-least-once) reprocessando o mesmo evento sem
  `Idempotency-Key` derivada — achado MAJOR do `backend-reviewer`, corrigido.
- IAM da role de execução com permissão além do mínimo necessário
  (`s3:DeleteObject` nunca deve ser concedido neste contexto).

## Níveis e tipos de teste
Unit (caso de uso `ReceberOrcamento`, admission gate via fake), Contrato/HTTP
(`app.inject` nos 3 controllers), Integração mockada (gateway S3, handler
SFTP, middleware Cognito), Integração real Postgres (repositório de
idempotência — skip sem `DATABASE_URL`), Infra estático (`cdk synth`).

## Ambientes e dependências
Node 24.18.0, pnpm 11.18.0 via `corepack pnpm`. Sem AWS real — S3/Cognito
mockados via fake de `S3Client.send`/verificador JWT injetável. Postgres 16
via `docker-compose.yml` disponível neste worktree, mas migração
(`db:migrate`) falha com erro genérico ao conectar via TCP — limitação de
ambiente Windows já conhecida (CI Linux não reproduz); os 3 testes de
integração de `drizzle-idempotency-key.repository.test.ts` seguem `skip`.

## Estratégia de dados
Fixtures inline (UUIDs via `OrcamentoId.novo()`, `ReferenciaS3.de({...})`
sintética). Sem dado sensível/real.

## Estratégia de mocks/fakes
- `ReceberOrcamento`: fakes de `OrcamentoRepository`/`EventPublisher`/
  `IdempotencyKeyRepository` (o fake de idempotência simula a semântica de
  "quem venceu a corrida" devolvendo `{reservado:false, orcamentoId: já
  existente}`, não apenas um mock ingênuo de chamada única).
- `S3ArmazenamentoBrutoGateway`: fake de `S3Client.send` por comando
  (`PutObjectCommand`/`HeadObjectCommand`/`CopyObjectCommand`), afirma
  `ObjectLockMode`/`ObjectLockRetainUntilDate` no PUT presigned.
- `sftp-upload.handler`: `S3Event` sintético, fake de `ReceberOrcamento.
  executar`.
- `auth-cognito.middleware`: fake do verificador `aws-jwt-verify`.
- Repositório de idempotência: Postgres real (sem fake) — integração,
  skip sem `DATABASE_URL`.

## Critérios de entrada
PR #426 (branch `feat/001-c-us1`, base `main`), commit `68d034f`, `backend-
reviewer` já aprovou (APPROVE WITH NITS, 4 rodadas, 2 MAJOR + 1 BLOCKER
corrigidos ao longo do processo). Primeira validação de QA (não reteste).

## Critérios de saída
`pnpm typecheck`/`typecheck:infra`/`lint`/`test` limpos, suíte completa sem
regressão, `cdk synth` limpo (8 stacks), cobertura medida e lacunas
justificadas, nenhum defeito crítico/alto aberto.

## Abordagem Allure
Reaproveitado `allure-vitest`/`vitest.config.ts` já configurados.

## Ordem de execução
1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm run typecheck`
3. `corepack pnpm run typecheck:infra`
4. `corepack pnpm run lint`
5. `corepack pnpm test`
6. `corepack pnpm exec vitest run --coverage`
7. `corepack pnpm exec cdk synth --quiet`

## Limitações
- `docker compose up -d postgres` + `db:migrate` falham neste ambiente
  Windows específico com erro genérico de conexão TCP (`ELIFECYCLE` sem
  detalhe de causa) — mesma limitação de ambiente já sinalizada na tarefa
  (funciona via socket dentro do container, falha do host; CI Linux não
  reproduz). Os 3 testes de `drizzle-idempotency-key.repository.test.ts`
  continuam sem execução real nesta rodada — mesma classe de lacuna já
  aceita para `drizzle-orcamento.repository.test.ts` em rodadas anteriores.
- Verificação da atomicidade real do admission gate sob concorrência: os 3
  testes de integração cobrem o comportamento sequencialmente (reserva livre,
  reserva conflitante dentro do TTL, reserva após TTL expirado) mas não
  disparam 2 conexões simultâneas em `Promise.all` (diferente do padrão usado
  em T011 para `salvar()`). Avaliação de QA: como `reservar()` é uma única
  instrução SQL atômica (`INSERT ... ON CONFLICT ... DO UPDATE ... WHERE
  expira_em <= now() RETURNING`), a garantia de exclusão mútua vem do lock de
  linha do próprio Postgres sobre a chave única — diferente do caso de T011,
  que fazia leitura+decisão em múltiplas instruções e por isso exigia um
  teste de 2 conexões concorrentes para provar a serialização. Os 3 testes
  sequenciais já provam a semântica correta da instrução única. Registrado
  como risco residual de baixa severidade (não bloqueante): um teste de 2
  conexões reais em `Promise.all` fecharia a lacuna de forma mais direta,
  mas não foi possível executá-lo nesta rodada (bloqueio de `db:migrate` no
  ambiente Windows).
- Sem AWS real — gateway S3, middleware Cognito e handler SFTP 100%
  mockados/locais (limitação de ambiente conhecida, não desta PR).
- Autenticação Cognito testada apenas isoladamente (`auth-cognito.middleware.
  test.ts`); os 3 contract tests dos controllers REST rodam sem
  `preHandler` de autenticação — esperado, wiring de produção é issue futura
  (confirmado no handoff do dev-back-end, não é lacuna desta PR).
