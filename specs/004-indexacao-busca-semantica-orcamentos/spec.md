---
feature: indexacao-busca-semantica-orcamentos
status: clarified
fase_roadmap: Fase 02
envolve_ia_ou_agentes: true
metricas:
  - nome: Tempo entre validação disponível e orçamento pesquisável (p95)
    baseline: não existe busca estruturada hoje
    alvo: até 5 minutos (p95)
  - nome: Percentual de orçamentos validados que ficam indexados e pesquisáveis
    baseline: 0%
    alvo: 100% (com tolerância de atraso definida pela métrica de tempo acima)
personas: [gestor-de-compras]
depende_de: [validacao-consistencia-orcamentos]
versao: 2
---

# Spec: Indexação e Busca Semântica de Orçamentos

## Referência

- `docs/briefing-projeto.html` (Fase 02 · Inteligência: "Indexação e busca semântica").
- `docs/apresentacao-time.html` (Agente 4 · Indexação e Busca Semântica: gera embeddings do
  conteúdo do orçamento e dos itens extraídos; Camada de Busca: consulta em linguagem natural,
  ex. "orçamentos de embalagens recebidos abaixo de R$10 mil nos últimos 30 dias").
- `.specify/memory/constitution.md` v1.2.0 — Additional Constraint "Escopo do time é
  exclusivamente backend": esta spec entrega a capacidade de busca via API/evento; qualquer
  interface visual de busca é responsabilidade de um consumidor externo.

## Nota de revisão (versão 2)

Escopo confirmado como exclusivamente backend. As referências a "Portal do Gestor" como
consumidor específico foram generalizadas para "consumidor externo de frontend", sem apontar
para nenhuma spec de portal específica. Nenhum comportamento de backend foi alterado.

## Comportamento esperado (dado-quando-então)

### Indexação automática

- Dado um orçamento marcado como "validado" (spec 003)
- Quando o Agente de Indexação processa esse orçamento
- Então o conteúdo do orçamento e dos itens extraídos é indexado de forma que se torne
  pesquisável por linguagem natural (não apenas por correspondência exata de campo), e um
  evento de domínio "orçamento indexado" é publicado

### Busca em linguagem natural

- Dado um conjunto de orçamentos já indexados
- Quando uma consulta em linguagem natural combinando critérios (ex.: categoria de produto,
  faixa de preço, período de recebimento) é submetida via API
- Então o sistema retorna os orçamentos relevantes à consulta, ordenados por relevância

### Falha de indexação não bloqueia o restante do pipeline

- Dado um orçamento validado que falha ao ser indexado (ex.: indisponibilidade momentânea do
  serviço de embeddings)
- Quando essa falha ocorre
- Então o orçamento permanece com status "validado" e disponível pelas demais formas de
  consulta (não pela busca semântica) — a indexação é tratada como enriquecimento assíncrono,
  nunca como bloqueio do restante do fluxo de negócio, consistente com o desacoplamento por
  eventos do Princípio II da constituição
- E a falha gera um evento de exceção rastreável, para nova tentativa, sem violar o Princípio
  IV (exceção nunca silenciosa)

## Critérios de aceite (testáveis)

- [ ] Um orçamento validado torna-se pesquisável por linguagem natural em até 5 minutos (p95).
- [ ] Uma consulta via API combinando categoria, faixa de preço e período retorna os
      orçamentos relevantes, sem exigir correspondência exata de texto.
- [ ] Falha de indexação de um orçamento específico nunca impede que esse orçamento continue
      disponível como "validado" nem impede o processamento dos demais orçamentos.
- [ ] Toda falha de indexação gera evento de exceção rastreável (visível no histórico do
      documento), nunca falha silenciosa.

## Fora de escopo desta spec

- Qualquer interface visual de busca para o usuário final — responsabilidade de um consumidor
  externo de frontend, fora do escopo deste time; esta spec entrega apenas a capacidade de
  busca via API/evento.
- Ranking avançado personalizado por usuário, sinônimos de domínio customizados, suporte
  multilíngue — não mencionados na documentação macro, assumidos fora de escopo até haver
  demanda registrada.
- Reindexação em massa de orçamentos históricos anteriores à entrada em produção desta
  capacidade — tratado como tarefa operacional pontual, não requisito de comportamento
  contínuo desta spec.

## Camada de IA / Governança

- **Papel do Agente de Indexação**: gera representações vetoriais (embeddings) do conteúdo do
  orçamento e dos itens extraídos para habilitar busca semântica. NUNCA reinterpreta ou altera
  o valor de nenhum campo estruturado (preço, quantidade) — apenas cria uma representação
  adicional para busca.
- **Ação proibida em termos de negócio**: nunca omitir um orçamento validado do índice por
  qualquer critério que não seja falha técnica registrada como exceção — nenhuma decisão de
  negócio de "relevância" deve excluir um orçamento da possibilidade de ser encontrado.
- **Dados sensíveis**: mesmas considerações de dado comercial sensível das specs anteriores
  (Princípio VII); a busca semântica não deve expor dado de um orçamento a quem não tem
  permissão de visualizá-lo (autorização é responsabilidade da camada de API/consumidor
  externo que expõe esta capacidade, não desta spec).

## Métricas de Avaliação Contínua

- **Tempo até indexação disponível (p95)**: sinal de alerta se sustentado acima de 5 minutos.
- **Percentual de orçamentos validados indexados com sucesso**: deve tender a 100%; taxa de
  falha sustentada é gatilho de investigação de capacidade.
- **Responsável**: produto + dado/observabilidade da plataforma.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: A indexação deve bloquear o avanço do orçamento no pipeline de negócio em caso de falha?
  R: Não — decisão consistente com o Princípio II (desacoplamento por eventos) já vinculante
  na constituição; reversível e de baixo risco, pois indexação é enriquecimento, não decisão
  de negócio crítica como aprovação de compra.
