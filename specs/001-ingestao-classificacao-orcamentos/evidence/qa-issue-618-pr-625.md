# QA — issue #618 (composition root) — PR #625

SPEC_ID: transversal (BC 001 `ingestao-identificacao` + encadeamento local 001→002 + BC 002 `extracao`)
PR: labsitio/nexus-orc-back#625
Branch: feat/618-composition-root
Commit testado: 6616e20
Tipo: primeira validação (não é reteste de bug aberto pelo QA); fecha issue #618 e valida BUG-001
(`specs/001-ingestao-classificacao-orcamentos/bugs/BUG-001.md`)

## Escopo

Restauração, como código versionado e revisado, de arquivos untracked recuperados de stash:
- `src/composition/ingestao-identificacao.ts`, `src/composition/extracao.ts` (composition roots de produção)
- `src/dev/config.ts`, `src/dev/local.ts`, `src/dev/seed-localstack.ts` (execução local, dev-only)
- `tests/composition/ingestao-identificacao.test.ts` (guarda das 4 rotas REST)
- `package.json`, `.env.example`, `pnpm-lock.yaml` (dependências/scripts/variáveis)

`backend-reviewer`: APPROVE WITH NITS (nit corrigido no commit `6616e20`).

## Comandos executados

```
source ~/.nvm/nvm.sh && nvm use 24
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm test
```

## Resultados

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK, lockfile consistente |
| `pnpm run typecheck` (tsc --noEmit) | OK, limpo |
| `pnpm run lint` (eslint .) | OK, limpo |
| `pnpm test` (vitest, baseline dev-back-end) | 907 passed, 2 expected fail (pré-existentes, não relacionados), 99 skipped — confere com o declarado na PR |
| `pnpm test` (após QA adicionar `tests/composition/extracao.test.ts`) | 908 passed, 2 expected fail, 99 skipped |

## Revisão do teste de composição existente

`tests/composition/ingestao-identificacao.test.ts` cobre adequadamente o critério de aceite
da issue #618 ("a composition root expõe as 4 rotas REST do BC Ingestão & Identificação"):
monta a app Fastify com `criarIngestaoIdentificacao` (stubs sem I/O) + `registrarRotasIngestaoIdentificacao`
e afirma `app.hasRoute` para as 4 rotas (`upload-url`, `confirmar-upload`, `status`, `revisao-humana`).
Guarda de regressão eficaz: rename ou remoção de qualquer rota quebra o teste antes de alguém
descobrir via `curl` no ambiente local.

## Gap de cobertura encontrado e corrigido pelo QA

`src/composition/extracao.ts` (`criarExtracao`) não tinha nenhum teste-guarda, ao contrário do
composition root de ingestão. Adicionado `tests/composition/extracao.test.ts` (teste único,
simétrico ao existente): instancia `criarExtracao` com stubs e afirma que `extrairDadosOrcamento`
é construído. Não altera código de produção; apenas fecha lacuna de guarda de wiring.

## Validação end-to-end do BUG-001 (evidência de fechamento exigida pelo próprio bug)

O `BUG-001.md` de 001 exigia, para fechamento: "itens 1 e 2 mergeados **e** evidência de PUT
HTTP 200 numa URL presigned gerada pelo código de produção contra bucket versionado real."
Itens 1/2 (doc-comment + guarda de regressão do checksum) já estavam em `main` desde o PR #610.
O que faltava era o ponto de construção do `S3Client` — via `src/dev/config.ts:69`
(`clientesLocais()`), consumido pela composition root de produção
(`criarIngestaoIdentificacao`) através de `src/dev/local.ts`. Reproduzido pelo QA:

```
docker compose up -d                  # postgres (porta 5433, ver nota abaixo) + localstack
pnpm run db:migrate
pnpm run dev:seed
pnpm run dev                          # servidor Fastify local, handlers de produção

curl -X POST localhost:3000/v1/orcamentos/upload-url \
  -d '{"canal":"API_REST","nomeArquivo":"orcamento.txt"}'
# uploadUrl NÃO contém x-amz-checksum-* (antes do fix: continha)

curl -X PUT --upload-file orcamento.txt "<uploadUrl>"
# HTTP 200 (antes do fix: 400)

curl -X POST localhost:3000/v1/orcamentos/<id>/confirmar-upload \
  -d '{"canal":"API_REST","nomeArquivo":"orcamento.txt"}'
# 200 {"orcamentoId":...} (antes do fix: 409 upload-nao-concluido)

curl localhost:3000/v1/orcamentos/<id>/status
# {"status":"CLASSIFICADO", ...}
```

Nota: `POSTGRES_PORT` alterada para `5433` apenas nesta execução local de validação (porta 5432
do host já ocupada por outro serviço da máquina) — não é alteração de produção nem do
`.env.example`, apenas de um `.env` local descartado ao final (`docker compose down`, `rm .env`).

Fluxo completo, sem mascaramento de erro. `BUG-001.md` atualizado para `VALIDADO` com este reteste.

## `.env.example` — segredos

Inspecionado: contém apenas placeholders do LocalStack (`test`/`test`), Postgres local
(`nexo`/`nexo`) e comentário explícito de não versionar credenciais reais do Aurora.
Nenhum segredo real.

## Cobertura de `src/dev/*` (dev-only)

`src/dev/local.ts` e `src/dev/seed-localstack.ts` são scripts de execução local, nunca
importados por código de produção (confirmado por `grep` de imports), exercitados manualmente
via `pnpm dev`/`pnpm dev:seed` — o teste de composição + a validação E2E acima cobrem o
caminho que importa (wiring real das dependências de produção). Não são testes unitários porque
são scripts de orquestração de I/O real (servidor + poller SQS), não lógica de negócio; escrever
um harness de teste dedicado só para eles seria sobre-engenharia para infraestrutura dev-only sem
consumidor de produção.

## Parecer

APROVADO PELO QA.
