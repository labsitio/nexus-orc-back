# Cobertura — T004/T005 (spec-009)

Escopo desta rodada: apenas os arquivos entregues em cada task.
Não há coverage-baseline.md prévio para spec-009 (primeira task validada pelo QA nesta spec).

## T004 — assinatura-estrutural.ts

Comando:
```
npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.test.ts --coverage
```

Resultado (`coverage/coverage-summary.json`, chave do arquivo):

| Métrica | Total | Coberto | % |
|---|---|---|---|
| Statements | 7 | 7 | 100 |
| Branches | 2 | 2 | 100 |
| Functions | 4 | 4 | 100 |
| Lines | 7 | 7 | 100 |

## T005 — sinal-cache-identificacao.ts

Comando:
```
npx vitest run --coverage --coverage.reporter=json-summary tests/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.test.ts
```

Resultado (`coverage/coverage-summary.json`, chave do arquivo):

| Métrica | Total | Coberto | % |
|---|---|---|---|
| Statements | 7 | 7 | 100 |
| Branches | 2 | 2 | 100 |
| Functions | 3 | 3 | 100 |
| Lines | 7 | 7 | 100 |

Nota: a tabela de terminal do vitest (v8 reporter) trunca/omite a linha individual do
arquivo na visão em árvore quando há muitos arquivos na mesma pasta — confirmado via
`coverage/coverage-summary.json` que o arquivo está de fato instrumentado e 100% coberto
em ambas as tasks. Cobertura agregada do repo não é aplicável a este gate (fora do diff
destas tasks).
