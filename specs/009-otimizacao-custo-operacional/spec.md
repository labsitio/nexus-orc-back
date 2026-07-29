---
feature: otimizacao-custo-operacional
status: clarified
fase_roadmap: Fase 03
envolve_ia_ou_agentes: false
metricas:
  - nome: Custo médio por orçamento processado
    baseline: a medir a partir da operação real das specs 001-005
    alvo: tendência de queda contínua após ativação das alavancas desta spec
  - nome: Percentual de reaproveitamento de classificação via cache para fornecedores recorrentes
    baseline: 0% (capacidade nova)
    alvo: a definir após operação real; leading indicator
personas: [gestor-de-compras]
depende_de: [ingestao-classificacao-orcamentos]
versao: 1
---

# Spec: Otimização Contínua de Custo Operacional

## Referência

- `docs/briefing-projeto.html` (Fase 03 · Escala & Produto: "Otimização contínua de custo";
  seção Custos Estimados: alavancas de "cache de identificação", "lifecycle de arquivamento
  frio" e "lote de baixa prioridade").

## Comportamento esperado (dado-quando-então)

### Reaproveitamento de identificação (cache)

- Dado um fornecedor cujo formato/layout já foi identificado com sucesso em orçamentos
  anteriores
- Quando um novo orçamento do mesmo fornecedor, no mesmo formato, é recebido
- Então o sistema pode reaproveitar a identificação já processada como sinal de alta
  confiança, reduzindo a necessidade de reprocessamento completo pelo Classificador — sem
  nunca pular a etapa de classificação por completo (o evento de classificação continua sendo
  publicado, apenas com custo de processamento reduzido)

### Arquivamento automático por lifecycle

- Dado um orçamento cujo período de retenção "ativa" (acesso frequente esperado) expirou
- Quando esse prazo é atingido
- Então o dado bruto e processado migra automaticamente para uma camada de armazenamento de
  custo mais baixo, sem intervenção manual e sem perda de rastreabilidade — o orçamento
  arquivado continua consultável (ainda que com latência de acesso maior), nunca é excluído
  por essa transição

### Processamento em lote de baixa prioridade

- Dado cargas de orçamentos que não exigem a meta de tempo padrão (ex.: reprocessamento em
  massa após correção de um problema histórico, não um orçamento novo do fluxo principal)
- Quando essas cargas são identificadas como de baixa prioridade
- Então elas podem ser processadas em lote, fora do caminho crítico de tempo real, sem
  competir por capacidade com o fluxo principal de orçamentos novos

## Critérios de aceite (testáveis)

- [ ] Um orçamento de fornecedor/formato já conhecido gera um evento de classificação
      igualmente válido e rastreável, com custo de processamento reduzido em relação a um
      fornecedor desconhecido — sem nunca pular a publicação do evento de classificação.
- [ ] Um orçamento cujo período de retenção ativa expira migra automaticamente para
      armazenamento de custo mais baixo, permanecendo consultável e sem impacto no histórico de
      rastreabilidade.
- [ ] Cargas marcadas como baixa prioridade nunca competem pelo tempo de resposta da meta
      padrão (p95 de 5 minutos) definida para o fluxo principal das specs 001–005.
- [ ] Nenhuma alavanca de otimização de custo desta spec reduz a rastreabilidade (Princípio I)
      ou a imutabilidade do dado bruto (Princípio III) já garantidas pelas specs anteriores.

## Fora de escopo desta spec

- Valor numérico exato do período de retenção ativa antes do arquivamento — documentação macro
  não define esse número; tratado como parâmetro configurável (ver Assunções).
- Critério exato de classificação de uma carga como "baixa prioridade" — tratado como decisão
  operacional configurável, não uma regra fixa de produto nesta spec.
- Negociação de custo/contrato com a AWS ou qualquer fornecedor de infraestrutura — fora do
  escopo de comportamento de produto.

## Métricas de Avaliação Contínua

- **Custo médio por orçamento processado**: tendência de queda esperada após ativação das
  alavancas; aumento sustentado é gatilho de investigação.
- **Percentual de reaproveitamento de classificação via cache**: leading indicator de eficácia
  da alavanca de cache.
- **Responsável**: produto + dado/observabilidade da plataforma (métrica de custo
  provavelmente cruzada com dado de billing de infraestrutura, fora do escopo desta spec
  decidir a ferramenta).

## Perguntas resolvidas / Assunções (decisão autônoma, não-bloqueante)

- P: Qual o período de retenção ativa antes do arquivamento frio? R: Assumido como parâmetro
  configurável, sem valor fixo definido nesta spec, na ausência de definição na documentação
  macro. Decisão de baixo risco e reversível — é parâmetro de custo, não decisão estrutural
  irreversível ou que tensione algum princípio da constituição.
- P: O cache de identificação pode pular a etapa de classificação inteiramente para
  fornecedores conhecidos? R: Não — decisão autônoma de manter a publicação do evento de
  classificação sempre, mesmo com custo reduzido, para preservar a garantia de rastreabilidade
  ponta a ponta (Princípio I) e a auditabilidade de cada etapa — pular a etapa tensionaria
  esse princípio, por isso não foi assumido.
