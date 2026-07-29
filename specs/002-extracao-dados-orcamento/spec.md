---
feature: extracao-dados-orcamento
status: clarified
fase_roadmap: Fase 01
envolve_ia_ou_agentes: true
metricas:
  - nome: Percentual de itens extraídos corretamente sem necessidade de correção humana
    baseline: desconhecido (extração manual hoje)
    alvo: a definir após operação real; leading indicator monitorado desde o dia 1
  - nome: Tempo entre classificação disponível e dados estruturados extraídos disponíveis (p95)
    baseline: horas (processo manual)
    alvo: até 5 minutos (p95), consistente com a meta de velocidade da spec 001
personas: [gestor-de-compras, fornecedor, sistema-orquestrador]
depende_de: [ingestao-classificacao-orcamentos]
versao: 1
---

# Spec: Extração de Dados do Orçamento (Agente Extrator)

## Referência

- `docs/briefing-projeto.html` (Fase 01 · Fundação inclui "Agente de identificação de
  fornecedor/formato e extração"; `docs/apresentacao-executiva.html` roadmap: "Primeiros
  agentes de IA ativos: Classificador e Extrator").
- `docs/apresentacao-time.html` (Agente 2 · Extrator de Dados: entrada/saída, combinação
  Textract + LLM).
- Depende da spec 001 (`ingestao-classificacao-orcamentos`): só processa orçamentos já
  classificados com confiança suficiente (por Classificador ou Agente Revisor).

## Comportamento esperado (dado-quando-então)

### Extração bem-sucedida

- Dado um orçamento com fornecedor e formato identificados (evento de classificação com
  confiança ≥ 80%, conforme spec 001)
- Quando o Agente Extrator processa esse orçamento
- Então itens, SKU/descrição do produto, quantidade, preço unitário, condições de pagamento,
  prazo de validade da proposta e condições de entrega são extraídos e estruturados em um
  formato consistente, associado ao identificador único do orçamento
- E um evento de domínio "orçamento extraído" é publicado, sem necessidade de ação manual,
  quando todos os campos obrigatórios são extraídos com confiança suficiente

### Campo obrigatório ausente ou de baixa confiança

- Dado um orçamento em processamento de extração
- Quando um ou mais campos obrigatórios (ex.: preço unitário, quantidade) não podem ser
  extraídos com confiança suficiente
- Então o Extrator NUNCA preenche o campo com um valor inventado/estimado — o campo é marcado
  explicitamente como "não extraído" e o orçamento segue o mesmo padrão de exceção já
  estabelecido na spec 001 (linha automática de revisão + fila de escalonamento assíncrona
  como retaguarda humana), reaproveitando o mesmo mecanismo de governança, não um novo
- E esse estado fica visível na consulta de status do documento

### Preservação do vínculo com a classificação e o bruto

- Dado um orçamento já extraído
- Quando qualquer etapa futura do pipeline (validação, indexação) consulta esse orçamento
- Então o resultado da extração é uma nova representação vinculada ao orçamento bruto original
  e ao resultado da classificação — nenhum dos dois é sobrescrito ou substituído

## Critérios de aceite (testáveis)

- [ ] Um orçamento classificado com confiança suficiente tem, em até 5 minutos (p95), um
      resultado de extração disponível (sucesso ou marcação de campo(s) não extraído(s) via
      exceção).
- [ ] Nenhum campo obrigatório extraído é preenchido com valor inventado/estimado quando a
      confiança é insuficiente — o único comportamento aceitável é marcar como "não extraído"
      e acionar o fluxo de exceção da spec 001.
- [ ] O resultado de extração preserva vínculo rastreável com o orçamento bruto e com o
      resultado da classificação, sem sobrescrever nenhum dos dois.
- [ ] A consulta de status de um orçamento passa a refletir a etapa "extraído" (ou pendência
      de extração) após o processamento desta capacidade.

## Fora de escopo desta spec

- Validação de consistência de negócio sobre os dados extraídos (CNPJ, faixas de preço,
  coerência de prazos) — spec própria (Validador), Fase 02.
- Conversão de moeda estrangeira ou normalização de unidades de medida além do que o
  fornecedor já declarou — assumido fora de escopo até haver demanda real registrada.
- Extração de conteúdo manuscrito não suportado de forma confiável por OCR gerenciado — tratado
  como caso de baixa confiança (cai no fluxo de exceção), não como capacidade própria.
- Interface de correção manual dos campos não extraídos (isso é consumo do Portal do Gestor,
  spec própria).

## Camada de IA / Governança

- **Papel do Agente Extrator**: transforma o conteúdo do orçamento bruto (já classificado) em
  itens e condições comerciais estruturadas. NUNCA decide se o orçamento deve ser aprovado ou
  encaminhado (isso é do Orquestrador, spec própria). NUNCA altera o orçamento bruto ou o
  resultado da classificação.
- **Ação proibida em termos de negócio (crítica)**: nunca inventar ou estimar um valor de
  preço, quantidade ou condição comercial quando a extração real não tem confiança suficiente
  — dado comercial errado neste ponto tem risco financeiro direto para a decisão de compra.
  "Não extraído" é sempre preferível a um valor plausível porém incorreto.
- **Reaproveitamento de governança**: esta spec reaproveita, sem redefinir, o mecanismo de
  exceção já estabelecido na spec 001 (Agente Revisor + fila de escalonamento assíncrona) —
  decisão autônoma de consistência, já que a constituição (Princípio IV) já permite essa cadeia
  como implementação válida de humano-no-loop.
- **Dados sensíveis**: mesmas considerações de PII/dado comercial sensível da spec 001
  (Princípio VII da constituição).

## Métricas de Avaliação Contínua

- **Percentual de campos extraídos corretamente sem correção humana**: leading indicator
  monitorado desde o primeiro dia; sem meta rígida nesta spec.
- **Tempo até extração disponível (p95)**: sinal de alerta se sustentado acima de 5 minutos.
- **Taxa de campos marcados "não extraído"**: acompanhar tendência; alta taxa sustentada é
  gatilho de investigação de capacidade do Extrator, não necessariamente falha.
- **Responsável**: produto + dado/observabilidade da plataforma, mesmo modelo da spec 001.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: O tratamento de baixa confiança em campo extraído deve criar um novo mecanismo de
  exceção próprio desta spec? R: Não — reaproveita o mecanismo já estabelecido e aprovado na
  spec 001 (Agente Revisor + fila de escalonamento assíncrona), por consistência de produto e
  porque a constituição já permite essa cadeia como padrão válido. Decisão de baixo risco e
  reversível (é reuso de padrão, não invenção de novo).
