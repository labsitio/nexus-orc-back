# Cobertura — T004 (spec-009)

Escopo desta rodada: apenas o arquivo entregue na task (`assinatura-estrutural.ts`).
Não há coverage-baseline.md prévio para spec-009 (primeira task validada pelo QA nesta spec).

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

Nota: a tabela de terminal do vitest (v8 reporter) trunca/omite a linha individual do
arquivo na visão em árvore quando há muitos arquivos na mesma pasta — confirmado via
`coverage/coverage-summary.json` que o arquivo está de fato instrumentado e 100% coberto.
Cobertura agregada do repo não é aplicável a este gate (fora do diff desta task).
