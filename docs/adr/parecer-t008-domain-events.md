# Parecer — T008 Domain Events (Ingestão & Identificação): 4 ou 5 eventos

Contexto

T008 tem duas versões em circulação: `tasks.md` (main) com 4 Domain Events; issue
GitHub `#13` com 5, incluindo `orcamento-baixa-confianca-detectada`. PR #394 (dev-back-end)
implementou os 4, seguindo `tasks.md`. Issue nunca foi atualizada após revisão do `tasks.md`.

Problema

O domínio precisa de dois fatos distintos — "confiança baixa detectada" e "escalonado para
revisão humana" — ou um único evento cobre a transição de negócio real?

Alternativas consideradas

- 4 eventos (estado atual do PR #394): confiança < 80% publica diretamente
  `orcamento-escalonado-revisao-humana`.
- 5 eventos (issue #13): publicar primeiro `orcamento-baixa-confianca-detectada`, depois
  `orcamento-escalonado-revisao-humana` como evento separado.

Evidência

`spec.md`, seção "Baixa confiança — escalonamento assíncrono para humano":
> Dado um orçamento cujo resultado de classificação tem confiança inferior a 80%
> Quando o Classificador conclui sua tentativa abaixo do limiar
> Então o orçamento é encaminhado **diretamente** para uma fila de escalonamento assíncrona

`spec.md`, critério de aceite:
> Todo orçamento recebido tem [...] exatamente um dos dois resultados possíveis: (a)
> [...] confiança ≥ 80%; ou (b) marcação explícita de pendência na fila de escalonamento
> assíncrona de revisão humana

`spec.md`, Camada de IA / Governança:
> Tentativa única, sem reprocessamento automático por IA: o Classificador tenta uma vez;
> não há um segundo agente de IA que reprocesse [...]. Baixa confiança vai direto para o
> humano.

`plan.md`, Domain Events:
> `OrcamentoEscalonadoParaRevisaoHumana` — publicado quando o Classificador fica < 80%.
> Consumido pelo Acompanhamento/consumidor externo [...]
> Nota: `OrcamentoClassificado` é o único evento que a Extração (002) precisa assinar.

Não há, em nenhum ponto de `spec.md` ou `plan.md`, um cenário, critério de aceite, VO ou
consumidor que trate "confiança baixa detectada" como fato observável separado de
"escalonado". A palavra "diretamente" aparece duas vezes na spec exatamente para descartar
um passo intermediário — resquício da v3 (Agente Revisor), removido na v5. `NivelConfianca`
e `ResultadoClassificacao` (VOs já implementados) carregam o dado de confiança dentro do
próprio evento de escalonamento; não há necessidade de um evento adicional só para expor
esse número.

Veredito

**4 eventos.** `orcamento-baixa-confianca-detectada` não deve existir. É resíduo de uma
versão anterior da spec (v3, com Agente Revisor de IA como destinatário de um evento
intermediário) que sobreviveu na issue porque a issue nunca foi regenerada após a revisão
do `tasks.md` na v5. Na v5 a transição é uma cadeia direta Classificador → fila humana; criar
dois eventos para uma única transição de estado (`RECEBIDO → PENDENTE_REVISAO_HUMANA`)
violaria a própria convenção do `plan.md` ("um evento por transição real de estado do
pipeline, nunca um evento genérico") e duplicaria dado sem consumidor.

Impacto em 002 e 005

Nenhum. Verificado `specs/002-extracao-dados-orcamento/tasks.md`: only consome
`detail-type: OrcamentoClassificado` (T004, T022) — nenhuma task assina
`orcamento-escalonado-revisao-humana` nem `orcamento-baixa-confianca-detectada`.
Verificado `specs/005-orquestracao-workflow-integracoes/tasks.md`: nenhuma ocorrência de
`orcamento-escalonado` ou `baixa-confianca`. `docs/plano-paralelismo-issues.md` confirma
isso explicitamente: "só o contrato de evento documentado (`OrcamentoClassificado`,
`schemaVersion: 1`, fixado já em `#13`/T008) importa para 002/005". Ausência do 5º evento
não é bug de contrato — não há contrato dependente dele.

Ação corretiva

Corrigir a issue `#13` no GitHub para refletir os 4 eventos do `tasks.md` atual (título e
corpo — remover `orcamento-baixa-confianca-detectada`, remover a frase duplicada sobre quem
publica `orcamento-escalonado-revisao-humana` se já coberta). Não editar `tasks.md` (já
correto). Não é necessário PR de follow-up de código — nada a implementar.

Reconciliação em lote

A causa raiz (issues geradas de uma versão anterior do `tasks.md`, nunca resincronizadas) é
estrutural, não pontual a T008. Sinais concretos de que não é caso isolado:

- A "Nota (versão 5)" do próprio `tasks.md` (linha 97) registra que a antiga Phase 5 inteira
  ("User Story 3 — Agente Revisor de IA", T037–T043) foi removida, mas os IDs foram mantidos
  estáveis "para preservar a rastreabilidade das issues do GitHub" — confissão explícita de
  que existem issues `#42`–`#48` (T037–T043) no GitHub referentes a uma user story que não
  existe mais no `tasks.md`. Essas issues devem ser fechadas como `wontfix`/obsoletas, não
  apenas editadas.
- Qualquer outra task que reference "Agente Revisor" ou reprocessamento automático por IA na
  issue correspondente (não vista nos arquivos lidos aqui, mas prevista pela mesma
  cronologia de v3→v5) é candidata a ter o mesmo desalinhamento.
- Recomendação: rodar uma varredura completa das 53 issues de 001 comparando título/corpo
  contra o `tasks.md` atual antes de declarar a Fundação (`#6`–`#14`,`#17`,`#18`, conforme
  `docs/plano-paralelismo-issues.md`) definitivamente fechada — não confiar apenas em T008.
  Esta varredura está fora do escopo deste parecer (não foi pedida diff issue-a-issue das 53).

Risco de não agir

Se o PR #394 for mergeado como está (4 eventos, sem `orcamento-baixa-confianca-detectada|),
nenhum risco técnico de contrato — nenhum consumidor real existe para o 5º evento. O único
risco é organizacional: se um revisor comparar o PR contra a issue `#13` desatualizada e
bloquear o merge por "divergência de escopo", ou se um agente futuro reabrir T008 para
"completar" o 5º evento a partir da issue, introduzindo trabalho morto e um evento sem
consumidor que viola a convenção de nomenclatura do `plan.md`.

Decisão

4 eventos. PR #394 pode ser mergeado como está quanto a T008 — nenhuma mudança de código
necessária.

Trade-offs

Nenhum — a alternativa (5 eventos) não teria trade-off positivo, apenas custo de manutenção
de um evento sem consumidor e violação da convenção "um evento por transição real".

Impactos futuros

Issues remanescentes de 001 (`#42`–`#48` e potenciais outras) devem ser auditadas contra o
`tasks.md` atual antes de qualquer gate de "Fundação completa" ser declarado fechado.
