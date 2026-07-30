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
- "Resultado de extração disponível em até 5 minutos (p95)" — depende de
  Infrastructure/Application (T012+), não testável nesta leva.
- "Consulta de status reflete a etapa extraído/pendência" — depende do
  endpoint de status (T024, T039), não existe ainda.
- "Conversão via MarkItDown por padrão" — depende do ACL de Infrastructure
  (T021), interface já definida (`markitdown-conversao-extracao.acl.ts`) mas
  sem implementação nesta leva.
