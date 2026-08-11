# QA — issue #723 (ADR-013, sanitizar nomeArquivo) — PR #727

SPEC_ID: 001-ingestao-classificacao-orcamentos (BC `ingestao-identificacao`)
PR: labsitio/nexus-orc-back#727
Branch: fix/723-sanitizar-nome-arquivo-upload
Commit testado: 5e0e92d2ba0cf0342d836832f2bc74c2bddb7b05
Tipo: primeira validação (sem reteste anterior)
CI (GitHub Actions, workflow `ci`): SUCCESS

## Escopo

- `src/bounded-contexts/ingestao-identificacao/interface/http/upload-url.schema.ts` —
  novo `nomeArquivoSchema`: rejeita `/`, `\`, `..`, caractere de controle (0x00-0x1F, 0x7F)
  e nome acima de 255 caracteres.
- `src/bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.schema.ts` —
  passa a reusar `nomeArquivoSchema` em vez de `z.string().min(1)`.
- Teste novo (do próprio PR): `tests/bounded-contexts/ingestao-identificacao/interface/http/upload-url.schema.test.ts`
  (8 casos).
- `upload-url.controller.ts` / `confirmar-upload.controller.ts`: não alterados, já fazem
  `schema.safeParse(request.body)` → 400 `application/problem+json` em caso de falha.

## Comandos executados

```
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"
pnpm typecheck
pnpm lint
export DATABASE_URL="postgresql://nexo:nexo@localhost:5433/nexo"
npx vitest run --reporter=default
npx vitest run tests/bounded-contexts/ingestao-identificacao/contract/upload-url.controller.test.ts \
  tests/bounded-contexts/ingestao-identificacao/contract/confirmar-upload.controller.test.ts \
  tests/bounded-contexts/ingestao-identificacao/interface/http/upload-url.schema.test.ts
npx vitest run --coverage --coverage.reporter=json-summary --reporter=default <mesmos 3 arquivos>
```

Porta do Postgres confirmada via `docker ps` (`nexus-orc-back-postgres-1` → `0.0.0.0:5433->5432/tcp`);
já batia com o `DATABASE_URL` do `.env` local, sem ajuste necessário.

## Resultados

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK, limpo |
| `pnpm lint` | OK, limpo |
| `npx vitest run` (suíte completa, execução 1) | 213 arquivos / 1344 testes, 0 falha |
| `npx vitest run` (execução 2) | 1 arquivo falhou: `tests/security/isolamento-multitenant/busca-indexacao.test.ts` |
| `npx vitest run` (execução 3) | 213 arquivos / 1344 testes, 0 falha |
| `npx vitest run tests/security/isolamento-multitenant/busca-indexacao.test.ts` (isolado) | 4/4 passou |
| Contract tests `upload-url.controller.test.ts` + `confirmar-upload.controller.test.ts` + `upload-url.schema.test.ts` | 17/17 passou |

Total de 1344 testes por execução bate com o declarado pelo dev-back-end (212→213 arquivos,
1336→1344 testes, +8 do teste novo do PR).

### Flakiness pré-existente, não relacionada ao PR

Na execução 2 de 3 da suíte completa, `tests/security/isolamento-multitenant/busca-indexacao.test.ts`
falhou sob carga plena (concorrência de pool de conexão Postgres no vitest paralelo) e passou
isolado e nas outras 2 execuções completas. Esse arquivo não foi tocado pelo PR (schema Zod puro,
sem I/O de banco) e não está na lista de arquivos alterados. Classificado como **problema de
ambiente pré-existente** (flakiness de suíte sob paralelismo total), não como defeito de produção
introduzido por este PR. Não bloqueia o gate.

## Cobertura dos arquivos alterados (json-summary, isolado nos 3 arquivos de teste do escopo)

| Arquivo | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `upload-url.schema.ts` | 100% (9/9) | 100% (0/0 — sem branch, só `.refine`) | 100% (3/3) | 100% (9/9) |
| `confirmar-upload.schema.ts` | 100% (3/3) | 100% | 100% | 100% |

## Verificação dos 8 cenários do teste novo

Confirmados por leitura + execução: rejeita `/`, rejeita `\`, rejeita `..`, rejeita caractere de
controle (0x07), rejeita 256 caracteres, rejeita string vazia, aceita nome com acento/espaço/
parêntese/hífen (`Orçamento Fornecedor (São José) - v2.pdf`), aceita exatamente 255 caracteres.
Nenhum falso positivo encontrado contra nome de fornecedor legítimo.

## Gap observado (não bloqueante)

`upload-url.controller.test.ts` e `confirmar-upload.controller.test.ts` (contract tests, não
alterados por este PR) cobrem rejeição HTTP 400 apenas para `nomeArquivo` vazio, canal `SFTP` e
`orcamentoId` malformado — não há caso HTTP end-to-end para `nomeArquivo` com `/`/`..`/caractere
de controle. Risco residual baixo: o controller usa o mesmo `safeParse(schema)` inalterado, e o
schema em si tem cobertura unitária 100% dos 4 tipos de rejeição. Registrado como lacuna de
cobertura estrutural, não como defeito — não há requisito de teste de contrato duplicado quando
o unitário já prova a regra e o wiring do controller é preexistente e já teve seu próprio
contract test de rejeição validado (caminho 400/problem+json exercitado).

## Segredos

Nenhuma credencial, token ou dado pessoal em teste, fixture ou log gerado durante a validação.

## Parecer

APROVADO PELO QA.
