---
feature: isolamento-multitenant-dados-orcamentos
status: clarified
fase_roadmap: Fase 03
envolve_ia_ou_agentes: false
metricas:
  - nome: Incidentes de vazamento de dado cross-tenant
    baseline: 0 (nenhum tenant real ainda em produção)
    alvo: 0, sempre — guardrail não-negociável
  - nome: Adoção do endpoint de exportação de auditoria por tenant
    baseline: recurso não existe hoje
    alvo: a definir após operação real; leading indicator
personas: [gestor-de-compras]
depende_de: [ingestao-classificacao-orcamentos]
versao: 2
---

# Spec: Isolamento Multi-tenant de Dados e Exportação de Auditoria (Backend)

## Nota de revisão (versão 2) — redução de escopo e renomeação

Esta spec era originalmente "Portal Web de Acompanhamento — Multi-tenant Completo" e misturava
comportamento de UI (tela, navegação, "gestor acessa o portal") com um requisito genuíno de
backend (isolamento de dado por tenant e exportação de auditoria). Após a decisão de escopo
exclusivamente backend (`.specify/memory/constitution.md` v1.2.0), esta spec foi **reduzida e
renomeada** para cobrir apenas o contrato de dado/API de isolamento multi-tenant e exportação
de auditoria — removido qualquer cenário de tela ou navegação. O diretório físico foi
renomeado para `specs/007-isolamento-multitenant-dados/` e o `feature` nos metadados reflete o
nome correto (`isolamento-multitenant-dados-orcamentos`).

## Referência

- `docs/briefing-projeto.html` (Fase 03 · Escala & Produto: "Portal Web de Acompanhamento
  multi-tenant, completo" — o requisito de isolamento de dado por tenant é a parte de backend
  dessa capacidade).
- `docs/briefing-projeto.html` (seção Benefícios: "Exportação de relatórios de auditoria
  exportáveis, prontos para compliance e revisão do processo de compras").
- `.specify/memory/constitution.md` v1.2.0 (Additional Constraints: escopo exclusivamente
  backend; Additional Constraint "Multi-tenant é requisito de Fase 03").

## Comportamento esperado (dado-quando-então)

### Isolamento de dado por tenant

- Dado múltiplas redes varejistas (tenants) usando a plataforma
- Quando qualquer consulta, busca ou exportação é executada via API em nome de um tenant
  específico
- Então o resultado nunca inclui dado de orçamento, fornecedor ou histórico pertencente a
  outro tenant — mesmo em caso de erro do sistema, o isolamento nunca é contornável por
  parâmetro de consulta ou falha de validação

### Exportação de relatório de auditoria via API

- Dado um conjunto de orçamentos já processados dentro de um tenant
- Quando uma solicitação de exportação de relatório é feita via API (filtrando por período,
  fornecedor, ou status)
- Então a API retorna um relatório exportável contendo o histórico de rastreabilidade
  necessário para auditoria/compliance (origem, canal, timestamps de cada etapa, decisões de
  cada agente), restrito aos dados do tenant solicitante

### Continuidade dos contratos de dado já existentes

- Dado que este isolamento se aplica a todas as capacidades já especificadas (specs 001–005)
- Quando qualquer uma dessas capacidades processa ou expõe dado de um orçamento
- Então o contexto de tenant do orçamento é preservado e respeitado em toda a cadeia, sem
  exigir mudança de comportamento das specs anteriores — apenas a adição da dimensão de tenant
  como parte do identificador/contexto de cada orçamento

## Critérios de aceite (testáveis)

- [ ] Nenhuma consulta, busca ou exportação via API retorna dado pertencente a um tenant
      diferente do solicitante, sob nenhuma condição testada, incluindo cenários de erro.
- [ ] Um relatório de auditoria exportado via API contém o histórico de rastreabilidade
      completo (origem, canal, timestamps por etapa, decisões de agentes) dos orçamentos
      filtrados, restrito ao tenant solicitante.
- [ ] Todo orçamento processado por qualquer capacidade das specs 001–005 mantém contexto de
      tenant consistente e consultável, sem exigir reprocessamento retroativo.

## Fora de escopo desta spec

- Qualquer interface visual (tela, navegação, dashboard) para o gestor consumir isolamento ou
  exportação — responsabilidade de um consumidor externo de frontend, fora do escopo deste
  time.
- Modelo de billing/cobrança por tenant — não mencionado na documentação macro como parte
  desta capacidade; assumido fora de escopo.
- Onboarding self-service de novo tenant sem intervenção operacional — não mencionado na
  documentação; assumido como processo operacional manual nesta fase.
- Papéis/permissões granulares dentro de um mesmo tenant (ex.: gestor vs. comprador com
  escopos de API diferentes) — a documentação não detalha essa diferenciação; se necessário, é
  spec futura própria.
- Formato específico do arquivo de exportação (PDF, CSV, JSON) — decisão de contrato de API a
  cargo do `arquiteto-back`, não uma decisão de comportamento de negócio desta spec.

## Métricas de Avaliação Contínua

- **Incidentes de vazamento cross-tenant**: guardrail crítico — qualquer ocorrência acima de
  zero é incidente de segurança grave, não apenas sinal de drift, e dispara revisão imediata.
- **Adoção do endpoint de exportação de auditoria**: acompanhar uso; ausência de uso pode
  indicar que o formato exportado não atende à necessidade real de auditoria.
- **Responsável**: produto + segurança/observabilidade da plataforma para o guardrail de
  isolamento; produto + gestor de compras para adoção de exportação.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: Esta spec deve continuar descrevendo comportamento de portal/tela? R: Não — reduzida ao
  contrato de dado/API de isolamento multi-tenant e exportação de auditoria, consistente com a
  Additional Constraint de escopo exclusivamente backend da constituição v1.2.0. Qualquer
  interface visual que consuma esse contrato é responsabilidade de um time/fornecedor externo
  de frontend.
- P: O diretório desta spec deveria ser renomeado para refletir o novo nome? R: Sim — renomeado
  para `specs/007-isolamento-multitenant-dados/`, com o `feature` nos metadados já corrigido
  para `isolamento-multitenant-dados-orcamentos`.
