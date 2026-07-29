---
feature: orquestracao-workflow-integracoes
status: clarified
fase_roadmap: Fase 02
envolve_ia_ou_agentes: true
metricas:
  - nome: Percentual de orçamentos com decisão de workflow disponível sem intervenção manual
    baseline: 0% (não existe decisão automatizada hoje)
    alvo: a definir após operação real; leading indicator
  - nome: Percentual de decisões de workflow escalonadas para o comprador (baixa confiança do Orquestrador)
    baseline: 0% (capacidade nova)
    alvo: a definir após operação real; leading indicator
  - nome: Tempo entre validação disponível e decisão de workflow publicada (p95)
    baseline: horas/dias (decisão manual hoje)
    alvo: até 5 minutos (p95) para decisões resolvidas pelo Orquestrador
personas: [gestor-de-compras, comprador-responsavel, fornecedor, sistema-orquestrador]
depende_de: [validacao-consistencia-orcamentos]
versao: 4
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
- `specs/001-ingestao-classificacao-orcamentos/spec.md` v5 e `.specify/memory/constitution.md`
  v1.2.0 (Princípio IV, Additional Constraints) — padrão de humano-no-loop reaproveitado nesta
  spec e escopo exclusivamente backend, ver "Nota de revisão" abaixo.

## Nota de revisão (versão 2)

A questão bloqueante original desta spec ("qual critério determina aprovação automática sem
revisão de comprador humano") foi resolvida pelo produto na versão 2 aplicando o padrão de
duas linhas então vigente (Agente Revisor de IA + fila de escalonamento). Esse padrão de duas
linhas foi **revisado na versão 4** (ver nota abaixo) — o Agente Revisor de IA foi removido. A
régua de decisão permanece a **confiança do resultado de roteamento**, não uma regra de
negócio fixa sobre o conteúdo do orçamento. Esta nota permanece como registro histórico.

## Nota de revisão (versão 3)

Escopo do time confirmado como exclusivamente backend (constituição v1.2.0). A referência a
"consumo do Portal do Gestor (specs 006/007)" em "Fora de escopo" apontava para specs de
frontend que foram retiradas/reduzidas do catálogo deste time — generalizada para "consumidor
externo de frontend", sem apontar para arquivo específico. Nenhum comportamento de backend
foi alterado.

## Nota de revisão (versão 4)

O **Agente Revisor de IA de workflow** introduzido na versão 2 foi **removido**. Decisão de
produto (mesma aplicada às specs 001 e 002): um segundo agente de IA no caminho de exceção
agrega custo e latência sem garantia de resolver o que o papel fixo (Orquestrador) já não
resolveu. O novo padrão: o Orquestrador faz **uma** tentativa; se a confiança do resultado de
roteamento fica abaixo do limiar, o orçamento é escalonado **diretamente** para a fila de
decisão humana do comprador responsável. Todos os cenários, critérios de aceite e a Camada de
IA / Governança que descreviam o Agente Revisor foram reescritos para a linha única
Orquestrador → comprador. A garantia NON-NEGOTIABLE de "nunca autoaprovar por
exaustão/tempo/volume" e todas as invariantes de negócio (nunca aprovar sem validação
bem-sucedida, reenvio sempre fundamentado, critério auditável obrigatório) permanecem intactas.

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

### Decisão sem confiança suficiente — escalonamento assíncrono para o comprador

- Dado um orçamento validado cujo resultado de roteamento não atinge confiança suficiente
- Quando o Orquestrador não consegue decidir entre as três ações possíveis com segurança
- Então o orçamento é encaminhado diretamente para a fila de escalonamento assíncrona de
  decisão humana (comprador responsável) — nunca descartado, nunca travado silenciosamente e
  nunca aprovado sem que o Orquestrador tenha reportado confiança suficiente
- E esse encaminhamento não bloqueia o processamento de nenhum outro orçamento no pipeline
- E o comprador, ao revisar e confirmar explicitamente a ação correta (por qualquer canal que
  consuma o contrato de API/evento desta spec), tem essa decisão registrada com o mesmo peso
  de uma decisão automática, preservando o histórico da tentativa anterior do Orquestrador

### Solicitação de reenvio ao fornecedor

- Dado um orçamento cuja validação aponta ausência de dado essencial que não pode ser suprido
  automaticamente (ex.: item sem preço)
- Quando o Orquestrador decide, com confiança suficiente, que o caminho correto é solicitar
  reenvio
- Então essa decisão é registrada e disparada como evento, permitindo que uma notificação seja
  enviada ao fornecedor (mecanismo de notificação em si é responsabilidade de spec de
  integração/canal, não desta spec)

### Integração externa disparada pela decisão

- Dado um orçamento cuja decisão de workflow (por Orquestrador ou comprador via fila de
  escalonamento) exige comunicação com um sistema externo da rede varejista (ex.: sistema de
  compras já em uso)
- Quando essa decisão é tomada
- Então um evento de integração é publicado no barramento, desacoplado do sistema externo
  específico (nenhum dos decisores conhece o contrato do sistema parceiro, apenas publica a
  intenção de integração)

### Rastreabilidade da decisão

- Dado qualquer orçamento que passou pelo Orquestrador
- Quando alguém consulta o histórico desse orçamento
- Então a decisão final tomada (aprovado / encaminhado / reenvio solicitado), qual camada a
  produziu (Orquestrador ou comprador via escalonamento), o critério/confiança que a motivou, e
  o timestamp ficam registrados e consultáveis, sem possibilidade de sobrescrita de nenhuma
  tentativa anterior

## Critérios de aceite (testáveis)

- [ ] Todo orçamento validado recebe uma decisão final de workflow (uma das três ações),
      produzida pelo Orquestrador ou pelo comprador via fila de escalonamento — nunca ficando
      "parado" sem decisão.
- [ ] Nenhum orçamento é aprovado automaticamente (ação "aprovar") sem que o Orquestrador tenha
      reportado confiança suficiente para essa decisão específica; abaixo da confiança
      suficiente, o único destino automático possível é a fila de escalonamento assíncrona para
      o comprador.
- [ ] A decisão final e a camada que a produziu (Orquestrador / comprador) ficam registradas de
      forma consultável e imutável no histórico do orçamento, incluindo o histórico da tentativa
      do Orquestrador quando a decisão final for do comprador.
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
- Valor numérico exato do limiar mínimo de confiança do Orquestrador — não fixado nesta spec;
  recomenda-se, por consistência, adotar o mesmo valor de 80% já definido na spec 001, mas a
  calibração final é parâmetro operacional, ajustável sem mudança de comportamento de produto.

## Camada de IA / Governança

### Agente Orquestrador

- **Papel**: consolida o resultado de Classificador, Extrator e Validador e decide o próximo
  passo de negócio (aprovar / encaminhar / solicitar reenvio), sempre acompanhado de um nível
  de confiança. NUNCA decide ele mesmo o conteúdo de fornecedor/formato/extração/validação
  (isso já foi decidido pelos agentes anteriores) — atua estritamente sobre o resultado
  consolidado.
- **Ação proibida em termos de negócio**: nunca aprovar automaticamente um orçamento que não
  tenha passado por validação bem-sucedida (spec 003); nunca reportar confiança suficiente
  artificialmente para evitar o escalonamento ao comprador; nunca decidir integração externa
  sem publicar o evento correspondente. Esta é a restrição de maior risco financeiro de toda a
  cadeia de agentes do produto, por decidir diretamente sobre aprovação de compra.
- **Tentativa única, sem reprocessamento automático por IA**: o Orquestrador tenta uma vez; não
  há um segundo agente de IA que reprocesse a decisão de baixa confiança (o Agente Revisor de
  Workflow da versão 2 foi removido na versão 4). Baixa confiança escala direto para o comprador.

### Fila de escalonamento assíncrona (decisão de workflow — comprador)

- **Papel de negócio**: primeira e única linha de tratamento das decisões de roteamento que o
  Orquestrador não consegue tomar com confiança suficiente. Não bloqueia o pipeline dos demais
  orçamentos.
- **Garantia vinculante**: nenhuma decisão de aprovação de compra nesta fila é tomada
  automaticamente por tempo de espera, volume da fila, ou qualquer motivo que não seja
  confirmação explícita do comprador responsável.
- **Nunca substituída por automação**: a decisão humana do comprador é o backstop obrigatório;
  a decisão de produto (versão 4) foi eliminar o agente de IA intermediário, não a revisão
  humana.

### Considerações transversais

- **Dados sensíveis**: mesmas considerações das specs anteriores (Princípio VII da
  constituição).
- **Consistência normativa**: a linha única Orquestrador → fila de escalonamento humano do
  comprador é o mesmo padrão já estabelecido nas specs 001 e 002 (após a remoção dos agentes
  revisores de IA) e explicitamente permitido pelo Princípio IV da constituição v1.2.0 como
  implementação válida de humano-no-loop — nenhuma nova capacidade de governança fora desse
  padrão foi introduzida.

## Métricas de Avaliação Contínua

- **Tempo até decisão de workflow disponível (p95)**: sinal de alerta se sustentado acima de
  5 minutos para decisões resolvidas pelo Orquestrador.
- **Distribuição das três decisões possíveis** (aprovado automaticamente / encaminhado /
  reenvio solicitado) por camada decisora (Orquestrador / comprador): acompanhar tendência;
  mudança abrupta é gatilho de investigação.
- **Percentual de decisões escalonadas ao comprador (baixa confiança do Orquestrador)**:
  leading indicator de qualidade da decisão automática, sem meta rígida nesta spec.
- **Taxa e idade da fila de escalonamento assíncrona de decisão de workflow**: crescimento
  sustentado sem capacidade humana de absorção é gatilho para reabrir esta spec.
- **Taxa de decisão de aprovação automática revertida posteriormente por um comprador**:
  qualquer taxa acima de zero é sinal crítico de recalibração do limiar de confiança do
  Orquestrador — esta é a métrica de maior criticidade de negócio de toda a cadeia, por afetar
  diretamente decisão de compra.
- **Responsável**: produto (gerente de produto) em conjunto com o comprador responsável e
  dado/observabilidade da plataforma.

## Perguntas resolvidas (speckit-clarify)

- P: Qual critério determina se um orçamento pode ser aprovado automaticamente, sem revisão
  de um comprador humano?
  R: Nenhuma regra de negócio fixa sobre o conteúdo do orçamento (não é "nunca automático", nem
  "limite de valor", nem "fornecedor confiável" isoladamente). A régua é a confiança do
  resultado de roteamento: o Orquestrador decide automaticamente quando tem confiança
  suficiente; quando não tem, a decisão vai diretamente para a fila de escalonamento assíncrona
  do comprador responsável (revisado na versão 4 — não há mais Agente Revisor de IA
  intermediário). Nunca há aprovação automática por exaustão de tentativas, tempo ou volume de
  fila. É o mesmo padrão de linha única (papel fixo → humano) já vigente nas specs 001 e 002 e
  coberto pelo Princípio IV da constituição.
