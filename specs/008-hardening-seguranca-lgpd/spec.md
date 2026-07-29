---
feature: hardening-seguranca-lgpd
status: clarified
fase_roadmap: Fase 03
envolve_ia_ou_agentes: false
metricas:
  - nome: Tempo de atendimento a solicitação de direito ao esquecimento
    baseline: processo não existe formalmente hoje
    alvo: dentro do prazo definido pela política de retenção (assumido 30 dias corridos, ver Assunções)
  - nome: Incidentes de exposição de dado fora do fluxo estritamente necessário
    baseline: desconhecido
    alvo: 0, sempre — guardrail não-negociável (Princípio VII da constituição)
personas: [gestor-de-compras, fornecedor]
depende_de: []
versao: 1
---

# Spec: Hardening de Segurança e Conformidade LGPD

## Referência

- `docs/briefing-projeto.html` (Fase 03 · Escala & Produto: "Hardening de segurança").
- `docs/apresentacao-time.html` (seção Segurança: criptografia, identidade e acesso, trilha de
  auditoria, LGPD — anonimização, retenção configurável, direito ao esquecimento; segregação
  de ambientes; borda e detecção de ameaças).
- Constituição do projeto, Princípio VII (Segurança e LGPD Desde o Desenho) — esta spec é a
  formalização observável desse princípio como comportamento de produto, não uma nova regra.

## Comportamento esperado (dado-quando-então)

### Direito ao esquecimento

- Dado um titular de dado pessoal presente em um orçamento processado (dado de contato do
  fornecedor, por exemplo)
- Quando uma solicitação válida de exclusão/anonimização é registrada
- Então o dado pessoal correspondente é anonimizado ou removido dentro do prazo definido pela
  política de retenção, preservando o restante do histórico de rastreabilidade (Princípio I)
  sem o dado pessoal específico

### Retenção configurável por categoria

- Dado diferentes categorias de documento processado pela plataforma
- Quando a política de retenção é aplicada
- Então o prazo de retenção é configurável por categoria, sem exigir mudança de código para
  ajustar o prazo

### Segregação de ambientes

- Dado ambientes de desenvolvimento, homologação e produção
- Quando qualquer pessoa ou processo acessa dado de orçamento
- Então dado real de produção nunca está presente ou acessível em ambiente de desenvolvimento
  ou homologação

### Trilha de auditoria de acesso

- Dado qualquer ação sobre dado de orçamento ou sobre a infraestrutura que o sustenta
- Quando essa ação ocorre
- Então ela é registrada de forma correlacionável ao identificador do documento, permitindo
  reconstrução completa de "quem fez o quê, quando" — reforço direto do Princípio I

## Critérios de aceite (testáveis)

- [ ] Uma solicitação de direito ao esquecimento resulta na anonimização/remoção do dado
      pessoal correspondente dentro do prazo definido, sem apagar o restante do histórico de
      rastreabilidade do orçamento associado.
- [ ] Toda categoria de documento tem um prazo de retenção configurável, ajustável sem
      deployment de código.
- [ ] Nenhum dado real de produção é encontrado em ambiente de desenvolvimento ou
      homologação, em nenhuma auditoria de configuração.
- [ ] Toda ação sobre dado de orçamento ou infraestrutura correlata é reconstruível a partir do
      identificador do documento.

## Fora de escopo desta spec

- Certificações formais de terceiros (ISO 27001, SOC 2) — mencionadas como possíveis
  iniciativas futuras, não como requisito desta spec.
- Testes de penetração específicos — atividade operacional recorrente, não comportamento de
  produto a especificar aqui.
- Ferramenta ou processo específico de detecção de ameaças (arquitetura decide o mecanismo;
  esta spec exige apenas que ele exista e funcione).

## Métricas de Avaliação Contínua

- **Tempo de atendimento a solicitação de esquecimento**: sinal de alerta se sustentadamente
  acima do prazo definido pela política de retenção.
- **Incidentes de exposição de dado fora do fluxo necessário**: guardrail crítico — qualquer
  ocorrência é incidente grave, dispara revisão imediata desta spec e da arquitetura.
- **Responsável**: produto + segurança/compliance da plataforma.

## Perguntas resolvidas / Assunções (decisão autônoma, não-bloqueante)

- P: Qual o prazo exato para atendimento de uma solicitação de direito ao esquecimento?
  R: Assumido 30 dias corridos como referência de mercado comum para atendimento a esse tipo
  de solicitação, na ausência de definição explícita na documentação macro. Documentado como
  assunção, não como decisão regulatória definitiva — recomenda-se validação com jurídico/
  compliance antes da implementação final; não bloqueia a especificação de comportamento
  porque o valor é um parâmetro ajustável, não uma decisão estrutural irreversível.
