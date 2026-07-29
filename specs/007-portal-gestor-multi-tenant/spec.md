---
feature: portal-gestor-multi-tenant
status: clarified
fase_roadmap: Fase 03
envolve_ia_ou_agentes: false
metricas:
  - nome: Incidentes de vazamento de dado cross-tenant
    baseline: 0 (nenhum tenant real ainda em produção)
    alvo: 0, sempre — guardrail não-negociável
  - nome: Adoção de exportação de relatórios de auditoria pelo gestor
    baseline: recurso não existe hoje
    alvo: a definir após operação real; leading indicator
personas: [gestor-de-compras]
depende_de: [portal-gestor-mvp]
versao: 1
---

# Spec: Portal Web de Acompanhamento — Multi-tenant Completo

## Referência

- `docs/briefing-projeto.html` (Fase 03 · Escala & Produto: "Portal Web de Acompanhamento
  multi-tenant, completo").
- `docs/briefing-projeto.html` (seção Benefícios: "Exportação de relatórios de auditoria
  exportáveis, prontos para compliance e revisão do processo de compras").

## Comportamento esperado (dado-quando-então)

### Isolamento por tenant

- Dado múltiplas redes varejistas (tenants) usando a plataforma
- Quando um gestor de uma rede varejista acessa o portal
- Então ele nunca visualiza dado de orçamento, fornecedor ou histórico pertencente a outro
  tenant, em nenhuma tela, filtro, busca ou exportação — mesmo em caso de erro do sistema, o
  isolamento nunca é contornável pela interface

### Exportação de relatórios de auditoria

- Dado um conjunto de orçamentos já processados dentro do tenant do gestor
- Quando ele solicita exportação de um relatório (por período, fornecedor, ou status)
- Então recebe um relatório exportável contendo o histórico de rastreabilidade necessário para
  auditoria/compliance (origem, canal, timestamps de cada etapa, decisões de cada agente),
  restrito aos dados do seu próprio tenant

### Continuidade das capacidades do MVP

- Dado que este portal evolui a partir do MVP (spec 006)
- Quando o gestor usa as capacidades já existentes (lista, detalhe, alertas, filtros,
  confirmação de pendências)
- Então elas continuam funcionando de forma idêntica, agora dentro do contexto do tenant do
  gestor — nenhuma capacidade do MVP é removida ou degradada nesta evolução

## Critérios de aceite (testáveis)

- [ ] Nenhum gestor de um tenant consegue visualizar, buscar ou exportar dado pertencente a
      outro tenant, sob nenhuma condição testada.
- [ ] Um relatório de auditoria exportado contém o histórico de rastreabilidade completo
      (origem, canal, timestamps por etapa, decisões de agentes) dos orçamentos filtrados,
      restrito ao tenant do gestor.
- [ ] Todas as capacidades da spec 006 (MVP) continuam disponíveis e funcionalmente
      equivalentes após esta evolução.

## Fora de escopo desta spec

- Modelo de billing/cobrança por tenant — não mencionado na documentação macro como parte do
  portal; assumido fora de escopo.
- Onboarding self-service de novo tenant sem intervenção operacional — não mencionado na
  documentação; assumido como processo operacional manual nesta fase.
- Papéis/permissões granulares dentro de um mesmo tenant (ex.: gestor vs. comprador com
  visões diferentes) — a documentação não detalha essa diferenciação; se necessário, é spec
  futura própria.

## Métricas de Avaliação Contínua

- **Incidentes de vazamento cross-tenant**: guardrail crítico — qualquer ocorrência acima de
  zero é incidente de segurança grave, não apenas sinal de drift, e dispara revisão imediata.
- **Adoção da exportação de relatórios**: acompanhar uso; ausência de uso pode indicar que o
  formato exportado não atende à necessidade real de auditoria do gestor.
- **Responsável**: produto + segurança/observabilidade da plataforma para o guardrail de
  isolamento; produto + gestor de compras para adoção de exportação.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: Este portal substitui o MVP (spec 006) ou é aditivo? R: É evolução aditiva — todas as
  capacidades do MVP permanecem, com isolamento por tenant e exportação de relatórios
  adicionados. Decisão de baixo risco e consistente com a forma como o próprio briefing
  descreve o roadmap (MVP em Fase 02, "completo" em Fase 03, não uma reconstrução).
