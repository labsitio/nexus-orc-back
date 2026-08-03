# Implementation Plan: Orquestração de Workflow e Integrações (Agente Orquestrador)

**Branch**: `005-orquestracao-workflow-integracoes` | **Date**: 2026-07-29 | **Spec**: `specs/005-orquestracao-workflow-integracoes/spec.md`

**Input**: Feature specification from `/specs/005-orquestracao-workflow-integracoes/spec.md` (status: clarified, versão 3)

**Nota de convenção**: este plano herda, sem redefinir, as convenções vinculantes estabelecidas em `specs/001-ingestao-classificacao-orcamentos/plan.md`, `specs/002-extracao-dados-orcamento/plan.md` e `specs/003-validacao-consistencia-orcamentos/plan.md` (nomenclatura de Bounded Context, convenção de Domain Event `<Agregado><ParticípioPassado>`/português/`schemaVersion`+`orcamentoId`, bus único `nexo-dominio-bus`, layout de pastas por BC, `OrcamentoId` gerado só pelo Gateway de Ingestão, ADR-001 Drizzle da spec 001, ADR-003 "padrão replicado, nunca componente físico compartilhado entre BCs" da spec 002). Todo desvio dessas convenções é registrado explicitamente como ADR nesta spec. Nenhum plano de `research.md`/`data-model.md`/`contracts/` separado é gerado — mesma convenção de artefato único (`plan.md` autocontido) já adotada em 001/002/003.

**Amendment 2026-08-03 (ADR-008 de `specs/007-isolamento-multitenant-dados/plan.md`)**: os Domain Events desta spec e o contexto consolidado (ADR-001 desta spec) foram planejados sem `tenantId`. Retrofit extrai `tenantId` dos 3 eventos upstream (001/002/003, já v2). Ver `specs/007-isolamento-multitenant-dados/tasks.md` T044.

**Nota de ferramenta**: a etapa `speckit-plan` desta sessão não pôde executar `.specify/scripts/powershell/setup-plan.ps1` (esta sessão do agente arquiteto não tem ferramenta Bash/shell) — plano elaborado manualmente, seguindo a mesma estrutura que as specs 001–003 já materializam no repositório. Registrado como condição de ambiente, não bloqueia a entrega.

## Summary

Requisito primário: orçamento já validado (evento `OrcamentoValidado`/`OrcamentoValidadoComRessalva` da spec 003) recebe uma decisão final de workflow — aprovar automaticamente, encaminhar ao comprador responsável, ou solicitar reenvio ao fornecedor — consolidando o resultado de Classificador (001), Extrator (002) e Validador (003). É a decisão de **maior risco financeiro do produto** (aprovação automática de compra): nunca autoaprova sem confiança suficiente, nunca autoaprova por exaustão/tempo/volume de fila, decisão de integração externa é sempre publicada como evento desacoplado (nenhum decisor conhece o contrato do sistema parceiro).

Abordagem técnica: novo Bounded Context **Orquestração**, com agregado raiz próprio (`DecisaoWorkflow`) — nunca reaproveita os agregados de Ingestão/Extração/Validação. Comunicação de entrada exclusivamente via assinatura de eventos (Customer/Supplier, Orquestração é customer de Ingestão, Extração e Validação simultaneamente — não apenas de Validação; ver ADR-001 sobre como o contexto consolidado é construído sem chamada síncrona cross-BC). Governança de baixa confiança segue o padrão vigente no produto (specs 001/002): Agente Orquestrador → (baixa confiança) escalonamento direto para a fila de decisão humana do comprador (ADR-002 — componente próprio deste BC, sem um segundo agente de IA). Persistência Aurora Serverless v2 + Drizzle (ADR-001 da spec 001, herdado).

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 (mesma baseline das specs 001/002/003 — Ricardo MUST reconfirmar LTS vigente no momento real da implementação).

**Primary Dependencies**: Zod 4.4.x (validação de borda); AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`); Fastify (Interface, mesmo adaptador Lambda das specs 001–003); Drizzle ORM (ADR-001 da spec 001, herdado). **Sem MarkItDown nesta spec** — Orquestração opera sobre dados já estruturados/consolidados de eventos upstream, nunca sobre o documento bruto; nenhuma conversão de documento é necessária aqui (mesmo racional da spec 003).

**Storage**: Aurora Serverless v2 Postgres para (a) estado atual + histórico append-only do agregado `DecisaoWorkflow` (schema/tabelas próprias deste BC) e (b) o read-model consolidado de contexto (`contexto_decisao_workflow`, ver ADR-001) construído a partir dos eventos de Ingestão/Extração/Validação. Orquestração **não lê** o bucket `nexo-orcamentos-raw` — opera exclusivamente sobre payloads de evento já estruturados, reforçando que cada BC tem seu próprio modelo (convenção #2 da spec 001).

**Testing**: Vitest (unit Domain/Application sem mocks de rede — invariantes de "nunca aprovar sem confiança suficiente" e "nunca aprovar sem validação bem-sucedida" são candidatas prioritárias a teste de unidade puro); testes de contrato para os 2 endpoints REST próprios; testes de integração local contra LocalStack para SQS/EventBridge (execução cabe a Ricardo/CI).

**Target Platform**: AWS Lambda atrás de API Gateway (endpoint de decisão humana e de status); consumidores SQS para os casos de uso assíncronos (2 filas de entrada de contexto + 1 fila de decisão); EventBridge custom bus `nexo-dominio-bus` (mesmo bus das specs 001–003). O escalonamento humano é um estado do agregado (`PENDENTE_REVISAO_HUMANA`), não uma fila SQS adicional.

**Project Type**: Web service (pipeline de eventos assíncrono + 2 endpoints síncronos), mesmo monorepo único das specs 001–003 (sem frontend, Additional Constraint de escopo backend).

**Performance Goals**: p95 ≤ 5 minutos entre "orçamento validado disponível" e "decisão de workflow publicada" (para decisões resolvidas pelo Orquestrador) — meta definida na própria spec (seção Métricas), não medida ainda (produto novo).

**Constraints**: consolidação de contexto depende da ordem causal real do pipeline (Classificação → Extração → Validação sempre ocorrem antes da decisão de workflow para o mesmo `orcamentoId`), mas a entrega dos eventos via EventBridge/SQS não garante ordem de chegada ao consumidor deste BC — o caso de uso de decisão MUST tolerar chegada fora de ordem sem decidir com contexto incompleto (ver ADR-001, "contexto incompleto nunca é decidido, é reprocessado"); cold start do `AgenteOrquestradorGateway` (chamada síncrona Bedrock) é a mesma consideração de design das specs 001–003; esta é a decisão de maior risco financeiro da cadeia — nenhuma otimização de custo/latência MUST comprometer a garantia de "nunca aprovar sem confiança suficiente reportada com base auditável" (ver Segurança).

**Scale/Scope**: 1 Bounded Context (Orquestração), 1 agregado raiz, 1 agente de IA (Orquestrador — papel fixo), 1 fila de escalonamento humana própria deste BC (estado do agregado), 3 eventos de entrada de contexto (Ingestão, Extração, Validação) + 1 evento de decisão consolidada. Baixa confiança do Orquestrador escala diretamente para o comprador, sem agente revisor de IA.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Tabela `decisoes_workflow_historico` append-only grava agente decisor (Orquestrador/Humano), critério, nível de confiança e timestamp de cada tentativa; reconstruível por `orcamentoId` | PASS |
| II. Desacoplamento por eventos | Orquestração só entra em ação via assinatura de eventos (`OrcamentoClassificado`, `OrcamentoExtraido`/`ComPendenciaConfirmada`, `OrcamentoValidado`/`ComRessalva`); nunca chama diretamente componente interno de Ingestão/Extração/Validação; contexto consolidado é read-model próprio (ver ADR-001), nunca query síncrona cross-BC | PASS |
| III. Dado bruto imutável | Não aplicável a escrita de bruto (BC não toca S3); decisão de workflow é nova representação em tabela própria, vinculada por referência, nunca sobrescrevendo dado de nenhum BC upstream | PASS |
| IV. Exceção nunca é silenciosa | Cadeia Orquestrador → fila de escalonamento humano assíncrona implementa Princípio IV(b) explicitamente; o agente não pode reportar confiança artificial (VO `NivelConfianca` reaproveitado, faixa 0–100, nunca number solto; decisão `APROVAR` MUST carregar `criterio` textual não vazio, tornando a base da confiança auditável — ver Segurança); fila nunca autoaprova por tempo/volume/exaustão (invariante estrutural do agregado, não apenas processo); histórico nunca sobrescrito | PASS |
| V. IA generativa como motor de entendimento | Orquestrador é 100% Bedrock; NUNCA decide conteúdo de fornecedor/formato/extração/validação (já decidido pelos agentes anteriores) — atua estritamente sobre o resultado consolidado; nenhuma regra fixa por fornecedor | PASS |
| VI. Serverless-first | Toda a stack é Lambda/managed (API Gateway, EventBridge, SQS, Aurora Serverless v2); nenhum servidor fixo ocioso introduzido | PASS |
| VII. Segurança e LGPD desde o desenho | Ver seção Segurança; dado comercial consolidado (fornecedor, itens, preços, decisão de compra) é o mais sensível da cadeia por ser a base de uma aprovação financeira — least-privilege IAM, criptografia em repouso (KMS) e trânsito (TLS); nenhum novo dado pessoal introduzido além do já tratado nas specs 001–003 | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec é Fase 02, depende de Ingestão (001, Fase 01), Extração (002, Fase 01) e Validação (003, Fase 02) — todas já especificadas; não trata nenhuma capacidade de Indexação (004) ou Multi-tenant (007, Fase 03) como pré-requisito bloqueante | PASS |
| Additional Constraint — 5 agentes, papéis fixos | Apenas o Agente Orquestrador (papel fixo "Orquestrador (workflow/roteamento)") é usado; o tratamento de exceção de baixa confiança é escalonamento humano direto ao comprador, sem agente de IA adicional | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; avaliação do comprador sobre orçamentos encaminhados/escalonados tratada como consumidor externo de frontend, fora de escopo (conforme "Fora de escopo" do `spec.md`) | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Não aplicável — esta spec não converte documento bruto | N/A |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida pelo desenho de agregado/eventos abaixo — gate permanece PASS. Pontos de atenção não-bloqueantes (ver "Riscos remanescentes" no Relatório Final):
1. o payload atual de `OrcamentoValidado` (spec 003) é mínimo (confirmação de que todas as regras passaram, sem os dados extraídos completos) — Orquestração depende de ter recebido `OrcamentoClassificado` (001) e `OrcamentoExtraido`/`ComPendenciaConfirmada` (002) previamente para montar o contexto consolidado; nenhuma das três specs upstream foi escrita já sabendo que uma quarta spec consumiria os três eventos simultaneamente — risco de coordenação, mesmo padrão de risco que 002 e 003 já registraram entre si;
2. a regra de negócio "quando a decisão exige integração externa" não é especificada no `spec.md` além de "quando exige comunicação com sistema externo" — modelada nesta spec como uma decisão explícita do Agente Orquestrador/Revisor (campo `requerIntegracaoExterna` da decisão), não como regra fixa determinística, pois o próprio "Fora de escopo" da spec deixa o contrato de integração indefinido; registrado como suposição de arquitetura, não como requisito de negócio inventado (ver ADR-003).

## Bounded Context e Context Map (recorte desta spec)

```text
[BC: Ingestão]  --(evento)--> OrcamentoClassificado                    ---+
[BC: Extração]  --(evento)--> OrcamentoExtraido/ComPendenciaConfirmada ---+--(assinam, constroem contexto próprio)--> [BC: Orquestração]
[BC: Validação] --(evento)--> OrcamentoValidado/ComRessalva            ---+                                                  |
                                                                                                        [Agente Orquestrador (Bedrock)]
                                                                                                                              |
                    (confiança suficiente) -----------------------------------------+------(<confiança) DecisaoWorkflowEscalonadaParaComprador
                                            |                    |                  |                              |
                                  OrcamentoAprovadoParaProcessamento    OrcamentoEncaminhadoParaComprador   OrcamentoReenvioSolicitado
                                                                                                                              v
                                                                                                    [Fila de escalonamento assíncrona — própria da Orquestração]
                                                                                                                              |
                                                                                            (confirmação humana explícita, via API própria — qualquer um dos 3 desfechos)
                                                                                                                              v
                                                                        OrcamentoAprovadoParaProcessamento / OrcamentoEncaminhadoParaComprador / OrcamentoReenvioSolicitado (agenteOrigem: HUMANO)

Evento auxiliar, publicado junto de qualquer decisão que exija comunicação com sistema externo:
  IntegracaoExternaSolicitada (payload desacoplado, nenhum decisor conhece o contrato do sistema parceiro)

Consumidores externos (fora deste BC, apenas via evento/API — nunca chamada direta):
  - Sistema externo de compras da rede varejista (via spec de integração futura, fora de escopo): assina IntegracaoExternaSolicitada.
  - BC Acompanhamento / consumidor de frontend externo: assina todos os eventos + consulta GET /orcamentos/{id}/workflow/status.
```

Relação entre contextos: **Customer/Supplier**, com Orquestração como customer simultâneo de três suppliers (Ingestão, Extração, Validação) — situação nova em relação às specs 001–003, que tinham sempre um único supplier direto. Orquestração nunca altera o modelo de dado de nenhum BC upstream, apenas consome seus eventos e mantém sua própria cópia consolidada e imutável do contexto necessário à decisão.

**Anti-Corruption Layer obrigatória**: entre o Domain deste contexto e (a) os payloads brutos dos três eventos upstream (`OrcamentoClassificadoEventACL`, `OrcamentoExtraidoEventACL` — este último redefinido localmente, mesmo padrão de duplicação aceitável já usado na spec 003 para o ACL equivalente, `OrcamentoValidadoEventACL`), cada um traduzindo o shape do evento de origem para VOs locais deste BC, nunca importando tipos de domínio de outro BC; e (b) a resposta do Bedrock (Orquestrador, `BedrockDecisaoWorkflowACL`).

## Domain — Agregados, VOs, Domain Events

### Agregado raiz: `DecisaoWorkflow` (escopo: Orquestração)

- **Identidade**: `orcamentoId` (mesmo valor de `OrcamentoId`, UUID v7, gerado exclusivamente pela Ingestão — Orquestração reutiliza o valor como referência/identidade correlata do seu próprio agregado 1:1; VO `OrcamentoId` redefinido localmente neste BC, mesmo padrão das specs 002/003).
- **Atributos**:
  - `contextoClassificacao` (VO `ContextoClassificacao`, opcional até o evento `OrcamentoClassificado` chegar: `{ fornecedorIdentificado, formatoIdentificado }`).
  - `contextoExtracao` (VO `ContextoExtracao`, opcional até `OrcamentoExtraido`/`ComPendenciaConfirmada` chegar: `{ itensResumo, condicoesComerciaisResumo, houvePendenciaConfirmada: boolean }`).
  - `contextoValidacao` (VO `ContextoValidacao`, opcional até `OrcamentoValidado`/`ComRessalva` chegar: `{ resultado: 'VALIDADO' | 'VALIDADO_COM_RESSALVA', inconsistenciasAceitas (se houver) }`).
  - `status` (VO `StatusDecisaoWorkflow`: `AGUARDANDO_CONTEXTO` | `CONTEXTO_CONSOLIDADO` | `DECIDIDO` | `PENDENTE_REVISAO_HUMANA`).
  - `decisaoAtual` (VO `DecisaoRoteamento`, opcional até haver decisão com confiança suficiente ou decisão humana: `{ acao: 'APROVAR' | 'ENCAMINHAR_COMPRADOR' | 'SOLICITAR_REENVIO', nivelConfianca: NivelConfianca | null (null apenas quando `agenteOrigem === 'HUMANO'`), criterio (texto não vazio, obrigatório), agenteOrigem: 'ORQUESTRADOR' | 'HUMANO', requerIntegracaoExterna: boolean, motivoDadoAusente (obrigatório e não vazio quando `acao === 'SOLICITAR_REENVIO'`, referenciando uma inconsistência/pendência concreta do `contextoValidacao`/`contextoExtracao`) }`).
  - `historico` (lista imutável de `TentativaDecisaoWorkflow`, append-only).
- **Invariantes** (aplicadas nos métodos do agregado, nunca na Application):
  - `registrarContextoClassificacao/Extracao/Validacao(contexto)`: apenas anexa/preenche o respectivo atributo (idempotente — reaplicar o mesmo evento não duplica nem sobrescreve com dado divergente sem erro de domínio); nunca dispara decisão por si só.
  - `consolidarContexto()`: só transita para `CONTEXTO_CONSOLIDADO` quando os três contextos (`contextoClassificacao`, `contextoExtracao`, `contextoValidacao`) estão presentes; caso contrário permanece `AGUARDANDO_CONTEXTO` e lança `ContextoIncompletoError` (tratado pela Application como sinal de reprocessamento, nunca como decisão parcial — ver ADR-001).
  - `registrarTentativaOrquestrador(resultado)`: só pode ser chamado a partir de `CONTEXTO_CONSOLIDADO`. Se `resultado.nivelConfianca < LIMIAR_CONFIANCA (80, parâmetro operacional — ver "Fora de escopo" do spec.md)`, transita diretamente para `PENDENTE_REVISAO_HUMANA` (escalonamento ao comprador, sem segundo agente de IA), nunca decide. Se confiança suficiente, aplica as regras de negócio abaixo e transita para `DECIDIDO`:
    - `acao === 'APROVAR'` só é aceito se `contextoValidacao.resultado` for `VALIDADO` ou `VALIDADO_COM_RESSALVA` — tentar aprovar sem validação bem-sucedida lança `AprovacaoSemValidacaoError` (mapeamento direto da "Ação proibida" da spec: "nunca aprovar automaticamente um orçamento que não tenha passado por validação bem-sucedida").
    - `acao === 'SOLICITAR_REENVIO'` exige `motivoDadoAusente` não vazio, referenciando uma inconsistência/pendência concreta já registrada por Validação ou Extração — tentar solicitar reenvio sem essa referência lança `ReenvioSemFundamentoError` (mapeamento direto do critério de aceite "uma decisão de solicitar reenvio nunca é tomada sem que a validação tenha apontado ausência de dado essencial específico").
    - `criterio` (texto explicando a base da decisão) MUST ser não vazio para qualquer decisão automática — construtor de `DecisaoRoteamento` rejeita `criterio` vazio quando `agenteOrigem !== 'HUMANO'` (mitigação estrutural contra "reportar confiança artificial sem base auditável", ver Segurança).
  - `registrarDecisaoHumana(decisao)`: só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`; humano pode escolher qualquer uma das 3 ações sem exigência de `nivelConfianca` (mas `criterio`/justificativa textual ainda MUST ser não vazia, para auditoria); mesma regra de fundamento obrigatório para `SOLICITAR_REENVIO`; transita para `DECIDIDO`; nunca apaga `historico`, apenas anexa.
  - Qualquer tentativa de sobrescrever `contextoClassificacao`, `contextoExtracao` ou `contextoValidacao` com valor divergente do já registrado lança `ContextoImutavelError` (mesmo padrão de `ReferenciaImutavelError` das specs 002/003) — proteção contra reentrega de evento com payload diferente do original.

### Value Objects

- `OrcamentoId` — mesmo formato/validação das specs 001–003 (UUID v7), redefinido localmente.
- `NivelConfianca` — inteiro 0–100, mesma regra das specs 001–003 (redefinido localmente).
- `ContextoClassificacao`, `ContextoExtracao`, `ContextoValidacao` — cópias traduzidas (via os três ACLs de evento) dos payloads upstream, cada uma imutável após criação.
- `DecisaoRoteamento` — `{ acao, nivelConfianca, criterio, agenteOrigem: 'ORQUESTRADOR' | 'HUMANO', requerIntegracaoExterna, motivoDadoAusente }`; construtor aplica as invariantes de negócio descritas acima (é o VO mais crítico desta spec — nenhuma instância inválida é representável).
- `TentativaDecisaoWorkflow` — entrada de histórico imutável: `{ agente, resultado ou motivoInsucesso, timestamp }`.

### Domain Events (payload sempre com `schemaVersion: 1`, `orcamentoId`, `ocorreuEm`; `source: nexo.orquestracao`)

1. `OrcamentoAprovadoParaProcessamento` — publicado quando `DecisaoRoteamento.acao === 'APROVAR'` é registrada (Orquestrador ou decisão humana — campo `agenteOrigem` distingue). Consumido pelas etapas de negócio subsequentes (fora de escopo) e por Acompanhamento.
2. `OrcamentoEncaminhadoParaComprador` — publicado quando `acao === 'ENCAMINHAR_COMPRADOR'` é registrada, com confiança suficiente (nunca confundir com escalonamento por falta de confiança — este é um desfecho decidido, não uma ausência de decisão). Consumido por Acompanhamento.
3. `OrcamentoReenvioSolicitado` — publicado quando `acao === 'SOLICITAR_REENVIO'` é registrada; payload inclui `motivoDadoAusente`. Consumido por Acompanhamento e pela futura spec de notificação ao fornecedor (fora de escopo).
4. `IntegracaoExternaSolicitada` — publicado em conjunto com qualquer um dos três eventos acima quando `requerIntegracaoExterna === true`; payload deliberadamente genérico (`orcamentoId`, `acaoOrigem`, `ocorreuEm`), nenhum decisor conhece o contrato do sistema parceiro (critério de aceite explícito do spec.md).
5. `DecisaoWorkflowEscalonadaParaComprador` — publicado diretamente pelo caso de uso de decisão quando o Orquestrador não atinge confiança suficiente. Alimenta a fila de escalonamento humano (estado `PENDENTE_REVISAO_HUMANA` do agregado) e é consumido pelo Acompanhamento/consumidor externo para exibir "pendente de decisão de workflow".

Nota: os quatro primeiros eventos são os contratos externos estáveis de desfecho desta spec; `DecisaoWorkflowEscalonadaParaComprador` sinaliza a pendência de decisão humana.

## Application — Casos de uso

- `RegistrarContextoClassificacao(orcamentoId, payload)` — consumidor do evento `OrcamentoClassificado` (via SQS). Traduz via `OrcamentoClassificadoEventACL`, cria o agregado `DecisaoWorkflow` (se ainda não existir) ou recupera existente, aplica `registrarContextoClassificacao`, persiste. Nunca decide, nunca publica evento de negócio.
- `RegistrarContextoExtracao(orcamentoId, payload)` — consumidor de `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (via SQS). Mesmo padrão do caso de uso acima, via `OrcamentoExtraidoEventACL`.
- `ConsolidarEDecidirWorkflow(orcamentoId, payload)` — consumidor de `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (via SQS), o gatilho real da decisão (último evento da cadeia causal). Traduz via `OrcamentoValidadoEventACL`, aplica `registrarContextoValidacao`, tenta `consolidarContexto()`:
  - Se lançar `ContextoIncompletoError` (contexto de classificação e/ou extração ainda não chegou, por entrega fora de ordem) — a mensagem SQS NÃO é confirmada (nack/erro), retorna à fila para nova tentativa após o *visibility timeout*; após N tentativas, vai para a DLQ própria com alarme CloudWatch (Princípio IV — exceção de infraestrutura também nunca silenciosa; ver ADR-001 e Riscos remanescentes).
  - Se consolidado, invoca `AgenteOrquestradorGateway`, aplica `DecisaoWorkflow.registrarTentativaOrquestrador`, persiste, publica o evento de desfecho correspondente (+ `IntegracaoExternaSolicitada` se aplicável) se a confiança for suficiente, ou `DecisaoWorkflowEscalonadaParaComprador` (transita para `PENDENTE_REVISAO_HUMANA`) se for insuficiente.
- `RegistrarDecisaoHumanaWorkflow(orcamentoId, decisao)` — caso de uso síncrono acionado pelo endpoint REST de decisão humana. Valida que o agregado está em `PENDENTE_REVISAO_HUMANA`, aplica `registrarDecisaoHumana`, publica o evento de desfecho correspondente com `agenteOrigem: 'HUMANO'` (+ `IntegracaoExternaSolicitada` se aplicável).
- `ConsultarStatusDecisaoWorkflow(orcamentoId)` — query, retorna status atual + contexto consolidado + decisão + histórico completo (nunca escreve).

Todos os casos de uso publicam evento via a mesma interface `EventPublisher` (implementada na Infra sobre EventBridge, instância própria deste BC apontando para o mesmo bus `nexo-dominio-bus`) — nunca chamam SDK AWS diretamente.

## Infrastructure

- `BedrockOrquestradorGateway` — implementa o gateway do agente Orquestrador, com seu `BedrockDecisaoWorkflowACL` de parsing de resposta (structured output/tool-use do Bedrock, exigindo obrigatoriamente `acao`, `nivelConfianca`, `criterio` não vazio — nunca parsing de texto livre por regex; ver Segurança quanto a rejeitar respostas sem `criterio`).
- `OrcamentoClassificadoEventACL` / `OrcamentoExtraidoEventACL` / `OrcamentoValidadoEventACL` — traduzem os três payloads de evento upstream para os VOs locais deste BC (`ContextoClassificacao`/`ContextoExtracao`/`ContextoValidacao`), nunca importando tipos de domínio de Ingestão/Extração/Validação.
- `EventBridgePublisher` — implementa `EventPublisher`, publica no bus `nexo-dominio-bus` (mesma instância física, wiring próprio deste BC).
- `DrizzleDecisaoWorkflowRepository` — traduz linha↔agregado sobre Aurora Serverless v2 Postgres; tabelas `decisoes_workflow` (estado atual, `contexto_classificacao`/`contexto_extracao`/`contexto_validacao`/`decisao_atual` em colunas JSONB, mesmo racional YAGNI do ADR-004 da spec 002) e `decisoes_workflow_historico` (append-only, nunca UPDATE/DELETE, apenas INSERT).
- Filas SQS por consumidor: `contexto-classificacao-queue`, `contexto-extracao-queue`, `decisao-workflow-queue` (gatilho de decisão), cada uma com DLQ própria + alarme CloudWatch em mensagem na DLQ — a DLQ de `decisao-workflow-queue` é o mecanismo operacional que torna visível um contexto que nunca se consolida (Princípio IV, ver ADR-001).
- IAM: uma role por Lambda (`RegistrarContextoClassificacaoLambdaRole`, `RegistrarContextoExtracaoLambdaRole`, `ConsolidarEDecidirWorkflowLambdaRole`, `RegistrarDecisaoHumanaWorkflowLambdaRole`, `ConsultaStatusDecisaoWorkflowLambdaRole`), least privilege — ex.: `ConsolidarEDecidirWorkflowLambdaRole` tem `bedrock:InvokeModel` restrito ao ARN do modelo aprovado, sem qualquer permissão sobre `nexo-orcamentos-raw` ou sobre as tabelas de outros BCs.

## Interface

- Consumidor SQS (`contexto-classificacao-queue`) acionado por regra EventBridge roteando `detail-type: OrcamentoClassificado`, `source: nexo.ingestao-identificacao` → fila deste BC.
- Consumidor SQS (`contexto-extracao-queue`) acionado por regra EventBridge roteando `detail-type: OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`, `source: nexo.extracao` → fila deste BC.
- Consumidor SQS (`decisao-workflow-queue`) acionado por regra EventBridge roteando `detail-type: OrcamentoValidado`/`OrcamentoValidadoComRessalva`, `source: nexo.validacao` → fila deste BC.
- `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana` — decisão humana explícita (body: `acao: 'APROVAR' | 'ENCAMINHAR_COMPRADOR' | 'SOLICITAR_REENVIO'`, `justificativa` textual obrigatória, `motivoDadoAusente` obrigatório quando `acao === 'SOLICITAR_REENVIO'`). Só aceito quando status é `PENDENTE_REVISAO_HUMANA`; caso contrário, 409 Problem Details (RFC 7807).
- `GET /v1/orcamentos/{orcamentoId}/workflow/status` — retorna status + contexto consolidado + decisão + histórico. Contrato Problem Details para erros.
- Todos os endpoints validam entrada via Zod na borda; nenhuma regra de negócio nos controllers — apenas mapeamento request↔Application.
- Autenticação: Cognito (JWT), mesmo esquema das specs 001–003; papel de "comprador responsável" distinto do papel administrativo já usado na spec 003, exigido no endpoint de decisão humana.

## Segurança (riscos específicos desta spec)

- **Maior risco financeiro da cadeia de agentes**: esta é a única spec cuja decisão de IA aprova diretamente uma compra. Mitigações estruturais, não apenas de processo: (a) `DecisaoRoteamento` é um VO que torna estruturalmente impossível representar uma aprovação sem `criterio` não vazio ou sem `contextoValidacao` bem-sucedido (ver invariantes do agregado); (b) `BedrockDecisaoWorkflowACL` rejeita qualquer resposta do modelo que não inclua `criterio` textual junto do `nivelConfianca` — um agente não pode "reportar confiança suficiente artificialmente" sem também produzir uma justificativa auditável, tornando qualquer aprovação indevida detectável em auditoria manual, mesmo que não impedível 100% no momento da decisão; (c) a métrica "taxa de decisão de aprovação automática revertida posteriormente por um comprador" (definida no `spec.md` como a de maior criticidade de negócio) depende de dado que só o BC Acompanhamento pode calcular (cruzando decisão automática com reversão humana futura) — registrado como dependência de coordenação, não implementada nesta spec (ver Riscos remanescentes).
- **Prompt injection via contexto consolidado**: embora esta spec não leia o documento bruto, o `contextoExtracao` carrega texto originalmente extraído de um documento de fornecedor (ex.: descrição de item) e repassado pelo evento upstream — MUST continuar sendo tratado como entrada não confiável ao compor o prompt do Orquestrador, mesmo já tendo passado por uma ACL antes (defesa em profundidade, mesma disciplina de bloco delimitado de conteúdo das specs 001–003).
- **Dado comercial consolidado (fornecedor + itens + preços + decisão de compra)**: é o dado mais sensível da cadeia por reunir, em um único registro, a base de uma decisão financeira — least privilege IAM, criptografia em repouso (Aurora KMS) e trânsito (TLS), sem exposição cross-tenant (preparação para Fase 03 multi-tenant, sem implementar isolamento completo agora).
- **Integração externa desacoplada por desenho**: `IntegracaoExternaSolicitada` nunca carrega detalhe de protocolo/contrato do sistema parceiro — nenhum componente deste BC MUST ser modificado quando o sistema parceiro real for definido (spec futura de integração consome o evento e traduz para o protocolo específico).

## Project Structure

### Documentation (this feature)

```text
specs/005-orquestracao-workflow-integracoes/
├── spec.md               # já existente, clarified (versão 3)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — mesma convenção monorepo único, por Bounded Context, estabelecida na spec 001

```text
src/
└── bounded-contexts/
    └── orquestracao/
        ├── domain/
        │   ├── decisao-workflow.aggregate.ts
        │   ├── value-objects/ (orcamento-id, nivel-confianca, contexto-classificacao, contexto-extracao, contexto-validacao, decisao-roteamento, tentativa-decisao-workflow)
        │   ├── events/ (orcamento-aprovado-para-processamento, orcamento-encaminhado-para-comprador, orcamento-reenvio-solicitado, integracao-externa-solicitada, decisao-workflow-escalonada-para-comprador)
        │   ├── repositories/ (decisao-workflow.repository.ts — interface)
        │   └── gateways/ (agente-orquestrador.gateway.ts, orcamento-classificado-event.acl.ts, orcamento-extraido-event.acl.ts, orcamento-validado-event.acl.ts — interfaces)
        ├── application/
        │   └── use-cases/ (registrar-contexto-classificacao, registrar-contexto-extracao, consolidar-e-decidir-workflow, registrar-decisao-humana-workflow, consultar-status-decisao-workflow)
        ├── infrastructure/
        │   ├── persistence/ (drizzle-decisao-workflow.repository.ts, schema/)
        │   ├── aws/ (eventbridge.publisher.ts)
        │   └── bedrock/ (bedrock-orquestrador.gateway.ts, acl/)
        └── interface/
            ├── http/ (controllers REST + Zod schemas)
            └── events/ (handlers Lambda consumidores de SQS)

tests/
└── bounded-contexts/orquestracao/
    ├── domain/ (unit, sem mocks de rede — invariantes de "nunca aprovar sem confiança/validação/fundamento" são o alvo prioritário)
    ├── application/ (unit, mocks de gateway/repositório)
    └── contract/ (contratos REST)
```

**Structure Decision**: mesma convenção das specs 001–003 — novo subdiretório `src/bounded-contexts/orquestracao/` isolado, sem import direto de código de `ingestao-identificacao/`, `extracao/` ou `validacao/`; toda comunicação de entrada via evento, consumida por SQS (três filas distintas, refletindo os três pontos de entrada de evento desta spec).

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável.*

## ADRs desta spec

### ADR-001 — Contexto consolidado é read-model próprio construído por assinatura dos três eventos upstream, nunca por payload expandido ou chamada síncrona cross-BC

**Contexto**: a decisão de workflow precisa do resultado consolidado de Classificador (001), Extrator (002) e Validador (003) — três Bounded Contexts distintos, cada um com seu próprio modelo (convenção #2 da spec 001), nenhum deles compartilhando dados diretamente com Orquestração até esta spec.

**Problema**: como Orquestração obtém "resultado de classificação e extração já disponíveis" (linguagem do próprio spec.md) sem violar o Princípio II (desacoplamento por eventos, nenhuma chamada direta à implementação interna de outro BC) e sem forçar as specs 001–003 a reabrir seus contratos de evento já publicados só para atender a uma quarta spec.

**Alternativas consideradas**:
(a) Expandir o payload de `OrcamentoValidado` (003) para incluir uma cópia completa dos dados de classificação e extração, permitindo que Orquestração dependa de um único evento;
(b) Orquestração faz chamada síncrona (API/SDK) aos endpoints de status de Ingestão/Extração/Validação no momento da decisão, para buscar o contexto sob demanda;
(c) Orquestração assina os três eventos de saída relevantes (`OrcamentoClassificado`, `OrcamentoExtraido`/`ComPendenciaConfirmada`, `OrcamentoValidado`/`ComRessalva`) desde já publicados, e constrói/mantém sua própria cópia local consolidada (read-model), decidindo apenas quando os três estiverem presentes.

**Vantagens (opção c, escolhida)**: preserva o Princípio II sem exigir nenhuma mudança retroativa nos contratos já publicados pelas specs 001–003 (evita a "dependência de coordenação" se tornar uma dependência bloqueante de re-arquitetura); preserva a autonomia de deploy de cada BC; preserva "cada BC tem seu próprio modelo" — o contexto consolidado de Orquestração é uma interpretação própria deste BC sobre o que precisa saber para decidir, não uma cópia ingênua de estruturas de domínio de outros BCs; é o mesmo padrão arquitetural (assinar eventos de múltiplos upstreams e reconstruir localmente) recomendado por DDD para agregação de contexto entre Bounded Contexts sem acoplamento de leitura.

**Desvantagens**: introduz o problema de "contexto incompleto por entrega fora de ordem" (mitigado pela invariante `consolidarContexto()`/`ContextoIncompletoError` + retry via SQS/DLQ, nunca decisão parcial); três filas de entrada de contexto em vez de uma, mais superfície operacional (DLQs, alarmes) a manter neste BC; se as specs 001–003 evoluírem o shape de seus eventos, os três ACLs deste BC (`OrcamentoClassificadoEventACL`, `OrcamentoExtraidoEventACL`, `OrcamentoValidadoEventACL`) precisam acompanhar — mesmo tipo de acoplamento de contrato (não de implementação) que já existe em toda relação Customer/Supplier do produto.

**Decisão**: opção (c). Orquestração assina os três eventos de saída já estáveis e mantém seu próprio read-model consolidado (`contextoClassificacao`/`contextoExtracao`/`contextoValidacao` dentro do agregado `DecisaoWorkflow`), decidindo apenas quando os três estiverem presentes; contexto incompleto nunca é decidido, é reprocessado via retry de fila (nunca timeout que force decisão parcial).

**Trade-offs**: mais componentes de infraestrutura (3 filas de contexto + 1 de decisão, em vez de 1) em troca de zero acoplamento síncrono cross-BC e zero mudança retroativa em contratos já publicados — trade-off aceitável dado que Princípio II é NON-NEGOTIABLE e reabrir contratos de três specs já implementadas teria custo de coordenação maior que o custo operacional de mais filas.

**Impactos futuros**: qualquer spec futura que precise consolidar eventos de múltiplos BCs upstream (ex.: um futuro relatório analítico cross-pipeline) MUST seguir o mesmo padrão — assinatura de eventos + read-model próprio, nunca payload expandido sob demanda de um consumidor específico nem chamada síncrona cross-BC.

### ADR-002 — Governança de baixa confiança da Orquestração é escalonamento humano direto ao comprador, sem agente revisor de IA

**Contexto**: a versão original desta spec previa um Agente Revisor de Workflow (segundo agente de IA) antes do escalonamento ao comprador, espelhando o Revisor das specs 001/002. Decisão de produto posterior **removeu os agentes revisores de IA** de todo o Nexo (specs 001, 002 e 005).

**Problema**: como tratar decisão de workflow de baixa confiança do Orquestrador, agora sem um segundo agente de IA.

**Alternativas consideradas**: (a) manter um Agente Revisor de Workflow de IA como passo intermediário; (b) escalonar diretamente para decisão humana do comprador, com fila (estado) própria deste BC.

**Decisão**: opção (b). O Orquestrador faz uma única tentativa; confiança insuficiente transita o agregado diretamente para `PENDENTE_REVISAO_HUMANA` e publica `DecisaoWorkflowEscalonadaParaComprador`, sem agente revisor de IA. A decisão humana explícita (qualquer uma das 3 ações, com `criterio`/justificativa obrigatório) é registrada com o mesmo peso de uma decisão automática. As invariantes críticas de negócio (nunca aprovar sem validação bem-sucedida, reenvio sempre fundamentado, `criterio` obrigatório) continuam valendo integralmente.

**Trade-offs**: perde-se a tentativa automática extra do revisor de IA (que agregava custo/latência sem garantia de resolver o que o papel fixo já não resolveu) em troca de um caminho de exceção mais simples; mantém-se zero acoplamento entre BCs e a garantia NON-NEGOTIABLE de "nunca autoaprovar por exaustão/tempo/volume" (o escalonamento humano é indefinido no tempo, nunca decide por timeout).

**Impactos futuros**: padrão consistente com o adotado nas specs 001/002 — papel fixo → escalonamento humano direto, fila própria por BC, nunca um agente revisor de IA.

### ADR-003 — Necessidade de integração externa é uma decisão explícita do agente decisor (flag `requerIntegracaoExterna`), não uma regra fixa determinística

**Contexto**: o `spec.md` (seção "Integração externa disparada pela decisão") descreve que "uma decisão de workflow... exige comunicação com um sistema externo" sem especificar quando isso é verdade — o "Fora de escopo" da spec deixa explicitamente de fora "contrato específico de integração com qualquer sistema parceiro nomeado", tratando a integração como genérica via evento.

**Problema**: como o Domain decide *se* uma dada decisão de roteamento exige publicar `IntegracaoExternaSolicitada`, sem inventar uma regra de negócio que o produto não definiu (ex.: "toda aprovação automática sempre integra", que poderia estar errado) e sem deixar essa pergunta sem resposta nenhuma (o que impediria o evento de existir).

**Alternativas consideradas**:
(a) Regra fixa determinística no Domain: `requerIntegracaoExterna = (acao === 'APROVAR')` sempre, para as outras ações nunca;
(b) O próprio agente decisor (Orquestrador) reporta `requerIntegracaoExterna` como parte de sua saída estruturada, junto de `acao`/`nivelConfianca`/`criterio`, e o Domain apenas valida a forma (booleano presente), sem impor a regra de quando é verdade;
(c) Deixar de publicar `IntegracaoExternaSolicitada` nesta spec até haver uma regra de negócio explícita do produto.

**Vantagens (opção b, escolhida)**: não inventa uma regra de negócio ("toda aprovação sempre integra") que o próprio PM não confirmou — a spec deixa essa decisão para quando o sistema parceiro real for definido; ainda satisfaz o critério de aceite "uma decisão que exige integração externa publica um evento de integração desacoplado" ao permitir que o agente (que tem visibilidade do contexto completo — fornecedor, tipo de decisão, histórico) sinalize a necessidade, mantendo a decisão de conteúdo fora do Domain (Princípio V — IA decide contexto de negócio variável, Domain só garante que a decisão é estruturalmente válida e auditável). A opção (a) foi descartada por fixar uma regra que o produto nunca validou; a opção (c) foi descartada por deixar um critério de aceite explícito sem nenhuma implementação.

**Desvantagens**: `requerIntegracaoExterna` reportado por um LLM é, tecnicames, uma inferência sujeita a erro (falso negativo/positivo) — mitigado por: o pior caso de falso positivo é uma tentativa de integração desnecessária (evento adicional, tratável e observável no Acompanhamento), e o pior caso de falso negativo é uma integração perdida (mesma classe de risco que qualquer outro campo decidido por IA nesta cadeia, sujeito a auditoria via histórico); esta é uma decisão de menor risco financeiro que `acao`/`nivelConfianca`, que continuam com toda a governança da spec.

**Decisão**: `requerIntegracaoExterna` é um campo booleano reportado pelo agente decisor como parte da mesma saída estruturada de `acao`/`nivelConfianca`/`criterio`, validado apenas quanto à forma pelo `BedrockDecisaoWorkflowACL`; quando `true`, o caso de uso publica `IntegracaoExternaSolicitada` junto do evento de desfecho.

**Trade-offs**: menor determinismo nesta sub-decisão específica, em troca de não fixar prematuramente uma regra de negócio sobre um sistema parceiro que ainda não existe no escopo do produto — trade-off aceitável, com risco financeiro muito menor que a decisão principal `acao`.

**Impactos futuros**: quando uma spec futura definir o sistema parceiro real (ex.: integração com ERP de compras), esta decisão MUST ser revisitada — a regra de "quando integrar" pode migrar de inferência de IA para regra determinística explícita assim que o produto souber exatamente quando a integração é necessária, sem quebrar o contrato de `IntegracaoExternaSolicitada` já publicado.
