# Matriz de Rastreabilidade — SPEC 002 (leva T001, T005-T011)

| Critério de aceite (spec.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Nenhum campo obrigatório é preenchido com valor inventado quando confiança insuficiente | Financeiro (crítico) | Unit | `CampoExtraido.naoExtraido` sempre produz `valor: null`; `extraido()` com `null` lança erro | `campo-extraido.vo.test.ts` (4 testes) | PASS |
| Campo obrigatório sem confiança escalona direto para revisão humana, nunca fica extraído parcial | Silencioso (crítico) | Unit | `registrarTentativaExtrator` com item incompleto → `PENDENTE_REVISAO_HUMANA`, nunca `EXTRAIDO` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Preservação de vínculo: `referenciaClassificacao`/`referenciaBrutaS3` nunca sobrescritos | Rastreabilidade | Unit | `atualizarReferenciaClassificacao`/`atualizarReferenciaBrutaS3` sempre lançam `ReferenciaImutavelError` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Confirmação humana só válida a partir de `PENDENTE_REVISAO_HUMANA`; histórico append-only | Governança | Unit | transição inválida lança erro; valor real → `EXTRAIDO`; indisponibilidade → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`; histórico cresce (nunca é resetado) | `extracao-orcamento.aggregate.test.ts` (3 testes) | PASS (ressalva BUG-001: getter `historico` não é cópia defensiva) |
| VOs nunca aceitam primitivo solto fora de invariante (Dinheiro, Quantidade, DescricaoProduto, PeriodoValidade, ItemOrcamento, CondicoesComerciais, ReferenciaClassificacao, ReferenciaS3, TentativaExtracao, OrcamentoId, NivelConfianca) | Integridade de domínio | Unit | construção válida + construção inválida por VO | 12 arquivos de teste de VO | PASS |
| 3 Domain Events com `schemaVersion: 1`, `source: nexo.extracao` | Contrato de evento | Unit | shape do evento | `domain-events.test.ts` (3 testes) | PASS |

## Fora desta leva (não rastreado ainda)
- "Consulta de status reflete a etapa extraído/pendência" — depende do
  endpoint de status (T024, T039), não existe ainda.
- "Conversão via MarkItDown por padrão" — depende do ACL de Infrastructure
  (T021), interface já definida (`markitdown-conversao-extracao.acl.ts`) mas
  sem implementação nesta leva.

## Leva T012 (issue #77, PR #423, commit `27409c6`)

| Critério de aceite (spec.md / plan.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Schema persiste estado atual do agregado (`itens`/`condicoesComerciais` em JSONB, ADR-004) | Persistência | Integração (Postgres real) | criação com `itens` default `[]`, `condicoesComerciais` opcional | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `status` e `referencia_classificacao_agente_origem` restritos ao enum de domínio | Integridade de dados | Integração (Postgres real) | INSERT com valor fora do enum → violação de CHECK | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `extracoes_orcamento_historico` é append-only (nunca sobrescrito) | Governança/auditoria | Integração (Postgres real) | UPDATE/DELETE em linha de histórico → `RAISE EXCEPTION` | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** — migração 0005 não aplica, coluna `id` não migrada para `bigserial`, INSERT falha antes do UPDATE/DELETE ser exercitado |
| `TentativaExtracao` é sucesso XOR insucesso, nunca ambos/nenhum | Integridade de domínio | Integração (Postgres real) | INSERT com ambos os campos e com nenhum → violação de CHECK | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** (mesma causa raiz) |
| Migração aplica sem erro em Postgres real a partir do baseline (pré-condição p/ CI e T013) | Deploy/CI | Integração (Postgres real) | `drizzle-kit migrate` a partir do estado pós-T002 | manual (`drizzle-kit migrate` + `psql` direto) | **FAIL** — `bugs/BUG-003.md`, CRÍTICA |
| `db:generate` sem diff pendente (schema TS ≡ migração commitada) | Consistência schema/migração | Estático | `npx drizzle-kit generate` | manual | PASS |

## Leva T015 (issue #80, PR #429, commit `3580e09`)

| Critério de aceite (tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `EventBridgePublisher` implementa `EventPublisher` (Domain), instância própria do BC Extração, mesmo bus `nexo-dominio-bus` | Contrato/integração | Unit (mock `EventBridgeClient`) | publica com `EventBusName`, `Source: nexo.extracao`, `DetailType` e `Detail` (JSON do envelope) corretos | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Falha reportada pelo EventBridge (`FailedEntryCount > 0`) vira erro descritivo, nunca falha silenciosa | Confiabilidade/observabilidade | Unit | `ErrorMessage` presente → mensagem inclui detailType, orcamentoId, bus e motivo | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Fallback de mensagem quando EventBridge não informa `ErrorMessage` | Confiabilidade | Unit | `Entries: [{}]` → erro com "motivo desconhecido" | `eventbridge.publisher.test.ts` (1 teste) | PASS |

Limitação: sem LocalStack neste worktree — sem teste de integração real contra
EventBridge (`PutEventsCommand` de verdade). Risco residual: comportamento real
do SDK AWS (retries, throttling) não exercitado; mitigado por ser mock fiel ao
shape de retorno documentado do SDK (`FailedEntryCount`/`Entries[].ErrorMessage`).
