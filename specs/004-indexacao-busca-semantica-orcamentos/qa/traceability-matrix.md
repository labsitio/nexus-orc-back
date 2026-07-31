# Matriz de rastreabilidade — T012 (agregado IndiceOrcamento)

| Requisito / critério (tasks.md T012) | Cenário | Teste | Resultado |
|---|---|---|---|
| Estado inicial PENDENTE, sem embedding, sem histórico | criação via `criar` | `inicia em PENDENTE, sem embedding, sem histórico` | PASS |
| Transição p/ INDEXADO só com embedding na mesma tentativa | sucesso com embedding | `transita para INDEXADO quando embedding é fornecido na mesma tentativa` | PASS |
| Invariante crítica: nunca INDEXADO sem embedding | força INDEXADO sem embedding | `nunca transita para INDEXADO sem embedding — erro de domínio, sem mutar estado` | PASS |
| Falha técnica transita para FALHA_INDEXACAO | falha registrada | `transita para FALHA_INDEXACAO em falha técnica e preserva histórico` | PASS |
| Retry sem limite estrutural no Domain | 2 falhas + sucesso | `permite retry sem limite estrutural após FALHA_INDEXACAO, mantendo tentativas anteriores no histórico` | PASS |
| Histórico append-only, nunca sobrescrito | encadeamento de 3 tentativas | mesmo teste acima (ordem preservada) | PASS |
| Histórico exposto é cópia defensiva (leitura) | mutação do array retornado | `historico exposto é cópia defensiva — não permite mutar o array interno` | PASS |
| `OrigemValidacaoImutavelError` ao sobrescrever `conteudoIndexavel` | set fora do construtor | `rejeita sobrescrever conteudoIndexavel fora do construtor` | PASS |
| `OrigemValidacaoImutavelError` ao sobrescrever `origemValidacao` | set fora do construtor | `rejeita sobrescrever origemValidacao fora do construtor` | PASS |
| Getters expõem valores definidos no construtor | leitura direta | `expõe conteudoIndexavel e origemValidacao definidos no construtor` | PASS (adicionado pelo QA) |
| Reidratação (`reconstituir`) de estado persistido válido (INDEXADO) | reconstituir com embedding | `reconstitui agregado já indexado a partir de estado persistido` | PASS |
| Reidratação rejeita dado inconsistente (INDEXADO sem embedding) | reconstituir sem embedding | `rejeita reidratar estado INDEXADO sem embedding — dado persistido inconsistente` | PASS |
| Reidratação de FALHA_INDEXACAO com histórico prévio, sem exigir embedding | reconstituir com histórico | `reconstitui agregado em FALHA_INDEXACAO com histórico prévio, sem exigir embedding` | PASS (adicionado pelo QA) |
| Reidratação faz cópia defensiva do histórico recebido | mutação do array de origem pós-reconstituir | `reconstitui com cópia defensiva do histórico — array de origem não afeta o agregado` | PASS (adicionado pelo QA) |

Cobertura de branch/statement/function do arquivo `indice-orcamento.aggregate.ts`: 100% após os 3 testes adicionados pelo QA (baseline do dev-back-end: 93.75% stmts/lines, 84.61% funcs, 100% branch — lacuna nos getters `conteudoIndexavel`/`origemValidacao` e no caminho `reconstituir` com `FALHA_INDEXACAO`).

Fora do escopo desta task (cobertos por outras tasks/specs): `TentativaIndexacao.de` (VO, testado em `tentativa-indexacao.vo.test.ts`), persistência (T015/T016), eventos de domínio (T013), ACL (T018).
