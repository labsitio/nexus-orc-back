---
feature: ingestao-classificacao-orcamentos
status: clarified
fase_roadmap: Fase 01
envolve_ia_ou_agentes: true
metricas:
  - nome: Tempo entre recebimento do orçamento e resultado de classificação disponível (p95)
    baseline: horas a dias (processo manual atual)
    alvo: até 5 minutos (p95)
  - nome: Percentual de orçamentos recebidos com status consultável (nenhum perdido ou preso sem rastro)
    baseline: desconhecido (sem rastreamento estruturado hoje)
    alvo: 100%
  - nome: Percentual de exceções resolvidas pelo Agente Revisor sem chegar à fila de escalonamento humano
    baseline: desconhecido (capacidade nova)
    alvo: a definir após operação real; monitorado como leading indicator, sem meta rígida nesta spec
personas: [gestor-de-compras, fornecedor, sistema-orquestrador]
depende_de: []
versao: 4
---

# Spec: Pipeline de Ingestão e Classificação de Orçamentos

## Referência

- Doc macro do produto (nível empresa, já aprovado): `docs/briefing-projeto.html`
- Arquitetura macro validada (referência de comportamento, não redecidida aqui):
  `docs/arquitetura-macro.html`, `docs/apresentacao-time.html`
- Esta é a primeira spec de feature do roadmap. Corresponde ao recorte explicitamente
  identificado no briefing como primeiro fluxo ponta a ponta da Fase 01 · Fundação:
  "Gateway de Ingestão + Agente Classificador".
- `.specify/memory/constitution.md` v1.2.0 — Additional Constraint "Escopo do time é
  exclusivamente backend": esta spec cobre apenas o contrato de API/evento/dado; qualquer
  interface visual é responsabilidade de um consumidor externo de frontend.

## Nota de revisão (versão 3)

A resposta original da Pergunta de clarificação 4 ("só ação humana explícita dispara
reprocessamento") foi **substituída** nesta revisão. Motivo: não há humano disponível em
tempo real para revisar orçamentos pendentes na operação real. A nova regra introduz um
**Agente Revisor de IA** como primeira linha de tratamento de baixa confiança, com uma fila
de escalonamento assíncrona para humano como retaguarda — mantendo o Princípio IV da
constituição ("exceção nunca é silenciosa") intacto: a mudança é *quem* trata a exceção em
primeira instância, não a garantia de que ela é sempre tratada e nunca autoaprovada
silenciosamente. Nenhum critério de aceite relacionado a rastreabilidade, imutabilidade do
bruto, ou proibição de decisão arriscada silenciosa foi invalidado — apenas os cenários e
critérios que descreviam reprocessamento "só por ação humana explícita" foram reescritos.

## Nota de revisão (versão 4)

Escopo do time confirmado como exclusivamente backend (constituição v1.2.0). Esta spec nunca
descrevia comportamento de UI diretamente, mas referenciava o Portal do Gestor como possível
consumidor específico em alguns pontos de "Fora de escopo"; essas referências foram
generalizadas para "consumidor externo de frontend, fora do escopo deste time", sem apontar
para nenhuma spec de portal específica (que pode não existir mais como spec própria deste
time). Nenhum comportamento de backend foi alterado nesta revisão.

## Clarifications

### Session 2026-07-29

- Q: Qual o valor numérico do limiar mínimo de confiança do Classificador abaixo do qual o
  orçamento vai para revisão? → A: 80% de confiança mínima.
- Q: Qual a meta operacional de "minutos" até classificação disponível? → A: até 5 minutos
  (p95), entre "orçamento recebido" e resultado de classificação disponível (por
  Classificador, por Agente Revisor, ou marcação de escalonamento).
- Q: O fornecedor autodeclarado no envio é obrigatório ou opcional, considerando canais como
  SFTP que não têm esse metadado nativo? → A: opcional em todos os canais; nunca base
  suficiente isolada para atingir o limiar de confiança — apenas sinal auxiliar quando
  presente.
- Q: Quem dispara o reprocessamento de um orçamento de baixa confiança? → A (revisada — ver
  Nota de revisão acima): quando a confiança do Classificador fica abaixo de 80%, um
  **Agente Revisor de IA** especializado assume automaticamente o papel de primeira linha de
  "humano-no-loop", com contexto adicional, e tenta decidir. Se o Agente Revisor também não
  atingir confiança suficiente, o orçamento é encaminhado para uma **fila de escalonamento
  assíncrona** de revisão humana — que não bloqueia o pipeline dos demais documentos, e nunca
  resulta em autoaprovação silenciosa. Reprocessamento automático pelo Agente Revisor é
  permitido nesse fluxo; reprocessamento por confirmação humana explícita continua possível
  para os casos que chegam à fila de escalonamento.
- Q: O identificador único do orçamento é gerado pelo Gateway de Ingestão ou pode ser
  fornecido pelo emissor? → A: o Gateway de Ingestão sempre gera o identificador canônico,
  independente do canal; uma referência externa enviada pelo emissor (ex.: número de cotação
  do ERP do fornecedor), se houver, é armazenada apenas como metadado de origem — nunca
  substitui o identificador canônico do Nexo.

## Comportamento esperado (dado-quando-então)

### Ingestão multi-canal

- Dado um fornecedor com um orçamento para enviar
- Quando ele envia o arquivo por qualquer um dos 4 canais suportados (upload no portal web,
  chamada à API REST, depósito via SFTP, ou envio pelo aplicativo mobile)
- Então o orçamento bruto é armazenado de forma imutável, recebe um identificador único
  gerado pelo Gateway de Ingestão no momento do recebimento (nunca fornecido pelo emissor), e
  fica associado a metadados de origem (canal utilizado, timestamp de recebimento, e
  opcionalmente uma referência de fornecedor autodeclarada pelo emissor, quando o canal e o
  emissor permitirem informá-la)
- E um evento de domínio "orçamento recebido" é publicado automaticamente, sem qualquer
  intervenção manual, disparando o processamento subsequente

### Independência de canal

- Dado que o mesmo orçamento poderia ter sido enviado por qualquer um dos 4 canais
- Quando comparamos o resultado observável do recebimento entre canais diferentes
- Então o comportamento pós-recebimento (armazenamento imutável, identificador único gerado
  pelo Gateway, metadados de origem, disparo do evento "orçamento recebido") é idêntico
  independente do canal de entrada — nenhum canal tem tratamento privilegiado ou deficiente no
  pipeline posterior ao recebimento
- E a ausência de referência de fornecedor autodeclarada (por o canal não suportar esse campo,
  ex.: SFTP) nunca impede o recebimento nem gera tratamento diferente do orçamento

### Classificação de fornecedor e formato

- Dado um orçamento com evento "orçamento recebido" publicado
- Quando o pipeline processa esse orçamento
- Então o sistema identifica automaticamente o fornecedor emissor e o formato/layout do
  documento, associando um nível de confiança ao resultado — usando a referência de fornecedor
  autodeclarada apenas como sinal auxiliar quando presente, nunca como base suficiente isolada
  para a decisão
- E, quando o nível de confiança é igual ou superior a 80%, o resultado (fornecedor
  identificado, formato identificado, nível de confiança) é publicado como evento de domínio,
  sem necessidade de qualquer ação manual

### Baixa confiança — primeira linha: Agente Revisor de IA

- Dado um orçamento cujo resultado de classificação tem confiança inferior a 80%
- Quando o evento de baixa confiança é publicado
- Então o Agente Revisor de IA é acionado automaticamente, com contexto adicional disponível
  sobre o orçamento, e tenta produzir um resultado de fornecedor/formato com confiança
  suficiente
- E, se o Agente Revisor atingir confiança igual ou superior a 80%, o resultado revisado é
  publicado como evento de domínio da mesma forma que uma classificação direta bem-sucedida,
  com o histórico registrando que passou por revisão automática
- E, em nenhum momento desse fluxo, o orçamento é aprovado silenciosamente sem que algum
  agente (Classificador ou Revisor) tenha reportado confiança igual ou superior a 80%

### Baixa confiança — escalonamento assíncrono para humano

- Dado um orçamento que passou pelo Agente Revisor de IA e ainda assim não atingiu confiança
  suficiente
- Quando o Agente Revisor conclui sua tentativa sem sucesso
- Então o orçamento é encaminhado para uma fila de escalonamento assíncrona de revisão
  humana — nunca descartado e nunca travado silenciosamente
- E esse encaminhamento não bloqueia o processamento de nenhum outro orçamento no pipeline
- E o estado de "pendente de revisão humana (escalonado)" fica visível na consulta de status
  do documento

### Rastreamento de status

- Dado qualquer orçamento já recebido pelo Gateway de Ingestão
- Quando alguém consulta o status desse orçamento via API (esta spec entrega apenas o
  contrato de dado/evento consultável; qualquer interface própria de exibição é
  responsabilidade de um consumidor externo de frontend, fora do escopo deste time)
- Então é possível obter o status atual — recebido / classificado / em revisão automática
  (Agente Revisor) / pendente de revisão humana (escalonado) — e o histórico de timestamps de
  cada etapa já concluída, incluindo qual agente (Classificador ou Revisor) produziu cada
  resultado

### Reprocessamento e resolução de exceção

- Dado um orçamento com confiança abaixo de 80% após a tentativa do Classificador
- Quando o Agente Revisor de IA é acionado automaticamente
- Então essa tentativa de reprocessamento automático é permitida e esperada — não exige
  confirmação humana prévia
- Dado um orçamento que chegou à fila de escalonamento assíncrona (Agente Revisor também sem
  sucesso)
- Quando uma pessoa revisa, corrige e confirma explicitamente a informação de fornecedor e/ou
  formato para esse orçamento (por qualquer canal que consuma o contrato de API/evento desta
  spec — o mecanismo de apresentação dessa ação é responsabilidade de um consumidor externo)
- Então o orçamento retorna ao fluxo normal preservando o histórico de status anterior — a
  correção gera uma nova entrada no histórico, sem apagar o registro de nenhuma tentativa
  anterior (Classificador, Agente Revisor, ou ambos)

## Critérios de aceite (testáveis)

- [ ] Um orçamento enviado por qualquer um dos 4 canais gera um registro com identificador
      único gerado pelo Gateway de Ingestão, metadados de origem (canal, timestamp, e
      referência de fornecedor autodeclarada quando presente) e o arquivo bruto
      correspondente, sem exigir nenhuma ação manual de triagem.
- [ ] O comportamento observável pós-recebimento é idêntico entre os 4 canais (mesmo conjunto
      de metadados obrigatórios, mesmo evento de domínio disparado); a ausência de referência
      de fornecedor autodeclarada nunca bloqueia o recebimento em nenhum canal.
- [ ] O arquivo bruto de um orçamento nunca é sobrescrito por etapa nenhuma do pipeline desta
      spec.
- [ ] Todo orçamento recebido tem, em algum momento após o processamento, exatamente um dos
      três resultados possíveis: (a) fornecedor e formato identificados pelo Classificador com
      confiança ≥ 80%; (b) fornecedor e formato identificados pelo Agente Revisor com
      confiança ≥ 80%, após o Classificador não ter atingido o limiar; ou (c) marcação
      explícita de pendência na fila de escalonamento assíncrona de revisão humana, quando nem
      Classificador nem Revisor atingem confiança suficiente.
- [ ] Nenhum orçamento recebido permanece sem status consultável — 100% dos orçamentos
      recebidos possuem status rastreável via API em qualquer momento após o recebimento.
- [ ] A consulta de status de um orçamento retorna o histórico de timestamps de cada etapa já
      concluída, identificando qual agente (Classificador ou Revisor) produziu cada resultado,
      quando aplicável.
- [ ] Um orçamento na fila de escalonamento assíncrona só é reprocessado mediante confirmação
      humana explícita; o Agente Revisor, por outro lado, pode reprocessar automaticamente um
      orçamento de baixa confiança do Classificador sem exigir confirmação humana prévia. Em
      ambos os casos, o histórico de tentativas anteriores permanece consultável (não é
      apagado).
- [ ] Nenhum orçamento é aprovado (avança como "classificado") com confiança inferior a 80% em
      nenhuma das duas linhas de decisão automática (Classificador ou Agente Revisor) — abaixo
      do limiar, o único destino automático possível é a fila de escalonamento assíncrona.
- [ ] O tempo entre o recebimento do orçamento e a disponibilidade do resultado de
      classificação (por Classificador, por Agente Revisor, ou marcação de escalonamento) é de
      até 5 minutos no percentil 95 dos casos, no fluxo automático completo (Classificador +
      Agente Revisor), sem depender de disponibilidade humana em tempo real.

## Fora de escopo desta spec

- Agente Extrator (extração de itens, preços, condições comerciais) — spec futura, Fase 01
  tardia ou Fase 02.
- Agente Validador de consistência de negócio (CNPJ, faixas de preço, campos obrigatórios) —
  Fase 02.
- Agente de Indexação e busca semântica — Fase 02.
- Agente Orquestrador de workflow completo (decisão de aprovar automaticamente, encaminhar
  para comprador, solicitar reenvio ao fornecedor) — esta spec cobre apenas o disparo
  automático do pipeline até a classificação (incluindo a linha de revisão automática e o
  escalonamento assíncrono), não a decisão de roteamento de negócio pós-classificação.
- Qualquer interface visual (Portal Web de Acompanhamento ou outro frontend) — fora do escopo
  deste time por definição de produto (constituição v1.2.0, Additional Constraints); esta spec
  entrega apenas o alicerce de dados/eventos que um consumidor externo de frontend consumirá
  depois, incluindo o estado e o evento da fila de escalonamento assíncrona — o mecanismo de
  trabalho humano sobre essa fila (seja via interface visual ou outro canal) é responsabilidade
  desse consumidor externo, fora do escopo deste time.
- Integrações externas via SNS/EventBridge com sistemas parceiros da rede varejista.
- Multi-tenancy (isolamento por rede varejista) — Fase 03.
- Exportação de relatórios de auditoria/compliance para usuário final.
- Notificação push ao fornecedor sobre status do envio (mencionada no app mobile na doc macro,
  mas não faz parte do critério de aceite desta spec — pode ser tratada como melhoria
  posterior do canal mobile).
- Recalibração do limiar de 80% de confiança com base em dado real de produção — tratado como
  ajuste de parâmetro futuro (ver Métricas de Avaliação Contínua), não como decisão desta spec.
- SLA/prazo máximo de permanência na fila de escalonamento assíncrona antes de intervenção
  humana — não definido nesta spec; recomenda-se tratar em spec futura de backend (ex.:
  política de aging/SLA da fila), sem depender de nenhuma interface visual para ser definido.

## Camada de IA / Governança

### Agente Classificador

- **Papel**: decide, a partir do orçamento bruto recebido, (1) qual fornecedor o emitiu e (2)
  qual formato/layout foi usado — sempre acompanhado de um nível de confiança. NUNCA decide o
  roteamento de negócio pós-classificação (isso é responsabilidade de uma capacidade futura,
  o Orquestrador de Workflow), NUNCA altera ou descarta o orçamento bruto.
- **Ação proibida em termos de negócio**: nunca reportar confiança "alta" quando não há base
  suficiente — nunca "inventar" uma identificação para evitar acionar a linha de revisão.
  Abaixo de 80% de confiança, o único resultado de negócio aceitável é encaminhar para o
  Agente Revisor.
- Referência de fornecedor autodeclarada pelo emissor nunca pode, isoladamente, elevar
  artificialmente a confiança reportada.

### Agente Revisor de IA (nova capacidade de governança introduzida na versão 3)

- **Papel**: atua como primeira linha automática de tratamento de baixa confiança, sempre que
  o Classificador reporta confiança inferior a 80%. Recebe o mesmo orçamento e contexto
  adicional disponível (ex.: histórico de fornecedores conhecidos, sinais auxiliares como
  referência autodeclarada) e tenta produzir um resultado de fornecedor/formato com confiança
  suficiente.
- **Quando é acionado**: automaticamente, sempre e apenas quando o Classificador não atinge
  80% de confiança. Nunca é acionado como primeira tentativa de classificação — não substitui
  o Classificador, atua depois dele.
- **Ação proibida em termos de negócio**: assim como o Classificador, NUNCA reporta confiança
  "alta" artificialmente para evitar o escalonamento à fila humana. NUNCA aprova
  automaticamente um orçamento apenas para reduzir o volume da fila de escalonamento — a
  meta de negócio é decisão correta, não taxa de automação.
- **Limite explícito**: se o Agente Revisor também não atingir 80% de confiança, o único
  destino aceitável é a fila de escalonamento assíncrona de revisão humana — nunca uma
  segunda tentativa automática adicional, nunca autoaprovação por exaustão de tentativas.
- **Nunca substitui o backstop humano**: a fila de escalonamento assíncrona sempre existe como
  retaguarda; o Agente Revisor reduz a dependência de humano em tempo real, mas não elimina a
  necessidade de revisão humana eventual para os casos que nenhum agente resolve.

### Fila de escalonamento assíncrona (revisão humana residual)

- **Papel de negócio**: retaguarda final para os casos que nem Classificador nem Agente
  Revisor conseguem resolver com confiança suficiente. Não bloqueia o pipeline dos demais
  orçamentos.
- **Garantia vinculante**: nenhum orçamento nesta fila é autoaprovado por tempo de espera,
  volume da fila, ou qualquer outro motivo que não seja confirmação humana explícita.

### Considerações transversais (aplicam-se a Classificador e Agente Revisor)

- **Dados sensíveis / PII envolvidos**: orçamentos podem conter dado de contato e dado
  comercial do fornecedor (não dado pessoal de consumidor final). Tratamento de PII (se
  houver) segue o Princípio VII da constituição do projeto (segurança e LGPD desde o desenho)
  — esta spec não introduz exceção a esse princípio.
- **Humano-no-loop**: nesta revisão, "humano-no-loop" é satisfeito por uma cadeia de duas
  linhas — Agente Revisor de IA como primeira linha automática, fila de escalonamento
  assíncrona como retaguarda humana final. Em nenhum ponto da cadeia uma classificação de
  baixa confiança avança como "classificado" sem que confiança ≥ 80% tenha sido efetivamente
  atingida por Classificador ou Revisor, ou sem chegar à fila de escalonamento.
- **Critério de comportamento aceitável**: taxa de classificação incorreta (fornecedor ou
  formato errado, mas reportada com confiança ≥ 80% por qualquer um dos dois agentes) deve
  ser tratada como defeito de produto a ser monitorado — ver "Métricas de Avaliação
  Contínua". Nenhum dos dois agentes deve "chutar" silenciosamente; é preferível uma taxa
  maior de encaminhamento à fila de escalonamento do que uma taxa maior de erro silencioso.

## Métricas de Avaliação Contínua

- **Tempo até classificação disponível (p95)**: monitorar continuamente o tempo entre
  "orçamento recebido" e resultado de classificação disponível (por Classificador, por Agente
  Revisor, ou marcação de escalonamento). Sinal de alerta: p95 sustentado acima de 5 minutos
  dispara revisão desta spec quanto a escopo/capacidade.
- **Percentual de orçamentos sem status consultável**: deve ser 0% a qualquer momento após o
  recebimento. Qualquer ocorrência acima de 0% é incidente crítico, não apenas sinal de
  drift.
- **Taxa de resolução pelo Agente Revisor**: percentual de orçamentos de baixa confiança do
  Classificador que o Agente Revisor consegue resolver (confiança ≥ 80%) sem chegar à fila de
  escalonamento. Leading indicator de valor da capacidade — sem meta rígida nesta spec, mas
  acompanhado desde o primeiro dia de operação.
- **Taxa e idade da fila de escalonamento assíncrona**: acompanhar volume e tempo de
  permanência dos orçamentos na fila. Crescimento sustentado sem capacidade humana de
  absorção é gatilho para reabrir esta spec (ex.: revisão do limiar de 80%, capacidade do
  Agente Revisor, ou necessidade de mais capacidade humana).
- **Taxa de erro silencioso (classificação incorreta reportada com confiança ≥ 80%, por
  qualquer um dos dois agentes)**: apurada por amostragem/feedback do gestor de compras quando
  disponível. Qualquer taxa detectada acima de zero é gatilho para reabrir esta spec e revisar
  a Camada de IA / Governança e o valor do limiar de confiança.
- **Responsável por observar os sinais acima**: produto (gerente de produto) em conjunto com
  dado/observabilidade da plataforma; suporte reporta incidentes de orçamento "perdido" ou sem
  status assim que percebidos operacionalmente.

## Perguntas resolvidas (speckit-clarify)

- P: Qual o valor numérico do limiar mínimo de confiança do Classificador?
  R: 80%.
- P: Qual a meta operacional de tempo até classificação disponível?
  R: até 5 minutos (p95).
- P: Fornecedor autodeclarado no envio é obrigatório ou opcional?
  R: opcional em todos os canais; nunca é base suficiente isolada para a confiança.
- P: Quem dispara o reprocessamento de um orçamento de baixa confiança? (revisado na versão 3)
  R: Agente Revisor de IA assume automaticamente como primeira linha; se ele também não
  atingir 80% de confiança, o orçamento vai para fila de escalonamento assíncrona, reprocessada
  apenas por confirmação humana explícita. Nunca há autoaprovação silenciosa em nenhum ponto
  dessa cadeia.
- P: O identificador único é gerado pelo Gateway ou pode ser fornecido pelo emissor?
  R: sempre gerado pelo Gateway de Ingestão; referência externa do emissor é só metadado.
