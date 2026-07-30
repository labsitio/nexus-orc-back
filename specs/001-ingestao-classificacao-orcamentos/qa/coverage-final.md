# Coverage Final — T004/T006–T009

Comando: `pnpm exec vitest run --coverage` (vitest 4.1.10, `@vitest/coverage-v8`
4.1.10, escopo `src/**`).

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   92.91 |      100 |      84 |    92.8 |
 domain            |   81.81 |      100 |   68.75 |   81.81 |
  orcamento.aggregate.ts |   81.81 |      100 |   68.75 |   81.81 | 92-112
 .../value-objects |   95.45 |      100 |   89.65 |   95.31 |
  canal.vo.ts      |      75 |      100 |      60 |      75 | 32-36
  nivel-confianca.vo.ts |   85.71 |      100 |      80 |   85.71 | 30
-------------------|---------|----------|---------|---------|-------------------
Statements   : 92.91% ( 118/127 )
Branches     : 100% ( 38/38 )
Functions    : 84% ( 42/50 )
Lines        : 92.8% ( 116/125 )
```

## Análise das linhas não cobertas

Todas as linhas não cobertas são acessores triviais e métodos utilitários
sem decisão (nenhuma delas é invariante de validação):

- `orcamento.aggregate.ts:92-112` — `reconstituir()` (usado só pelo
  repositório, ainda não implementado, T011) e getters (`id`, `canal`,
  `recebidoEm`, `referenciaBruta`, `referenciaExterna`, `resultadoAtual`,
  `historico`). Classificação: **integração dependente de ambiente ainda não
  implementada** (repositório é T011) + **risco ainda não testado, mas
  trivial** (getters sem lógica).
- `canal.vo.ts:32-36` — `equals()`/`toString()`. Classificação: **risco
  ainda não testado, mas trivial** (comparação/serialização sem decisão de
  negócio).
- `nivel-confianca.vo.ts:30` — `equals()`. Mesma classificação.

**Branch coverage é 100%** — todos os 12 pontos de `throw new ErroDominio`
(as invariantes de validação exigidas pelo critério de aceite de T006) estão
cobertos por teste que força o valor inválido e espera o erro. O critério
literal de T006 ("100% cobertura de unit test das invariantes") está
satisfeito: a lacuna de statements/functions é em acessores, não em
invariantes.

## Threshold
Não havia threshold configurado (T003 ainda não existe). QA não configurou
threshold nesta task — decisão de piso mínimo de cobertura para CI é do
dev-back-end/arquiteto em T003, para não antecipar decisão fora do escopo de QA.
