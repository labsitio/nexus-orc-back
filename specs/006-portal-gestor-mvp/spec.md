---
feature: portal-gestor-mvp
status: clarified
fase_roadmap: Fase 02
envolve_ia_ou_agentes: false
metricas:
  - nome: Tempo entre uma etapa do pipeline concluir e o status refletir no portal (percebido pelo gestor)
    baseline: não existe portal hoje
    alvo: tempo real / percepção de "quase imediato" (segundos, não minutos)
  - nome: Percentual de orçamentos pendentes de revisão resolvidos via portal dentro de um prazo aceitável
    baseline: desconhecido
    alvo: a definir após operação real; leading indicator
personas: [gestor-de-compras]
depende_de: [ingestao-classificacao-orcamentos]
versao: 1
---

# Spec: Portal Web de Acompanhamento — MVP (Painel do Gestor)

## Referência

- `docs/briefing-projeto.html` (Fase 02 · Inteligência: "Portal Web de Acompanhamento (MVP)
  para o gestor"; seção "Portal Web de Acompanhamento (Painel do Gestor)": rastreio ponta a
  ponta, status em tempo real e alertas, busca e filtros, exportação de relatórios).
- `docs/apresentacao-time.html` (componente "Portal Web de Acompanhamento": canal de entrada,
  timestamp de cada etapa, status atual, alertas de erro/pendência, busca e filtros por
  período/tipo/remetente).

## Comportamento esperado (dado-quando-então)

### Visão geral de orçamentos

- Dado um gestor de compras autenticado
- Quando ele acessa o portal
- Então visualiza uma lista de orçamentos recebidos, com status atual de cada um (recebido,
  classificado, extraído, validado, indexado, pendente de revisão, disponível) e o canal de
  origem

### Detalhe e linha do tempo de um orçamento

- Dado um orçamento específico
- Quando o gestor abre seu detalhe
- Então visualiza a linha do tempo completa de processamento (timestamp de cada etapa já
  concluída) e, quando aplicável, qual agente automático ou qual pessoa produziu cada
  resultado

### Alerta de pendência

- Dado um orçamento que caiu em exceção ou fila de escalonamento assíncrona (specs 001–005)
- Quando esse estado ocorre
- Então o gestor recebe um alerta visível no portal, sem precisar procurar ativamente por ele

### Resolução de item pendente

- Dado um orçamento na fila de escalonamento assíncrona de revisão humana
- Quando o gestor revisa e confirma explicitamente a informação correta
- Então essa confirmação é a mesma ação humana explícita já descrita nas specs de exceção
  (001–003) — o portal é o canal pelo qual essa confirmação é registrada nesta fase, não um
  mecanismo de decisão adicional

### Busca e filtros

- Dado um conjunto de orçamentos já recebidos
- Quando o gestor filtra por período, fornecedor ou faixa de preço (quando o dado já estiver
  disponível na etapa de processamento em que o orçamento se encontra)
- Então a lista exibida reflete apenas os orçamentos que atendem aos filtros aplicados

## Critérios de aceite (testáveis)

- [ ] Um gestor autenticado visualiza todos os orçamentos recebidos, com status atual
      correspondente ao estado real de processamento em cada momento.
- [ ] O detalhe de um orçamento exibe a linha do tempo completa de etapas já concluídas, sem
      lacuna em relação ao histórico registrado pelas specs 001–005.
- [ ] Um orçamento em exceção ou fila de escalonamento gera alerta visível no portal sem ação
      de busca ativa do gestor.
- [ ] A confirmação de um item pendente feita pelo gestor no portal é registrada como a mesma
      ação humana explícita exigida pelas specs de exceção — nunca uma decisão paralela sem
      rastro.
- [ ] Filtros por período, fornecedor e faixa de preço retornam resultados consistentes com os
      dados já disponíveis para cada orçamento.

## Fora de escopo desta spec

- Exportação de relatórios de auditoria/compliance — tratada na spec 007 (Portal multi-tenant
  completo), por estar associada a requisitos de conformidade mais amplos.
- Multi-tenancy (isolamento por rede varejista) — spec 007.
- Busca semântica em linguagem natural dentro do portal — consumo futuro da spec 004; o MVP
  cobre apenas filtros estruturados (período, fornecedor, faixa de preço).
- Papéis/permissões diferenciados dentro do portal (ex.: gestor vs. comprador) — assumido como
  usuário único "gestor de compras" nesta fase; diferenciação de papel é spec 007.
- Ação de decisão de compra (aprovar/rejeitar orçamento) — isso é responsabilidade do
  Orquestrador (spec 005) e do fluxo de comprador, não deste portal de acompanhamento.

## Métricas de Avaliação Contínua

- **Percepção de tempo real**: tempo entre uma etapa do pipeline concluir e refletir no portal
  deve ser da ordem de segundos, não minutos — sinal de alerta se sustentadamente maior.
- **Taxa de resolução de itens pendentes via portal**: acompanhar quantos itens da fila de
  escalonamento são resolvidos através do portal versus outros meios; leading indicator de
  adoção.
- **Responsável**: produto (gerente de produto) em conjunto com o gestor de compras
  (feedback direto) e dado/observabilidade da plataforma.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: O MVP do portal deve incluir a ação de confirmar itens da fila de escalonamento, ou
  apenas visualização passiva? R: Deve incluir a ação de confirmação — sem nenhum canal de
  ação, os itens escalonados (specs 001–003) nunca seriam resolvidos, o que contradiria o
  Princípio IV da constituição (exceção nunca é silenciosa/nunca travada). Decisão de baixo
  risco: é a interpretação mínima necessária para que o restante do sistema já especificado
  funcione de ponta a ponta.
- P: Exportação de relatórios de auditoria entra no MVP? R: Não — o briefing associa
  exportação de relatórios a conformidade/auditoria de forma mais ampla, tratada junto do
  portal completo multi-tenant (spec 007), mantendo o MVP no menor escopo que resolve o
  problema de acompanhamento básico.
