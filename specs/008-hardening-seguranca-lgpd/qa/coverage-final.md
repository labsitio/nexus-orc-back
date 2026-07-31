# Coverage Final

Idêntico ao baseline (`coverage-baseline.md`) — nenhum código executável
novo. `platform.schema.ts` é 100% declarativo (definição de tabela Drizzle),
não elegível a cobertura de branch/statement de forma significativa.

Nenhuma lacuna nova de cobertura introduzida por este PR.

## T005 — final (commit `4db548f`)

`politica-retencao.vo.ts`: 9 testes exercitam caminho válido, os 3 ramos de
erro (`prazoEmDias <= 0` incluindo não-inteiro, `baseLegal` vazia/whitespace,
`atualizadaEm` inválida) e `equals`. Todo statement/branch do arquivo é
alcançado por pelo menos um teste (confirmado por leitura de código, já que a
tabela text do reporter v8 omite a linha individual do arquivo — ver
`test-execution-report.md`). Nenhuma lacuna de cobertura conhecida para este
VO. Sem regressão na cobertura de `categoria-documento.vo.ts` (T004,
inalterado neste PR).

## T006 — final (commit `dcb1190`)

`dado-anonimizado.vo.ts`: 10 testes exercitam caminho válido (2 métodos),
irreversibilidade (chaves públicas restritas), os 4 ramos de erro
(`campoOriginal`, `metodo`, `aplicadoEm`, `solicitacaoId`) e `equals`. Todo
statement/branch do arquivo é alcançado por pelo menos um teste (confirmado
por leitura de código — a tabela text do reporter v8 segue omitindo a linha
individual do arquivo, mesma limitação já registrada em T005). Diretório
`shared-value-objects/domain` agregado: 97.61% stmts / 100% branch / 94.44%
funcs. Nenhuma lacuna de cobertura conhecida para este VO. Sem regressão na
cobertura de `categoria-documento.vo.ts`/`politica-retencao.vo.ts` (inalterados
neste PR).
