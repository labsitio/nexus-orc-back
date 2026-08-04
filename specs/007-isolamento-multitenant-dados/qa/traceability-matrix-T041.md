# Matriz de rastreabilidade — T041 (PR #632, commit f8f7468)

| Requisito / critério | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|
| `tenantId?: string` presente no envelope `DomainEventEnvelope` | Estrutural/contrato | interface com propriedade opcional | `src/bounded-contexts/validacao/domain/events/domain-event.ts` (linhas 21-28) | PASS |
| `tenantId?: string` no construtor de `OrcamentoValidado` | Estrutural/contrato | construtor com parâmetro opcional | `src/bounded-contexts/validacao/domain/events/orcamento-validado.event.ts` (linha 30) | PASS |
| `tenantId?: string` no construtor de `OrcamentoValidadoComRessalva` | Estrutural/contrato | construtor com parâmetro opcional | `src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.ts` (linha 34) | PASS |
| `tenantId?: string` no construtor de `OrcamentoInconsistenciaDetectada` | Estrutural/contrato | construtor com parâmetro opcional | `src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.ts` (linha 25) | PASS |
| Campo é opcional (expand/contract ADR-008), emissores não obrigados a preencher | Integração/padrão | `schemaVersion` mantido, sem breaking change em calls antigos | comentários do código, ausência de `@deprecated`, calls antigos funcionam | PASS |
| `schemaVersion: 1` de `OrcamentoInconsistenciaDetectada` mantido (não alteado) | Estrutural/contrato | value `1` fixo | `src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.ts` (linha 20) | PASS |
| `schemaVersion: 2` de `OrcamentoValidado` mantido (não alterado) | Estrutural/contrato | value `2` fixo | `src/bounded-contexts/validacao/domain/events/orcamento-validado.event.ts` (linha 19) | PASS |
| `schemaVersion: 2` de `OrcamentoValidadoComRessalva` mantido (não alterado) | Estrutural/contrato | value `2` fixo | `src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.ts` (linha 21) | PASS |
| Nenhuma quebra de compatibilidade com chamadas antigas | Integração/contrato | construtor calls sem `tenantId` continuam válidos | parâmetro optional (`?`) permite chamadas do tipo `new OrcamentoValidado(id, itens, condiçoes)` | PASS |
| Testes unitários do BC Validação (validacao) passam | Unit | suíte completa de 202 testes | `tests/bounded-contexts/validacao/**` | PASS (202/202) |
| Testes de contrato do BC Busca & Indexação (busca-indexacao) passam | Contrato/integração | suíte de consumidor downstream | `tests/bounded-contexts/busca-indexacao/**` | PASS (todos) |
| Testes de contrato do BC Orquestração (orquestracao) passam | Contrato/integração | suíte de consumidor downstream | `tests/bounded-contexts/orquestracao/**` | PASS (todos) |
| Total de testes do monorepo funciona com mudança (sem regressão) | Regressão geral | suíte completa  | todos os `tests/**` | PASS (544 testes totais conforme relatório) |
| Padrão segue expand/contract ADR-008 e precede PR atômica de cutover | Padrão/processo | `schemaVersion` não toca, cutover único em PR #632 cobrindo 4 BCs | comentário do código + commit message + referência a issue #632 | PASS |

## Observações e lacunas

1. **Cutover ainda não rodado**: Este QA valida a expansão (add field opcional) em isolamento. O cutover único (contract, tornar `tenantId` obrigatório) será rastreado em PR #632 quando todos os 4 BCs estiverem prontos.

2. **Emissores ainda não preenchem**: sites de emissão de `OrcamentoValidado`/`OrcamentoValidadoComRessalva`/`OrcamentoInconsistenciaDetectada` continuam não fornecendo `tenantId` nesta PR. Sem regressão de consumidores — a propriedade é opcional.

3. **RLS/isolamento em nível de dado não coberto aqui**: T041 é pura estrutura de evento. Isolamento de dados (filtering por `tenant_id` em Aurora) é responsabilidade de T014/T015/T016/T018 (em andamento em paralelo).

4. **Pattern replicado com sucesso**: mesma estratégia de expand/contract já aplicada com sucesso em T039 (001) e T040 (002).
