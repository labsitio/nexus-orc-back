---
feature: validacao-consistencia-orcamentos
status: clarified
fase_roadmap: Fase 02
envolve_ia_ou_agentes: true
metricas:
  - nome: Percentual de orçamentos validados automaticamente sem intervenção humana
    baseline: 0% (não existe validação estruturada hoje)
    alvo: a definir após operação real; leading indicator
  - nome: Tempo entre extração disponível e resultado de validação disponível (p95)
    baseline: horas (revisão manual hoje)
    alvo: até 5 minutos (p95)
personas: [gestor-de-compras, comprador-responsavel, sistema-orquestrador]
depende_de: [extracao-dados-orcamento]
versao: 1
---

# Spec: Validação de Consistência de Orçamentos (Agente Validador)

## Referência

- `docs/briefing-projeto.html` (Fase 02 · Inteligência: "Agente de validação de consistência").
- `docs/apresentacao-time.html` (Agente 3 · Validador de Consistência: CNPJ do fornecedor
  válido e batendo com o cadastro, campos obrigatórios preenchidos, preços dentro de faixas
  esperadas, prazo de validade coerente).

## Comportamento esperado (dado-quando-então)

### Validação bem-sucedida

- Dado um orçamento com dados extraídos (evento "orçamento extraído" da spec 002)
- Quando o Agente Validador aplica as regras de consistência de negócio (CNPJ do fornecedor
  válido e compatível com o cadastro conhecido, campos obrigatórios preenchidos, preços dentro
  de faixa esperada para a categoria do item, prazo de validade da proposta coerente com a
  data de emissão)
- Então o orçamento é marcado como "validado" e um evento de domínio correspondente é
  publicado, sem necessidade de ação manual quando não há inconsistência

### Inconsistência detectada

- Dado um orçamento em processamento de validação
- Quando uma ou mais regras de consistência falham (ex.: CNPJ inválido, campo obrigatório
  ausente, preço fora da faixa esperada, prazo de validade incoerente)
- Então um evento de exceção explícito é publicado com a lista de inconsistências
  encontradas, e o orçamento nunca avança como "validado" sem que a inconsistência seja
  resolvida — o mecanismo de resolução (revisão humana direta ou camada adicional de
  IA revisora) segue o Princípio IV da constituição, sem exigir um novo padrão específico
  desta spec
- E esse estado de pendência fica visível na consulta de status do documento, sem bloquear o
  processamento de outros orçamentos

### Faixas de preço configuráveis por categoria

- Dado que preços esperados variam por categoria de produto
- Quando o Validador avalia se um preço está "dentro da faixa esperada"
- Então essa faixa é tratada como parâmetro configurável por categoria, não como valor fixo
  hardcoded — nenhuma faixa numérica específica é definida nesta spec (fica para configuração
  operacional, ajustável sem mudança de comportamento de produto)

## Critérios de aceite (testáveis)

- [ ] Um orçamento extraído sem nenhuma inconsistência de negócio é marcado "validado" em até
      5 minutos (p95), sem ação manual.
- [ ] Um orçamento com qualquer inconsistência de negócio nunca é marcado "validado" — o
      único caminho para chegar a "validado" depois de uma inconsistência é resolução
      explícita (humana ou por camada de revisão), nunca por tempo de espera ou reprocessamento
      silencioso automático da mesma regra.
- [ ] A lista de inconsistências detectadas identifica especificamente qual regra falhou para
      cada item (não apenas uma marcação genérica de "inconsistente"), o suficiente para
      orientar a correção.
- [ ] Faixas de preço esperadas são parametrizáveis por categoria de produto sem exigir nova
      spec ou mudança de comportamento de produto.
- [ ] A consulta de status de um orçamento reflete "validado" ou "pendente de validação
      (inconsistência)" após o processamento desta capacidade.

## Fora de escopo desta spec

- Definição do valor numérico exato das faixas de preço por categoria — decisão operacional
  de configuração, não desta spec.
- Indexação e busca semântica sobre o conteúdo validado — spec própria (004).
- Decisão de roteamento pós-validação (aprovar automaticamente, encaminhar a comprador,
  solicitar reenvio) — spec própria do Orquestrador (005).
- Cadastro e manutenção da base de fornecedores conhecidos usada para conferência de CNPJ —
  assumido como dependência de dado já existente/fora do escopo de criação nesta spec.

## Camada de IA / Governança

- **Papel do Agente Validador**: aplica regras de negócio determinísticas (CNPJ, campos
  obrigatórios, faixa de preço, coerência de prazo) sobre os dados já extraídos, podendo usar
  IA generativa para interpretar contexto ambíguo em campos de texto livre — nunca para
  flexibilizar ou ignorar uma regra obrigatória. Consistente com o Princípio V da
  constituição (regras determinísticas são aceitáveis nesta camada especificamente).
- **Ação proibida em termos de negócio**: nunca marcar um orçamento como "validado" quando
  qualquer regra obrigatória falhou; nunca silenciar uma inconsistência para reduzir volume de
  exceção.
- **Dados sensíveis**: CNPJ e dado de cadastro do fornecedor são dado comercial sensível — segue
  Princípio VII.

## Métricas de Avaliação Contínua

- **Tempo até validação disponível (p95)**: sinal de alerta se sustentado acima de 5 minutos.
- **Taxa de inconsistência por tipo de regra**: acompanhar quais regras mais geram exceção —
  informa se a regra está calibrada corretamente ou gerando ruído.
- **Percentual de orçamentos validados automaticamente sem intervenção humana**: leading
  indicator, sem meta rígida nesta spec.
- **Responsável**: produto + dado/observabilidade da plataforma.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: As faixas de preço esperadas devem ter um valor numérico fixo definido nesta spec?
  R: Não — são especificas por categoria de produto e dependem de dado de mercado que a spec
  não tem como fixar corretamente hoje; tratado como parâmetro configurável, decisão reversível
  e de baixo risco.
- P: O mecanismo de resolução de inconsistência deve seguir o mesmo padrão da spec 001
  (Agente Revisor + fila assíncrona)? R: Deixado como opção válida, não obrigatória — a
  constituição já permite ambas as implementações (escalonamento direto ou camada de IA
  revisora); a escolha específica de arquitetura fica com o `arquiteto-back`, pois não altera
  o comportamento observável exigido por esta spec.
