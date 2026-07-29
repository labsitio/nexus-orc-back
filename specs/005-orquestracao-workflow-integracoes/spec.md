---
feature: orquestracao-workflow-integracoes
status: clarified
fase_roadmap: Fase 02
envolve_ia_ou_agentes: true
metricas:
  - nome: Percentual de orçamentos com decisão de workflow disponível sem intervenção manual
    baseline: 0% (não existe decisão automatizada hoje)
    alvo: a definir após operação real; leading indicator
  - nome: Percentual de decisões resolvidas pelo Agente Revisor sem chegar à fila de escalonamento humano
    baseline: 0% (capacidade nova)
    alvo: a definir após operação real; leading indicator
  - nome: Tempo entre validação disponível e decisão de workflow publicada (p95)
    baseline: horas/dias (decisão manual hoje)
    alvo: até 5 minutos (p95) para decisões resolvidas por Orquestrador ou Agente Revisor
personas: [gestor-de-compras, comprador-responsavel, fornecedor, sistema-orquestrador]
depende_de: [validacao-consistencia-orcamentos]
versao: 3
---

# Spec: Orquestração de Workflow e Integrações (Agente Orquestrador)

## Referência

- `docs/briefing-projeto.html` (Fase 02 · Inteligência: "Automação de workflows e
  integrações").
- `docs/apresentacao-time.html` (Agente 5 · Orquestrador de Workflow: "decide o próximo passo
  com base no resultado dos demais agentes — aprovar automaticamente, encaminhar para o
  comprador responsável avaliar, ou solicitar reenvio ao fornecedor quando faltar algum dado
  — e mantém o registro de decisão para auditoria"; também "decide... acionar uma integração
  externa").
- `specs/001-ingestao-classificacao-orcamentos/spec.md` v4 e `.specify/memory/constitution.md`
  v1.2.0 (Princípio IV, Additional Constraints) — padrão de humano-no-loop reaproveitado nesta
  spec e escopo exclusivamente backend, ver "Nota de revisão" abaixo.

## Nota de revisão (versão 2)

A questão bloqueante original desta spec ("qual critério determina aprovação automática sem
revisão de comprador humano") foi resolvida pelo produto: em vez de fixar um critério de
negócio novo (valor limite, histórico de fornecedor, etc.), a decisão foi aplicar o mesmo
padrão de duas linhas já vinculante na constituição (Princípio IV) e já usado na spec 001 —
Agente Revisor de IA como primeira linha automática, fila de escalonamento assíncrona como
retaguarda humana. Isso substitui as três alternativas antes levantadas (nunca automático /
limite de valor / fornecedor confiável): nenhuma delas foi escolhida isoladamente; a régua de
decisão passa a ser **confiança do resultado de roteamento**, não uma regra de negócio fixa
sobre o conteúdo do orçamento. Status alterado de `draft` para `clarified`.

## Nota de revisão (versão 3)

Escopo do time confirmado como exclusivamente backend (constituição v1.2.0). A referência a
"consumo do Portal do Gestor (specs 006/007)" em "Fora de escopo" apontava para specs de
frontend que foram retiradas/reduzidas do catálogo deste time — generalizada para "consumidor
externo de frontend", sem apontar para arquivo específico. Nenhum comportamento de backend
foi alterado.

## Comportamento esperado (dado-quando-então)

### Decisão de workflow com confiança suficiente

- Dado um orçamento validado (spec 003), com resultado de classificação e extração já
  disponíveis
- Quando o Agente Orquestrador consolida o resultado dos agentes anteriores e consegue decidir
  o roteamento com confiança suficiente
- Então ele decide entre exatamente três ações possíveis: (a) aprovar automaticamente e seguir
  para as etapas subsequentes de negócio; (b) encaminhar para avaliação do comprador
  responsável; ou (c) solicitar reenvio ao fornecedor quando dado essencial estiver faltando
  mesmo após validação
- E a decisão tomada é publicada como evento de domínio, com o registro de qual critério e
  qual nível de confiança levaram à decisão, para auditoria

### Decisão sem confiança suficiente — primeira linha: Agente Revisor de IA

- Dado um orçamento validado cujo resultado de roteamento não atinge confiança suficiente
- Quando o Orquestrador não consegue decidir entre as três ações possíveis com segurança
- Então um Agente Revisor de IA especializado é acionado automaticamente, com contexto
  adicional (histórico do fornecedor, resultado completo da validação, decisões anteriores
  similares) e tenta produzir uma decisão de roteamento com confiança suficiente
- E, se o Agente Revisor atingir confiança suficiente, a decisão revisada é publicada como
  evento de domínio da mesma forma que uma decisão direta do Orquestrador, com o histórico
  registrando que passou por revisão automática
- E, em nenhum momento desse fluxo, um orçamento é aprovado automaticamente sem que Orquestrador
  ou Agente Revisor tenham reportado confiança suficiente para essa decisão específica

### Decisão sem confiança suficiente — escalonamento assíncrono para o comprador

- Dado um orçamento que passou pelo Agente Revisor de IA e ainda assim não atingiu confiança
  suficiente para nenhuma das três ações
- Quando o Agente Revisor conclui sua tentativa sem sucesso
- Então o orçamento é encaminhado para a fila de escalonamento assíncrona de revisão humana
  (comprador responsável) — nunca descartado e nunca travado silenciosamente
- E esse encaminhamento não bloqueia o processamento de nenhum outro orçamento no pipeline
- E o comprador, ao revisar e confirmar explicitamente a ação correta (por qualquer canal que
  consuma o contrato de API/evento desta spec), tem essa decisão registrada com o mesmo peso
  de uma decisão automática, preservando o histórico das tentativas anteriores (Orquestrador e
  Agente Revisor)

### Solicitação de reenvio ao fornecedor

- Dado um orçamento cuja validação aponta ausência de dado essencial que não pode ser suprido
  automaticamente (ex.: item sem preço)
- Quando o Orquestrador (ou o Agente Revisor, se acionado) decide, com confiança suficiente,
  que o caminho correto é solicitar reenvio
- Então essa decisão é registrada e disparada como evento, permitindo que uma notificação seja
  enviada ao fornecedor (mecanismo de notificação em si é responsabilidade de spec de
  integração/canal, não desta spec)

### Integração externa disparada pela decisão

- Dado um orçamento cuja decisão de workflow (por Orquestrador, Agente Revisor, ou comprador
  via fila de escalonamento) exige comunicação com um sistema externo da rede varejista (ex.:
  sistema de compras já em uso)
- Quando essa decisão é tomada
- Então um evento de integração é publicado no barramento, desacoplado do sistema externo
  específico (nenhum dos decisores conhece o contrato do sistema parceiro, apenas publica a
  intenção de integração)

### Rastreabilidade da decisão

- Dado qualquer orçamento que passou pelo Orquestrador
- Quando alguém consulta o histórico desse orçamento
- Então a decisão final tomada (aprovado / encaminhado / reenvio solicitado), qual camada a
  produziu (Orquestrador, Agente Revisor, ou comprador via escalonamento), o critério/confiança
  que a motivou, e o timestamp ficam registrados e consultáveis, sem possibilidade de
  sobrescrita de nenhuma tentativa anterior

## Critérios de aceite (testáveis)

- [ ] Todo orçamento validado recebe uma decisão final de workflow (uma das três ações),
      produzida por Orquestrador, Agente Revisor, ou comprador via fila de escalonamento —
      nunca ficando "parado" sem decisão.
- [ ] Nenhum orçamento é aprovado automaticamente (ação "aprovar") sem que Orquestrador ou
      Agente Revisor tenham reportado confiança suficiente para essa decisão específica; abaixo
      da confiança suficiente, o único destino automático possível é a fila de escalonamento
      assíncrona para o comprador.
- [ ] A decisão final e a camada que a produziu (Orquestrador / Agente Revisor / comprador)
      ficam registradas de forma consultável e imutável no histórico do orçamento, incluindo o
      histórico de tentativas anteriores quando houver mais de uma camada envolvida.
- [ ] Uma decisão de "solicitar reenvio" nunca é tomada sem que a validação (spec 003) tenha
      apontado ausência de dado essencial específico.
- [ ] Uma decisão que exige integração externa publica um evento de integração desacoplado,
      sem quem decidiu precisar conhecer o contrato do sistema parceiro.
- [ ] Um orçamento na fila de escalonamento assíncrona de decisão de workflow só avança
      mediante confirmação explícita do comprador responsável — nunca por tempo de espera,
      volume da fila, ou exaustão de tentativas automáticas.

## Fora de escopo desta spec

- Contrato específico de integração com qualquer sistema parceiro nomeado (ERP da rede
  varejista, ferramenta de compras existente) — nenhum sistema específico é citado na
  documentação macro; tratado como integração genérica via evento.
- Canal e formato da notificação de reenvio ao fornecedor (e-mail, portal, notificação push) —
  spec própria se necessário.
- Qualquer interface visual para o comprador avaliar orçamentos encaminhados ou resolver itens
  da fila de escalonamento — responsabilidade de um consumidor externo de frontend, fora do
  escopo deste time; esta spec entrega apenas o dado/evento consultável dessas decisões.
- Aprendizado/ajuste automático do limiar de confiança ao longo do tempo — tratado como
  parâmetro de configuração operacional, não como comportamento a especificar aqui (mesmo
  padrão de decisão já adotado nas specs 001–002 para o limiar do Classificador/Extrator).
- Valor numérico exato do limiar mínimo de confiança do Orquestrador/Agente Revisor — não
  fixado nesta spec; recomenda-se, por consistência, adotar o mesmo valor de 80% já definido
  na spec 001, mas a calibração final é parâmetro operacional, ajustável sem mudança de
  comportamento de produto.

## Camada de IA / Governança

### Agente Orquestrador

- **Papel**: consolida o resultado de Classificador, Extrator e Validador e decide o próximo
  passo de negócio (aprovar / encaminhar / solicitar reenvio), sempre acompanhado de um nível
  de confiança. NUNCA decide ele mesmo o conteúdo de fornecedor/formato/extração/validação
  (isso já foi decidido pelos agentes anteriores) — atua estritamente sobre o resultado
  consolidado.
- **Ação proibida em termos de negócio**: nunca aprovar automaticamente um orçamento que não
  tenha passado por validação bem-sucedida (spec 003); nunca reportar confiança suficiente
  artificialmente para evitar acionar o Agente Revisor; nunca decidir integração externa sem
  publicar o evento correspondente.

### Agente Revisor de IA (decisão de workflow)

- **Papel**: atua como primeira linha automática de tratamento de baixa confiança na decisão
  de roteamento, sempre que o Orquestrador não consegue decidir com confiança suficiente entre
  aprovar/encaminhar/solicitar reenvio. Recebe o mesmo orçamento e contexto adicional (histórico
  do fornecedor, resultado completo da validação, decisões anteriores similares) e tenta
  produzir uma decisão de roteamento com confiança suficiente.
- **Quando é acionado**: automaticamente, sempre e apenas quando o Orquestrador não atinge
  confiança suficiente para decidir. Nunca é acionado como primeira tentativa — atua depois do
  Orquestrador, nunca o substitui.
- **Ação proibida em termos de negócio**: nunca reporta confiança suficiente artificialmente
  para evitar o escalonamento à fila do comprador; NUNCA aprova automaticamente um orçamento
  apenas para reduzir o volume da fila de escalonamento — a meta de negócio é decisão correta
  de compra, não taxa de automação. Esta é a restrição de maior risco financeiro de toda a
  cadeia de agentes do produto, por decidir diretamente sobre aprovação de compra.
- **Limite explícito**: se o Agente Revisor também não atingir confiança suficiente, o único
  destino aceitável é a fila de escalonamento assíncrona para o comprador responsável — nunca
  uma segunda tentativa automática adicional, nunca autoaprovação por exaustão de tentativas.
- **Nunca substitui o backstop humano**: a fila de escalonamento assíncrona para o comprador
  sempre existe como retaguarda final para decisões de roteamento que nenhum agente resolve
  com confiança suficiente.

### Fila de escalonamento assíncrona (decisão de workflow — comprador)

- **Papel de negócio**: retaguarda final para decisões de roteamento que nem Orquestrador nem
  Agente Revisor conseguem tomar com confiança suficiente. Não bloqueia o pipeline dos demais
  orçamentos.
- **Garantia vinculante**: nenhuma decisão de aprovação de compra nesta fila é tomada
  automaticamente por tempo de espera, volume da fila, ou qualquer motivo que não seja
  confirmação explícita do comprador responsável.

### Considerações transversais

- **Dados sensíveis**: mesmas considerações das specs anteriores (Princípio VII da
  constituição).
- **Consistência normativa**: esta cadeia de duas linhas (Agente Revisor + fila de
  escalonamento assíncrona) é o mesmo padrão já estabelecido na spec 001 e explicitamente
  permitido pelo Princípio IV da constituição v1.2.0 como implementação válida de
  humano-no-loop — nenhuma nova capacidade de governança fora desse padrão foi introduzida.

## Métricas de Avaliação Contínua

- **Tempo até decisão de workflow disponível (p95)**: sinal de alerta se sustentado acima de
  5 minutos para decisões resolvidas por Orquestrador ou Agente Revisor.
- **Distribuição das três decisões possíveis** (aprovado automaticamente / encaminhado /
  reenvio solicitado) por camada decisora (Orquestrador / Agente Revisor / comprador):
  acompanhar tendência; mudança abrupta é gatilho de investigação.
- **Percentual de decisões resolvidas pelo Agente Revisor sem chegar à fila de escalonamento**:
  leading indicator de valor da capacidade, sem meta rígida nesta spec.
- **Taxa e idade da fila de escalonamento assíncrona de decisão de workflow**: crescimento
  sustentado sem capacidade humana de absorção é gatilho para reabrir esta spec.
- **Taxa de decisão de aprovação automática revertida posteriormente por um comprador**:
  qualquer taxa acima de zero é sinal crítico de recalibração do limiar de confiança do
  Orquestrador/Agente Revisor — esta é a métrica de maior criticidade de negócio de toda a
  cadeia, por afetar diretamente decisão de compra.
- **Responsável**: produto (gerente de produto) em conjunto com o comprador responsável e
  dado/observabilidade da plataforma.

## Perguntas resolvidas (speckit-clarify)

- P: Qual critério determina se um orçamento pode ser aprovado automaticamente, sem revisão
  de um comprador humano?
  R: Nenhuma regra de negócio fixa sobre o conteúdo do orçamento (não é "nunca automático", nem
  "limite de valor", nem "fornecedor confiável" isoladamente). A régua é a confiança do
  resultado de roteamento: o Orquestrador decide automaticamente quando tem confiança
  suficiente; quando não tem, um Agente Revisor de IA tenta decidir automaticamente com
  contexto adicional; se também não atingir confiança suficiente, a decisão vai para a fila de
  escalonamento assíncrona do comprador responsável. Nunca há aprovação automática por
  exaustão de tentativas, tempo ou volume de fila. Este é o mesmo padrão de duas linhas já
  vinculante na spec 001 e no Princípio IV da constituição — não exigiu nova emenda de
  constituição, pois o princípio já foi redigido de forma genérica o suficiente para cobrir
  este caso.
