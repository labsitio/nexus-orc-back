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
