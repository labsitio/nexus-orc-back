<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Rationale: MINOR bump — Princípio IV ("Exceção Nunca É Silenciosa") teve sua redação
expandida para reconhecer explicitamente que "acionar revisão humana" pode ser satisfeito por
uma cadeia de (a) agente revisor de IA como primeira linha automática e (b) fila de
escalonamento assíncrona como retaguarda humana — em vez de exigir humano em tempo real como
única implementação válida. O princípio em si NÃO foi enfraquecido: a garantia vinculante de
"nunca autoaprovação silenciosa, nunca descarte, nunca bloqueio dos demais documentos"
permanece intacta e agora explícita para ambos os padrões de implementação. Motivado pela
spec `specs/001-ingestao-classificacao-orcamentos/spec.md` v3, onde não há humano disponível
em tempo real na operação real.

Modified principles:
- IV. Exceção Nunca É Silenciosa — redação expandida (não redefinida) para cobrir "agente
  revisor de IA + fila de escalonamento assíncrona" como implementação válida do requisito de
  humano-no-loop residual.

Added sections: nenhuma nova seção.
Removed sections: nenhuma.

Templates requiring updates:
- .specify/templates/plan-template.md ✅ nenhuma mudança necessária.
- .specify/templates/spec-template.md ✅ nenhuma mudança necessária.
- .specify/templates/tasks-template.md ⚠ pending — mesmo status da v1.0.0, ainda não revisado.
- specs/001-ingestao-classificacao-orcamentos/spec.md ✅ já atualizado para v3, consistente
  com esta emenda.

Follow-up TODOs: nenhum novo.
-->

# Nexo Constitution

## Core Principles

### I. Rastreabilidade Ponta a Ponta (NON-NEGOTIABLE)

Todo orçamento processado pela plataforma MUST manter uma trilha auditável e completa de:
origem (fornecedor, canal de entrada), timestamp de cada etapa do pipeline (recebido →
fornecedor/formato identificado → extraído → validado → indexado → disponível/arquivado), e
a decisão tomada por cada agente que tocou o documento. Esta trilha MUST ser reconstruível a
qualquer momento a partir do identificador do documento, sem depender de log efêmero.

Rationale: rastreabilidade é requisito de auditoria e compliance declarado no briefing do
projeto, não um "nice-to-have" de observabilidade — é o que torna o Portal de Acompanhamento
e qualquer exportação de relatório de auditoria confiáveis.

### II. Desacoplamento por Eventos de Domínio (NON-NEGOTIABLE)

Agentes e serviços do pipeline MUST se comunicar exclusivamente por eventos de domínio
publicados em um barramento (ex.: "orçamento recebido", "fornecedor/formato identificado",
"extraído", "validado", "indexado", "exceção detectada"). Nenhum componente MUST chamar
diretamente a implementação interna de outro. Um agente sob carga alta MUST NOT bloquear o
progresso dos demais documentos em processamento.

Rationale: é o mecanismo que garante escalabilidade independente por agente e resiliência a
picos de volume, conforme decidido na arquitetura macro do produto.

### III. Dado Bruto Imutável

O arquivo original de um orçamento, uma vez recebido, MUST NUNCA ser sobrescrito. Cada etapa
de processamento MUST gravar uma nova representação/versão do dado, preservando o vínculo
explícito com a origem. Nenhuma operação de escrita MUST apagar ou substituir uma versão
anterior do histórico de processamento de um documento.

Rationale: sustenta a rastreabilidade (Princípio I) e a possibilidade de reprocessamento após
correção de exceção sem perda de evidência.

### IV. Exceção Nunca É Silenciosa

Qualquer inconsistência detectada por qualquer agente (dados obrigatórios ausentes, preço fora
de faixa esperada, CNPJ inválido, formato não identificado com confiança suficiente etc.)
MUST gerar um evento de exceção explícito. O pipeline MUST NOT falhar silenciosamente, MUST
NOT descartar o documento, MUST NOT autoaprovar o resultado sem confiança suficiente, e uma
exceção em um documento MUST NOT travar o processamento dos demais documentos na fila.

O tratamento de "humano-no-loop" exigido por esta constituição MUST ser satisfeito por pelo
menos uma das seguintes implementações, isoladas ou em cadeia:
(a) escalonamento direto para fila de revisão humana; ou
(b) uma ou mais camadas de agente(s) revisor(es) de IA que tentam resolver a exceção com
contexto adicional antes de, em caso de insucesso, encaminhar para uma fila de escalonamento
assíncrona de revisão humana.

Em qualquer uma das implementações acima, MUST permanecer verdadeiro que: nenhum agente
revisor pode reportar confiança suficiente artificialmente para evitar o escalonamento; a
fila de escalonamento (síncrona ou assíncrona) nunca autoaprova por tempo de espera, volume
ou exaustão de tentativas; e o histórico de todas as tentativas (agente original, agente(s)
revisor(es), decisão humana) permanece consultável, sem sobrescrever tentativas anteriores.

Rationale: o time de compras precisa confiar que "sem alerta" significa "processado", nunca
"perdido silenciosamente" — condição central de confiança operacional do produto. A
disponibilidade de humano em tempo real não é assumida como premissa operacional; o princípio
exige apenas que a exceção nunca seja invisível ou autoaprovada sem base suficiente, não que
um humano precise estar sempre disponível de imediato para tratá-la.

### V. IA Generativa Como Motor de Entendimento, Não Regras Fixas por Fornecedor

A identificação de fornecedor/formato, extração e validação de conteúdo MUST ser resolvida por
agentes de IA generativa (Amazon Bedrock) capazes de lidar com a variedade real de layouts, e
MUST NOT depender de regras fixas ("if/else" por fornecedor) como mecanismo primário de
entendimento de conteúdo. Regras de negócio determinísticas são aceitáveis apenas na camada de
validação de consistência (ex.: faixa de preço, formato de CNPJ), nunca como substituto do
entendimento de conteúdo em si.

Rationale: é a proposta de valor central do produto — processar a variedade real de
fornecedores sem engessamento por layout, conforme o briefing.

### VI. Serverless-First / Custo Sob Demanda

Toda decisão de arquitetura MUST preferir serviços gerenciados e capacidade elástica sob
demanda a capacidade fixa reservada, exceto quando uma limitação técnica concreta justificar o
contrário (a ser registrado explicitamente como exceção, com justificativa, no plano técnico
correspondente). Novo componente de infraestrutura que introduza servidor fixo ocioso como
padrão MUST ser justificado por escrito antes de aprovação.

Rationale: modelo de custo pay-as-you-go é compromisso assumido no briefing executivo do
projeto e sustenta a viabilidade econômica do produto em fase de adoção.

### VII. Segurança e LGPD Desde o Desenho

Toda feature que manipule dado de orçamento MUST considerar, desde a especificação: criptografia
em trânsito e em repouso, menor privilégio de acesso, anonimização de dado pessoal fora do fluxo
estritamente necessário, política de retenção configurável por categoria de documento, e suporte
a direito ao esquecimento sob demanda. Nenhuma spec de feature que envolva dado de fornecedor ou
dado pessoal MUST ser aprovada para arquitetura sem essas considerações endereçadas.

Rationale: orçamentos contêm dado comercial sensível e dado pessoal de contato — tratado como
requisito de arquitetura desde a concepção do produto, não como camada adicional posterior.

### VIII. Roadmap em 3 Fases é Vinculante Para Sequenciamento

O sequenciamento de entregas MUST respeitar: Fase 01 · Fundação (canais de ingestão, pipeline
básico de eventos, Agente Classificador) antecede Fase 02 · Inteligência (Agente Validador,
indexação e busca semântica, automação de workflows/integrações, Portal do Gestor MVP), que
antecede Fase 03 · Escala & Produto (Portal completo multi-tenant, hardening de segurança,
otimização contínua de custo). Nenhuma spec MUST tratar uma capacidade de fase posterior como
pré-requisito bloqueante de uma entrega de fase anterior.

Rationale: é o plano de entrega macro já pactuado no briefing executivo do projeto; specs de
feature devem se encaixar nesse sequenciamento, não redefini-lo.

## Additional Constraints

- **4 canais de ingestão fixos**: portal web, API REST, SFTP e aplicativo mobile convergem
  para um único ponto de entrada (Gateway de Ingestão). Qualquer novo canal de ingestão futuro
  MUST passar pelo mesmo gateway único e pelo mesmo contrato de evento de "orçamento recebido"
  — não MUST introduzir um caminho de entrada paralelo que não gere o evento padrão.
- **5 agentes especializados, papéis fixos no domínio central**: Classificador (fornecedor e
  formato), Extrator (dados estruturados), Validador (consistência), Indexação (busca
  semântica), Orquestrador (workflow/roteamento). Uma nova capacidade de IA MUST ser modelada
  como extensão de um desses papéis ou como um agente adicional explícito — não MUST ser
  absorvida silenciosamente na responsabilidade de um agente existente sem revisão de escopo.
  Agentes revisores de exceção (ver Princípio IV) são um exemplo de agente adicional explícito
  válido segundo esta regra.
- **Multi-tenant é requisito de Fase 03**: nenhuma decisão de modelagem de dados na Fase 01/02
  MUST impedir a introdução de isolamento por rede varejista (tenant) na Fase 03 — mas
  implementar multi-tenancy completo antes da Fase 03 não é obrigatório.

## Development Workflow

- Toda feature nova (não CRUD trivial) segue Spec-Driven Development: `spec.md` clarificado
  antes de `plan.md`/`tasks.md`. Especificação de comportamento (produto) e desenho de
  arquitetura (Bounded Contexts, Agregados, Domain Events, stack) são responsabilidades
  separadas e sequenciais — a primeira nunca decide a segunda.
- Toda spec de feature que envolva agente de IA MUST preencher explicitamente papel do agente,
  ações permitidas/proibidas em termos de negócio, e requisitos de governança (dado sensível,
  humano-no-loop, escalonamento) antes do handoff para arquitetura.
- Revisão de conformidade com esta constituição é obrigatória no gate "Constitution Check" de
  `plan.md` para toda feature nova.

## Governance

Esta constituição prevalece sobre preferência individual de arquitetura, stack ou
implementação. Qualquer conflito entre uma decisão de plano/tarefa e um princípio aqui descrito
MUST ser resolvido a favor da constituição, ou a constituição MUST ser emendada explicitamente
antes de a exceção ser aceita.

**Processo de emenda**: qualquer emenda MUST ser proposta com racional escrito, versionada
segundo semver (MAJOR: remoção/redefinição incompatível de princípio; MINOR: novo princípio ou
expansão material; PATCH: clarificação/redação), e registrada no Sync Impact Report no topo
deste arquivo. Emendas que alterem Princípios I, II, III ou IV (rastreabilidade, eventos,
imutabilidade, tratamento de exceção) exigem justificativa explícita de impacto em auditoria e
compliance antes de aprovação.

**Revisão de conformidade**: todo `plan.md` gerado por `speckit-plan` MUST incluir uma seção
"Constitution Check" que valide a feature contra os princípios acima antes de avançar para
desenho detalhado.

**Version**: 1.1.0 | **Ratified**: 2026-07-29 | **Last Amended**: 2026-07-29
