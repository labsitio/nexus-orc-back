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
versao: 2
---

# Spec: Extração de Dados do Orçamento (Agente Extrator)

## Referência

- `docs/briefing-projeto.html` (Fase 01 · Fundação inclui "Agente de identificação de
  fornecedor/formato e extração"; `docs/apresentacao-executiva.html` roadmap: "Primeiros
  agentes de IA ativos: Classificador e Extrator").
- `docs/apresentacao-time.html` (Agente 2 · Extrator de Dados: entrada/saída, combinação de
  conversão de documento + LLM).
- Depende da spec 001 (`ingestao-classificacao-orcamentos`): só processa orçamentos já
  classificados com confiança suficiente pelo Classificador.
- `.specify/memory/constitution.md` v1.2.0 — Additional Constraint "Extração de documento
  prefere biblioteca open-source a serviço pago": ver "Nota de revisão" abaixo.

## Nota de revisão (versão 2)

Duas mudanças de escopo/custo decididas pelo produto, refletidas nesta revisão:

1. **Conversão de documento bruto**: a etapa de conversão do orçamento bruto (PDF, planilha,
   imagem etc.) para texto/markdown estruturável deve preferir a biblioteca open-source
   MarkItDown a um serviço de OCR pago gerenciado, por economia de custo operacional
   (constituição v1.2.0). Isso substitui qualquer menção anterior a um serviço de OCR pago
   como mecanismo padrão. O entendimento semântico do conteúdo já convertido continua sendo
   responsabilidade do Agente Extrator (IA generativa) — esta mudança é só sobre a etapa de
   conversão bruta, não sobre quem interpreta o conteúdo, e não altera nenhum critério de
   aceite de comportamento observável desta spec.
2. **Escopo exclusivamente backend**: esta spec nunca especificou comportamento de UI, mas a
   referência a "consumo do Portal do Gestor" em "Fora de escopo" foi generalizada para
   "consumidor externo de frontend", consistente com a nova Additional Constraint da
   constituição.

## Comportamento esperado (dado-quando-então)

### Extração bem-sucedida

- Dado um orçamento com fornecedor e formato identificados (evento de classificação com
  confiança ≥ 80%, conforme spec 001)
- Quando o Agente Extrator processa esse orçamento — convertendo o documento bruto para texto/
  markdown estruturável (preferencialmente via biblioteca open-source, conforme constituição)
  e então interpretando esse conteúdo com IA generativa
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
  estabelecido na spec 001 (escalonamento direto para a fila de revisão humana assíncrona,
  sem um segundo agente de IA), reaproveitando o mesmo mecanismo de governança, não um novo
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
      e escalonar diretamente para a fila de revisão humana (mesmo padrão da spec 001).
- [ ] O resultado de extração preserva vínculo rastreável com o orçamento bruto e com o
      resultado da classificação, sem sobrescrever nenhum dos dois.
- [ ] A consulta de status de um orçamento passa a refletir a etapa "extraído" (ou pendência
      de extração) após o processamento desta capacidade.
- [ ] A etapa de conversão de documento bruto usa por padrão o mecanismo open-source definido
      pela constituição (MarkItDown), reservando serviço pago apenas para os casos de exceção
      justificada previstos na constituição (ex.: formato de documento não suportado) — sem
      alterar o comportamento observável de extração em si.

## Fora de escopo desta spec

- Validação de consistência de negócio sobre os dados extraídos (CNPJ, faixas de preço,
  coerência de prazos) — spec própria (Validador), Fase 02.
- Conversão de moeda estrangeira ou normalização de unidades de medida além do que o
  fornecedor já declarou — assumido fora de escopo até haver demanda real registrada.
- Extração de conteúdo manuscrito ou de formato não suportado de forma confiável pelo
  mecanismo de conversão padrão (MarkItDown) — tratado como caso de baixa confiança (cai no
  fluxo de exceção) ou, em último caso, como exceção justificada de uso de serviço pago
  conforme a constituição; não é uma capacidade própria desta spec.
- Qualquer interface de correção manual dos campos não extraídos — responsabilidade de um
  consumidor externo de frontend, fora do escopo deste time; esta spec entrega apenas o dado/
  evento consultável do campo marcado como "não extraído".

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
  exceção já estabelecido na spec 001 (escalonamento direto para fila de revisão humana
  assíncrona, sem agente revisor de IA) — o campo obrigatório sem confiança suficiente leva o
  orçamento direto para a fila humana, satisfazendo o Princípio IV (exceção nunca silenciosa).
- **Dados sensíveis**: mesmas considerações de PII/dado comercial sensível da spec 001
  (Princípio VII da constituição).

## Métricas de Avaliação Contínua

- **Percentual de campos extraídos corretamente sem correção humana**: leading indicator
  monitorado desde o primeiro dia; sem meta rígida nesta spec.
- **Tempo até extração disponível (p95)**: sinal de alerta se sustentado acima de 5 minutos.
- **Taxa de campos marcados "não extraído"**: acompanhar tendência; alta taxa sustentada é
  gatilho de investigação de capacidade do Extrator, não necessariamente falha.
- **Percentual de conversões que exigiram serviço pago como exceção (não MarkItDown)**:
  leading indicator de aderência à Additional Constraint de custo da constituição; alta taxa
  sustentada é gatilho de investigação, não necessariamente falha.
- **Responsável**: produto + dado/observabilidade da plataforma, mesmo modelo da spec 001.

## Perguntas resolvidas (decisão autônoma, não-bloqueante)

- P: O tratamento de baixa confiança em campo extraído deve criar um novo mecanismo de
  exceção próprio desta spec? R: Não — reaproveita o mecanismo já estabelecido na spec 001
  (escalonamento direto para fila de revisão humana assíncrona, sem agente revisor de IA), por
  consistência de produto. Decisão de baixo risco e reversível (é reuso de padrão, não invenção
  de novo).

## Perguntas resolvidas (speckit-clarify — versão 2)

- P: Qual mecanismo de conversão de documento bruto para texto deve ser o padrão desta spec?
  R: Biblioteca open-source MarkItDown, por decisão de produto refletida na constituição
  v1.2.0 (Additional Constraint de custo). Serviço pago gerenciado só como exceção
  justificada por escrito. Esta é uma decisão de negócio (custo operacional), não uma escolha
  de implementação — por isso registrada na spec, mesmo sem detalhar como o `arquiteto-back`
  vai integrá-la.
