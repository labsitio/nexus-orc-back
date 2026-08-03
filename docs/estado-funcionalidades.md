# Estado das funcionalidades — Nexo

Inventário de produto: o que está pronto vs. o que falta, por spec. Fonte:
`specs/00X-*/spec.md` + `tasks.md`, código em `src/`, issues abertas no GitHub
(`labsitio/nexus-orc-back`), `specs/001-.../bugs/BUG-001.md`. Gerado em
2026-08-03, branch `bug/001-presigned-checksum`.

**Nota de método**: contagem de issues abertas via GitHub REST API paginada
(sem `gh` CLI disponível neste ambiente). Números por spec abaixo são
aproximados (amostragem paginada, sujeita a arredondamento) — exceto os
números de issue citados explicitamente (#576–#580, #582–#587, #588, #589,
#590, #592, #385), que foram confirmados de forma literal na resposta da API.

## Visão geral

Quando completo, o produto recebe orçamento de fornecedor por 4 canais
(portal web, API REST, SFTP, app mobile), identifica fornecedor/formato,
extrai itens e condições comerciais, valida consistência de negócio, indexa
para busca semântica e decide o roteamento de workflow (aprovar, escalonar a
comprador, ou solicitar reenvio) — tudo rastreável, multi-tenant e compatível
com LGPD, num Portal de Acompanhamento do gestor de compras.

## 001 · Ingestão e Classificação

Objetivo: receber orçamento por qualquer canal e identificar fornecedor/
formato automaticamente, sem triagem manual, em até 5 min (p95).
Tasks: 44/60 concluídas (`specs/001-ingestao-classificacao-orcamentos/tasks.md`).

| User story (cenário da spec) | Status | O que falta |
|---|---|---|
| Ingestão multi-canal (portal/API/SFTP/mobile) | PARCIAL | Código dos 4 canais existe (`upload-url.controller.ts`, `sftp-upload.handler.ts`), mas **BUG-001**: URL presigned de upload devolve 400 no `PUT` real para os 3 canais que passam por presigned URL (portal, API, mobile) — `S3ArmazenamentoBrutoGateway.gerarUrlUpload` assina com checksum de corpo vazio. Só SFTP não é afetado. |
| Independência de canal | PARCIAL | Mesma causa acima: comportamento pós-recebimento não é observável nos 3 canais afetados porque o recebimento nem completa. |
| Classificação de fornecedor/formato | PRONTO (com ressalva) | `classificar-orcamento.ts` + `bedrock-classificador.gateway.ts` + `markitdown-conversao.acl.ts` implementados. Ressalva: a conversão de documento (MarkItDown) real via Lambda Python não existe — issues #588/#590 — hoje é stub em execução local. |
| Baixa confiança — escalonamento humano | PRONTO | `revisao-humana.controller.ts`, `confirmar-revisao-humana.ts`, evento `orcamento-escalonado-revisao-humana.event.ts`. |
| Rastreamento de status | PRONTO | `status.controller.ts` + `consultar-status-orcamento.ts`. |
| Reprocessamento e resolução de exceção | PRONTO | `confirmar-revisao-humana.ts` + evento `orcamento-reclassificado-revisao-humana.event.ts`, preserva histórico. |

Lacuna transversal específica desta spec: nenhum handler Lambda de produção
existe para nenhum destes casos de uso (ver "Lacunas transversais").

## 002 · Extração de Dados

Objetivo: extrair itens, preço, condições de negociação de orçamento
classificado, sem inventar valor quando confiança é insuficiente.
Tasks: 35/41 concluídas.

| User story | Status | O que falta |
|---|---|---|
| Extração bem-sucedida | PARCIAL | `extrair-dados-orcamento.ts` + `bedrock-extrator.gateway.ts` implementados; depende de (a) BUG-001 resolvido para receber orçamento pelos 3 canais afetados, e (b) Lambda MarkItDown real (issue #588/#590) — hoje conversão é stub em dev local, não código de produção. |
| Campo obrigatório ausente/baixa confiança | PRONTO | Evento `extracao-escalonada-revisao-humana.event.ts`, mesmo padrão de exceção de 001. |
| Preservação de vínculo com classificação/bruto | PRONTO | `referencia-classificacao.vo.ts`, `referencia-s3.vo.ts`. |

## 003 · Validação de Consistência

Objetivo: aplicar regras de negócio (CNPJ, faixa de preço, validade) sobre
orçamento extraído, sem aprovar com inconsistência pendente.
Tasks: 38/50 concluídas.

| User story | Status | O que falta |
|---|---|---|
| Validação bem-sucedida | PRONTO | `validar-orcamento.ts` + `regras-consistencia.ts`. |
| Inconsistência detectada | PRONTO | `inconsistencia-detectada.vo.ts` + evento `orcamento-inconsistencia-detectada.event.ts`. |
| Faixas de preço configuráveis por categoria | PARCIAL — achado | `drizzle-faixa-preco.repository.ts` **já existe no código**, mas a issue #385 (T023 — mesmo entregável) segue aberta no GitHub. Não verificado se é apenas pendência administrativa (fechar issue) ou se falta algo no repositório; reportar para confirmação. |

## 004 · Indexação e Busca Semântica

Objetivo: tornar orçamento validado pesquisável por linguagem natural, sem
bloquear o pipeline em caso de falha de indexação.
Tasks: 34/50 concluídas.

| User story | Status | O que falta |
|---|---|---|
| Indexação automática | PRONTO | `indexar-orcamento.ts`, `bedrock-embedding.gateway.ts`/`.acl.ts`, evento `orcamento-indexado.event.ts`. |
| Busca em linguagem natural | PARCIAL | Caso de uso `buscar-orcamentos.ts` e gateway `agente-interpretador-consulta.gateway.ts` existem, mas **não há controller HTTP de busca** em `src/bounded-contexts/busca-indexacao/interface/http/` — só existe `indexacao-status.controller.ts`. Usuário não consegue chamar busca via API hoje. |
| Falha de indexação não bloqueia pipeline | PRONTO | Evento `falha-indexacao-detectada.event.ts`. |

## 005 · Orquestração de Workflow e Integrações

Objetivo: decidir automaticamente entre aprovar, encaminhar a comprador ou
solicitar reenvio ao fornecedor, com rastreabilidade da decisão.
Tasks: 23/52 concluídas — a menor proporção de conclusão entre as specs de
negócio (001–005).

| User story | Status | O que falta |
|---|---|---|
| Decisão com confiança suficiente | PARCIAL | Domínio pronto (`decisao-workflow.aggregate.ts`, `bedrock-decisao-workflow.acl.ts`, `bedrock-orquestrador.gateway.ts`), mas **camada de aplicação quase vazia**: só existe `registrar-contexto-classificacao.ts`; o caso de uso central `ConsolidarEDecidirWorkflow` não foi encontrado no código (issues #246/T040, #248/T042 abertas). |
| Escalonamento para comprador | NÃO INICIADO | Sem caso de uso de registro de decisão humana no código; `src/bounded-contexts/orquestracao/interface/http/` está vazio (só `.gitkeep`) — nenhum endpoint de decisão humana existe (issue #250/T044 aberta). |
| Solicitação de reenvio ao fornecedor | NÃO INICIADO | Evento `orcamento-reenvio-solicitado.event.ts` existe no domínio, sem caso de uso que o publique. |
| Integração externa disparada pela decisão | NÃO INICIADO | Evento `integracao-externa-solicitada.event.ts` existe no domínio; publicação condicionada (`requerIntegracaoExterna`) ainda não implementada (issues #253/T047, #255/T049 abertas). |
| Rastreabilidade da decisão | NÃO INICIADO | Sem controller de consulta de status/histórico de decisão de workflow — interface HTTP vazia. |

## 007 · Isolamento Multi-tenant

Objetivo: nenhuma consulta/busca/exportação vaza dado entre tenants;
retrofit de `tenantId` em specs 001–005.
Tasks: 14/45 concluídas — spec em estágio inicial.

| User story | Status | O que falta |
|---|---|---|
| Isolamento de dado por tenant | PARCIAL | Infra genérica pronta (`tenant-context.middleware.ts`, `tenant-id.vo.ts`, `drizzle-tenant-scoped-repository-base.ts`) e aplicada em **001** (`orcamento.repository`/`schema` com `tenantId`). Busca em `src/bounded-contexts/{extracao,validacao,busca-indexacao,orquestracao}` não encontra nenhuma ocorrência de `tenantId` — retrofit ainda não chegou a essas specs (issues #582–#587, T040–T045, todas abertas; gate explícito na issue #585: spec 004 T030 só pode mergear depois). |
| Exportação de relatório de auditoria via API | NÃO INICIADO | Nenhum controller/endpoint de exportação de auditoria encontrado em nenhum BC. |
| Continuidade dos contratos de dado já existentes | PARCIAL | Só os eventos de 001 carregam `tenantId`/`schemaVersion: 2`; eventos de 002/003/004/005 ainda não (mesmas issues #582–#587). |

## 008 · Hardening de Segurança e LGPD

Objetivo: direito ao esquecimento, retenção configurável, segregação de
ambiente, trilha de auditoria.
Tasks: 15/47 concluídas — spec em estágio inicial.

| User story | Status | O que falta |
|---|---|---|
| Direito ao esquecimento | PARCIAL | Domínio existe (`solicitacao-esquecimento.aggregate.ts`, eventos de registro/conclusão/prazo excedido, seed `contextos-com-dado-pessoal.seed.ts`), mas não foi encontrado caso de uso de aplicação nem controller HTTP que aceite a solicitação — hoje é modelo de domínio sem porta de entrada. |
| Retenção configurável por categoria | PARCIAL | `politica-retencao.vo.ts` existe no domínio; não verificado mecanismo de configuração operacional (fora do código-fonte, não confirmável aqui). |
| Segregação de ambientes | NÃO VERIFICADO | Preocupação de infraestrutura/operação, não observável em `src/`; não avaliado neste inventário. |
| Trilha de auditoria de acesso | NÃO INICIADO | Nenhum mecanismo de log de acesso correlacionável a documento encontrado no código. |

## 009 · Otimização de Custo Operacional

Objetivo: reduzir custo de reprocessamento (cache), arquivar dado frio,
processar cargas de baixa prioridade em lote.
Tasks: 5/36 concluídas — spec na fase mais inicial de todas.

| User story | Status | O que falta |
|---|---|---|
| Reaproveitamento de identificação (cache) | PRONTO | `cache-identificacao.gateway.ts` + `sinal-cache-identificacao.ts`, já injetado (opcional) em `classificar-orcamento.ts` via composition root. |
| Arquivamento automático por lifecycle | NÃO INICIADO | Nenhum código de migração de camada de armazenamento/lifecycle encontrado. |
| Processamento em lote de baixa prioridade | NÃO INICIADO | Nenhum código de fila/processamento em lote de baixa prioridade encontrado. |

## Fluxo ponta a ponta — onde quebra hoje

O que um usuário consegue fazer de verdade hoje: **nada em produção** — não
existe nenhum handler Lambda de produção implantável (ver lacuna
transversal abaixo), então o pipeline só é executável localmente via
`src/dev/local.ts` (docker-compose + LocalStack), e mesmo assim:

1. `POST /v1/orcamentos/upload-url` (canal API/portal/mobile) responde, mas o
   `PUT` na URL devolvida falha com 400 (BUG-001) — pipeline para no
   **primeiro passo** para esses 3 canais.
2. Canal SFTP (`sftp-upload.handler.ts`) não usa presigned URL — consegue
   avançar: recebimento → classificação (com Bedrock real ou stub local) →
   extração (com MarkItDown stub, não o conversor real de produção).
3. Depois de extração, o fluxo local (`src/dev/local.ts`) **não** encadeia
   validação (003), indexação (004) nem orquestração (005) — o poller local
   só cobre o fluxo 001→002 (comentário do próprio arquivo: "Execução local
   do fluxo 001 → 002"). Essas três specs não têm wiring de execução local
   nem de produção.
4. Mesmo isoladamente, 005 (Orquestração) não tem camada de aplicação nem
   endpoints HTTP suficientes para produzir uma decisão de workflow completa.

Resumo: a cadeia de valor completa (upload → decisão de workflow rastreável)
não é executável ponta a ponta em nenhum ambiente hoje. O trecho mais maduro
é 001→002 via canal SFTP em execução local.

## Lacunas transversais

- **Nenhum composition root/handler de produção**: `infra/lib/*.ts` só define
  stacks de bus, filas SQS e *roles* IAM — nenhum `lambda.Function`/
  `NodejsFunction`, nenhum `export const handler` em `src/`. `src/composition/`
  (2 arquivos, não commitados) e `src/dev/local.ts` cobrem só execução local
  de 001→002. Isso não tem issue própria (apontado explicitamente em
  BUG-001, seção "Hipótese técnica").
- **Lambda MarkItDown de conversão de documento inexistente** — issues #588
  (T066, conversão leve), #590 (T046, instância própria conforme ADR-002),
  #589 (T067, rodar no LocalStack Lambda). Sem isso, extração/classificação
  usam texto stub, não o conversor real de produção, em qualquer BC que
  dependa de conteúdo de documento convertido.
- **IAM `events:PutEvents` pendente** (ADR-004) — issues #576–#580 (T061–T065):
  `ReceberOrcamentoLambdaRole`, `ClassificadorLambdaRole`, `ExtratorLambdaRole`,
  `ConfirmarRevisaoHumanaLambdaRole` ainda sem a permissão para publicar no
  EventBridge. Mesmo se houvesse handler de produção hoje, publicação de
  evento falharia por falta de permissão.
- **BUG-001** (P0/crítico, ABERTO): presigned URL de upload inutilizável,
  detalhado na seção 001 acima. Bloqueia US1 nos 3 canais que usam presigned
  URL; não bloqueia SFTP.
- **Retrofit de `tenantId` (spec 007) só chegou a 001**: 002, 003, 004 e 005
  ainda publicam eventos sem `tenantId` — qualquer wiring de produção dessas
  specs hoje operaria sem isolamento multi-tenant.

## Riscos de produto

- **005 (Orquestração) é a spec de maior risco financeiro declarado** (a
  spec descreve a decisão de aprovação automática como a de maior risco da
  cadeia) e é também a que tem menor proporção de tasks concluídas entre as
  specs de negócio (23/52) e a camada de aplicação/interface mais incompleta
  — risco de o escopo prometido (3 decisões de roteamento + integração
  externa + rastreabilidade) não estar pronto no ritmo das demais specs.
- **004 promete busca em linguagem natural via API, mas não há endpoint
  HTTP de busca no código** — se a Fase 02 (MVP do Portal do Gestor) depende
  de expor essa busca, é lacuna a fechar antes do handoff ao frontend.
  Confirmar com `arquiteto-back`/dono da spec se o endpoint está planejado
  em task futura ou se é lacuna sem issue.
- **008 (LGPD) e 009 (custo) estão nas fases mais iniciais** (15/47 e 5/36
  tasks) — compromissos de conformidade (direito ao esquecimento, retenção)
  e de custo operacional (lifecycle, lote) declarados na spec ainda não têm
  porta de entrada de aplicação; risco de essas capacidades não estarem
  prontas quando a Fase 03 (hardening) começar a depender delas.
- **Achado a investigar**: issue #385 (spec 003, T023 — `DrizzleFaixaPrecoRepository`)
  segue aberta no GitHub, mas o arquivo correspondente já existe no
  código-fonte. Não verificado se é lacuna real ou apenas issue não fechada
  — sinalizar para o dono da spec 003 antes de assumir "pronto".
- **Contagem de issues por spec é aproximada** (ver nota de método no topo);
  não usar os números deste documento como fonte exata de burndown — usar o
  board do GitHub para isso.
