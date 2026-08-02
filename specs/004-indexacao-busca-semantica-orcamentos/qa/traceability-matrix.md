# Matriz de rastreabilidade — T012/T012b (agregado IndiceOrcamento)

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
| (T012b, ADR-005) `tenantId` obrigatório na criação | `criar` sem `tenantId` | `rejeita criação sem tenantId — erro de domínio` | PASS |
| (T012b, ADR-005) `TenantIdImutavelError` ao sobrescrever `tenantId` pós-criação | set fora do construtor | `rejeita sobrescrever tenantId fora do construtor` | PASS |
| (T012b, ADR-005) getter expõe `tenantId` definido no construtor | leitura direta | `expõe tenantId definido no construtor` | PASS |

Cobertura de branch/statement/function do arquivo `indice-orcamento.aggregate.ts`: 100% após os 3 testes adicionados pelo QA em T012 (baseline do dev-back-end: 93.75% stmts/lines, 84.61% funcs, 100% branch — lacuna nos getters `conteudoIndexavel`/`origemValidacao` e no caminho `reconstituir` com `FALHA_INDEXACAO`); mantida em 100% (39/39 stmts, 8/8 branches) após o retrofit de T012b (3 novos testes cobrindo o novo campo `tenantId`, sem linha nova descoberta).

Fora do escopo desta task (cobertos por outras tasks/specs): `TentativaIndexacao.de` (VO, testado em `tentativa-indexacao.vo.test.ts`), persistência com `tenant_id`/RLS e `DrizzleTenantScopedRepositoryBase` (T015b/T016), ACL (T018), isolamento cross-tenant ponta a ponta (T027b).

## T013b (PR #533) — Domain Events `OrcamentoIndexado`/`FalhaIndexacaoDetectada`, `schemaVersion: 2` + `tenantId`

| Requisito / critério (tasks.md T013b, ADR-005 retrofit) | Cenário | Teste | Resultado |
|---|---|---|---|
| `schemaVersion` sobe para `2` em ambos os eventos | criação de cada evento | `schemaVersion 2, orcamentoId, tenantId e detailType "..." (ADR-005)` (describe.each) | PASS |
| `tenantId: string` obrigatório no envelope, propagado ao payload | criação de cada evento com `tenantId` | mesmo teste acima | PASS |
| `orcamentoId` e `detailType` preservados (contrato pré-existente, T013) | criação de cada evento | mesmo teste acima | PASS |
| `ocorreuEm` continua ISO-8601 válido | `new Date(evento.ocorreuEm)` | mesmo teste acima | PASS |
| `OrcamentoIndexado.modeloEmbedding` preservado (não afetado pelo retrofit) | criação com modelo de embedding | `carrega o modeloEmbedding usado na geração do vetor persistido` | PASS |
| `FalhaIndexacaoDetectada.motivoFalha`/`tentativaNumero` preservados | criação com motivo e tentativa | `carrega motivoFalha legível e o número da tentativa que falhou` | PASS |

Cobertura dos 3 arquivos alterados (`domain-event.ts`, `orcamento-indexado.event.ts`, `falha-indexacao-detectada.event.ts`), via `coverage-final.json`: 100% statements/branches/functions em ambos os `.event.ts` (8/8 e 7/7 stmts); `domain-event.ts` é somente `interface` (0 statement executável, nada a cobrir).

Nenhum consumidor de produção publica ou lê esses eventos ainda (`registrarTentativaIndexacao`/publicação fica para T029, ainda `[ ]`) — sem risco de quebra de contrato em código existente.
