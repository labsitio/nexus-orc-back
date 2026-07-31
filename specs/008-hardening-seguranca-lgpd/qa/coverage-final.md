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

## T007 — final (commit `47c19bc`)

`referencia-titular.vo.ts`: 9/9 statements cobertos (100%), confirmado via
`coverage-final.json` (v8, `--coverage.reporter=json`) filtrado pelo caminho
do arquivo — a tabela texto do reporter v8 continua omitindo a linha
individual do arquivo (mesma limitacao de ferramental registrada em T005/T006).
Os 7 testes exercitam: caminho valido, normalizacao (lowercase + trim), os 2
ramos de erro (vazio/whitespace e acima de 320 chars) e o limite exato de 320
chars, alem de `equals`. Nenhuma lacuna de cobertura conhecida para este VO.

Novo arquivo `conformidade/domain/errors/erro-dominio.ts`: classe abstrata
sem logica alem do construtor, exercitada indiretamente via subclasse
`ReferenciaTitularInvalidaError` nos testes de rejeicao. Sem regressao em
VOs de outros modulos (inalterados neste PR).
