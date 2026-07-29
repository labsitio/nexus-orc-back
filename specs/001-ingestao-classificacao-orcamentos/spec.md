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
  - nome: Percentual de orçamentos de baixa confiança do Classificador encaminhados à fila de escalonamento humano
    baseline: desconhecido (capacidade nova)
    alvo: a definir após operação real; monitorado como leading indicator, sem meta rígida nesta spec
personas: [gestor-de-compras, fornecedor, sistema-orquestrador]
depende_de: []
versao: 5
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
reprocessamento") foi **substituída** na versão 3 por um **Agente Revisor de IA** como
primeira linha de tratamento de baixa confiança. Essa decisão foi **revertida na versão 5**
(ver nota abaixo) — o Agente Revisor foi removido do produto. Esta nota permanece apenas como
registro histórico da evolução da spec.

## Nota de revisão (versão 4)

Escopo do time confirmado como exclusivamente backend (constituição v1.2.0). Esta spec nunca
descrevia comportamento de UI diretamente, mas referenciava o Portal do Gestor como possível
consumidor específico em alguns pontos de "Fora de escopo"; essas referências foram
generalizadas para "consumidor externo de frontend, fora do escopo deste time", sem apontar
para nenhuma spec de portal específica (que pode não existir mais como spec própria deste
time). Nenhum comportamento de backend foi alterado nesta revisão.

## Nota de revisão (versão 5)

O **Agente Revisor de IA** introduzido na versão 3 foi **removido**. Decisão de produto: um
segundo agente de IA no caminho de exceção agrega custo e latência sem garantia de resolver o
que o papel fixo (Classificador) já não resolveu. O novo padrão é mais simples e mantém o
Princípio IV ("exceção nunca é silenciosa") intacto: o Classificador faz **uma** tentativa;
se a confiança fica abaixo de 80%, o orçamento é encaminhado **diretamente** para a fila de
escalonamento assíncrona de revisão humana. Não há reprocessamento automático por IA. Todos
os cenários, critérios de aceite e a Camada de IA / Governança que descreviam o Agente Revisor
foram reescritos para refletir a linha única Classificador → revisão humana. Nenhum critério
relacionado a rastreabilidade, imutabilidade do bruto ou proibição de autoaprovação silenciosa
foi enfraquecido.

## Clarifications

### Session 2026-07-29

- Q: Qual o valor numérico do limiar mínimo de confiança do Classificador abaixo do qual o
  orçamento vai para revisão? → A: 80% de confiança mínima.
- Q: Qual a meta operacional de "minutos" até classificação disponível? → A: até 5 minutos
  (p95), entre "orçamento recebido" e resultado de classificação disponível (por
  Classificador ou marcação de escalonamento humano).
- Q: O fornecedor autodeclarado no envio é obrigatório ou opcional, considerando canais como
  SFTP que não têm esse metadado nativo? → A: opcional em todos os canais; nunca base
  suficiente isolada para atingir o limiar de confiança — apenas sinal auxiliar quando
  presente.
- Q: Quem dispara o reprocessamento de um orçamento de baixa confiança? → A (revisada na
  versão 5 — ver Nota de revisão acima): quando a confiança do Classificador fica abaixo de
  80%, o orçamento é encaminhado **diretamente** para uma **fila de escalonamento assíncrona**
  de revisão humana — que não bloqueia o pipeline dos demais documentos, e nunca resulta em
  autoaprovação silenciosa. Reprocessamento ocorre apenas por confirmação humana explícita
  sobre os itens dessa fila; não há reprocessamento automático por IA.
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

### Baixa confiança — escalonamento assíncrono para humano

- Dado um orçamento cujo resultado de classificação tem confiança inferior a 80%
- Quando o Classificador conclui sua tentativa abaixo do limiar
- Então o orçamento é encaminhado diretamente para uma fila de escalonamento assíncrona de
  revisão humana — nunca descartado, nunca travado silenciosamente e nunca aprovado sem que o
  Classificador tenha reportado confiança igual ou superior a 80%
- E esse encaminhamento não bloqueia o processamento de nenhum outro orçamento no pipeline
- E o estado de "pendente de revisão humana (escalonado)" fica visível na consulta de status
  do documento

### Rastreamento de status

- Dado qualquer orçamento já recebido pelo Gateway de Ingestão
- Quando alguém consulta o status desse orçamento via API (esta spec entrega apenas o
  contrato de dado/evento consultável; qualquer interface própria de exibição é
  responsabilidade de um consumidor externo de frontend, fora do escopo deste time)
- Então é possível obter o status atual — recebido / classificado / pendente de revisão humana
  (escalonado) — e o histórico de timestamps de cada etapa já concluída, incluindo qual agente
  (Classificador ou humano) produziu cada resultado

### Reprocessamento e resolução de exceção

- Dado um orçamento que chegou à fila de escalonamento assíncrona (Classificador abaixo de 80%)
- Quando uma pessoa revisa, corrige e confirma explicitamente a informação de fornecedor e/ou
  formato para esse orçamento (por qualquer canal que consuma o contrato de API/evento desta
  spec — o mecanismo de apresentação dessa ação é responsabilidade de um consumidor externo)
- Então o orçamento retorna ao fluxo normal preservando o histórico de status anterior — a
  correção gera uma nova entrada no histórico, sem apagar o registro da tentativa anterior do
  Classificador

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
      dois resultados possíveis: (a) fornecedor e formato identificados pelo Classificador com
      confiança ≥ 80%; ou (b) marcação explícita de pendência na fila de escalonamento
      assíncrona de revisão humana, quando o Classificador não atinge confiança suficiente.
- [ ] Nenhum orçamento recebido permanece sem status consultável — 100% dos orçamentos
      recebidos possuem status rastreável via API em qualquer momento após o recebimento.
- [ ] A consulta de status de um orçamento retorna o histórico de timestamps de cada etapa já
      concluída, identificando qual agente (Classificador ou humano) produziu cada resultado,
      quando aplicável.
- [ ] Um orçamento na fila de escalonamento assíncrona só é reprocessado mediante confirmação
      humana explícita; o histórico da tentativa anterior do Classificador permanece
      consultável (não é apagado).
- [ ] Nenhum orçamento é aprovado (avança como "classificado") com confiança inferior a 80% —
      abaixo do limiar, o único destino automático possível é a fila de escalonamento
      assíncrona de revisão humana.
- [ ] O tempo entre o recebimento do orçamento e a disponibilidade do resultado de
      classificação (por Classificador ou marcação de escalonamento) é de até 5 minutos no
      percentil 95 dos casos, sem depender de disponibilidade humana em tempo real.

## Fora de escopo desta spec

- Agente Extrator (extração de itens, preços, condições comerciais) — spec futura, Fase 01
  tardia ou Fase 02.
- Agente Validador de consistência de negócio (CNPJ, faixas de preço, campos obrigatórios) —
  Fase 02.
- Agente de Indexação e busca semântica — Fase 02.
- Agente Orquestrador de workflow completo (decisão de aprovar automaticamente, encaminhar
  para comprador, solicitar reenvio ao fornecedor) — esta spec cobre apenas o disparo
  automático do pipeline até a classificação (incluindo o escalonamento assíncrono), não a
  decisão de roteamento de negócio pós-classificação.
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
  suficiente — nunca "inventar" uma identificação para evitar acionar o escalonamento humano.
  Abaixo de 80% de confiança, o único resultado de negócio aceitável é encaminhar para a fila
  de escalonamento assíncrona de revisão humana.
- Referência de fornecedor autodeclarada pelo emissor nunca pode, isoladamente, elevar
  artificialmente a confiança reportada.
- **Tentativa única, sem reprocessamento automático por IA**: o Classificador tenta uma vez;
  não há um segundo agente de IA que reprocesse o resultado de baixa confiança (o Agente
  Revisor da versão 3 foi removido na versão 5). Baixa confiança vai direto para o humano.

### Fila de escalonamento assíncrona (revisão humana)

- **Papel de negócio**: primeira e única linha de tratamento dos casos que o Classificador não
  resolve com confiança suficiente. Não bloqueia o pipeline dos demais orçamentos.
- **Garantia vinculante**: nenhum orçamento nesta fila é autoaprovado por tempo de espera,
  volume da fila, ou qualquer outro motivo que não seja confirmação humana explícita.
- **Nunca substituída por automação**: a revisão humana é o backstop obrigatório; a decisão de
  produto (versão 5) foi eliminar o agente de IA intermediário, não a revisão humana.

### Considerações transversais (Classificador)

- **Dados sensíveis / PII envolvidos**: orçamentos podem conter dado de contato e dado
  comercial do fornecedor (não dado pessoal de consumidor final). Tratamento de PII (se
  houver) segue o Princípio VII da constituição do projeto (segurança e LGPD desde o desenho)
  — esta spec não introduz exceção a esse princípio.
- **Humano-no-loop**: "humano-no-loop" é satisfeito pela fila de escalonamento assíncrona como
  retaguarda humana. Em nenhum ponto uma classificação de baixa confiança avança como
  "classificado" sem que confiança ≥ 80% tenha sido efetivamente atingida pelo Classificador,
  ou sem chegar à fila de escalonamento.
- **Critério de comportamento aceitável**: taxa de classificação incorreta (fornecedor ou
  formato errado, mas reportada com confiança ≥ 80%) deve ser tratada como defeito de produto
  a ser monitorado — ver "Métricas de Avaliação Contínua". O Classificador nunca deve "chutar"
  silenciosamente; é preferível uma taxa maior de encaminhamento à fila de escalonamento do
  que uma taxa maior de erro silencioso.

## Métricas de Avaliação Contínua

- **Tempo até classificação disponível (p95)**: monitorar continuamente o tempo entre
  "orçamento recebido" e resultado de classificação disponível (por Classificador ou marcação
  de escalonamento). Sinal de alerta: p95 sustentado acima de 5 minutos dispara revisão desta
  spec quanto a escopo/capacidade.
- **Percentual de orçamentos sem status consultável**: deve ser 0% a qualquer momento após o
  recebimento. Qualquer ocorrência acima de 0% é incidente crítico, não apenas sinal de
  drift.
- **Taxa de escalonamento humano**: percentual de orçamentos que o Classificador não resolve
  com confiança ≥ 80% e que, portanto, seguem direto para a fila de escalonamento humano.
  Leading indicator de qualidade da classificação — sem meta rígida nesta spec, mas
  acompanhado desde o primeiro dia de operação.
- **Taxa e idade da fila de escalonamento assíncrona**: acompanhar volume e tempo de
  permanência dos orçamentos na fila. Crescimento sustentado sem capacidade humana de
  absorção é gatilho para reabrir esta spec (ex.: revisão do limiar de 80% ou necessidade de
  mais capacidade humana).
- **Taxa de erro silencioso (classificação incorreta reportada com confiança ≥ 80%)**: apurada
  por amostragem/feedback do gestor de compras quando disponível. Qualquer taxa detectada acima
  de zero é gatilho para reabrir esta spec e revisar a Camada de IA / Governança e o valor do
  limiar de confiança.
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
- P: Quem dispara o reprocessamento de um orçamento de baixa confiança? (revisado na versão 5)
  R: baixa confiança do Classificador vai diretamente para a fila de escalonamento assíncrona,
  reprocessada apenas por confirmação humana explícita. Não há Agente Revisor de IA (removido
  na versão 5). Nunca há autoaprovação silenciosa em nenhum ponto dessa cadeia.
- P: O identificador único é gerado pelo Gateway ou pode ser fornecido pelo emissor?
  R: sempre gerado pelo Gateway de Ingestão; referência externa do emissor é só metadado.
