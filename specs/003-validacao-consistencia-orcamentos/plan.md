# Implementation Plan: Validação de Consistência de Orçamentos (Agente Validador)

**Branch**: `003-validacao-consistencia-orcamentos` | **Date**: 2026-07-29 | **Spec**: `specs/003-validacao-consistencia-orcamentos/spec.md`

**Input**: Feature specification from `/specs/003-validacao-consistencia-orcamentos/spec.md` (status: clarified, versão 1)

**Nota de convenção**: este plano herda, sem redefinir, as convenções vinculantes estabelecidas em `specs/001-ingestao-classificacao-orcamentos/plan.md` e `specs/002-extracao-dados-orcamento/plan.md` (nomenclatura de Bounded Context, convenção de Domain Event, bus único `nexo-dominio-bus`, layout de pastas por BC, `OrcamentoId` gerado só pelo Gateway de Ingestão, ADR-001 Drizzle, ADR-003 "padrão replicado, nunca componente físico compartilhado entre BCs"). Todo desvio dessas convenções é registrado explicitamente como ADR nesta spec.

## Summary

Requisito primário: orçamento já extraído (evento `OrcamentoExtraido` ou `OrcamentoExtraidoComPendenciaConfirmada` da spec 002) é submetido a regras de negócio determinísticas de consistência — CNPJ do fornecedor válido e compatível com cadastro conhecido, campos obrigatórios preenchidos, preço dentro de faixa esperada por categoria (configurável), coerência de prazo de validade — e só é marcado "validado" quando todas as regras passam. Inconsistência nunca é silenciada; a spec deixa aberto ao arquiteto o mecanismo de resolução.

Abordagem técnica: novo Bounded Context **Validação**, com agregado raiz próprio (`OrcamentoValidacao`) — nunca reaproveita os agregados de Ingestão/Extração. Comunicação de entrada exclusivamente via assinatura dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (relação Customer/Supplier, Validação é customer de Extração). **Decisão de arquitetura (ver ADR-001)**: mecanismo de resolução de inconsistência é escalonamento direto para fila de revisão humana (Princípio IV(a) da constituição), sem camada de Agente Revisor de IA — desvio deliberado do padrão replicado em 001/002, justificado pela natureza determinística das regras desta spec (nenhuma delas é um julgamento de confiança probabilística que se beneficie de uma segunda tentativa de IA). IA generativa é usada apenas como etapa auxiliar de categorização semântica de item para seleção de faixa de preço (ver ADR-002), nunca para decidir consistência. Persistência Aurora Serverless v2 + Drizzle (ADR-001 herdado da spec 001).

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 (mesma baseline das specs 001/002 — Ricardo MUST reconfirmar LTS vigente no momento real da implementação).

**Primary Dependencies**: Zod 4.4.x (validação de borda); AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`); Fastify (Interface, mesmo adaptador Lambda das specs 001/002); Drizzle ORM (ADR-001 da spec 001, herdado). **Sem MarkItDown nesta spec** — Validação opera sobre dados já estruturados pela Extração (itens/condições comerciais), nunca sobre o documento bruto; nenhuma conversão de documento é necessária aqui.

**Storage**: Aurora Serverless v2 Postgres para estado atual + histórico append-only do agregado `OrcamentoValidacao` (schema/tabelas próprias deste BC) e para a tabela de configuração `faixas_preco_categoria` (parâmetro configurável exigido pela spec, sem valor numérico fixo hardcoded). Validação **não lê** o bucket `nexo-orcamentos-raw` — opera exclusivamente sobre o payload estruturado do evento `OrcamentoExtraido`, reforçando que cada BC tem seu próprio modelo e nenhuma dependência de leitura cross-BC de dado bruto é introduzida aqui.

**Testing**: Vitest (unit Domain/Application sem mocks de rede — regras determinísticas de CNPJ/campo obrigatório/prazo são as candidatas ideais a teste de unidade puro, sem qualquer mock de IA); testes de contrato para os 2 endpoints REST próprios; testes de integração local contra LocalStack para SQS/EventBridge (execução cabe a Ricardo/CI).

**Target Platform**: AWS Lambda atrás de API Gateway (endpoint de confirmação humana e de status); consumidor SQS para o caso de uso assíncrono de validação; EventBridge custom bus `nexo-dominio-bus` (mesmo bus das specs 001/002).

**Project Type**: Web service (pipeline de eventos assíncrono + 2 endpoints síncronos), mesmo monorepo único das specs 001/002 (sem frontend, Additional Constraint de escopo backend).

**Performance Goals**: p95 ≤ 5 minutos entre "orçamento extraído disponível" e "resultado de validação disponível" (validado ou pendência explícita) — meta definida na spec, não medida ainda.

**Constraints**: nenhuma etapa desta spec é CPU-bound pesada (sem MarkItDown, sem parsing de documento) — as regras determinísticas são O(n) sobre a lista de itens já estruturada, seguras para rodar dentro do handler síncrono do consumidor SQS sem isolamento adicional; a única chamada potencialmente lenta/síncrona a Bedrock é o `AgenteCategorizadorItemGateway` (categorização semântica opcional, ver ADR-002) — mesma consideração de cold start das specs 001/002, porém com escopo bem menor (não é fluxo crítico de decisão de consistência, apenas insumo para seleção de faixa de preço).

**Scale/Scope**: 1 Bounded Context (Validação), 1 agregado raiz, 1 agente de IA auxiliar (Categorizador de Item — não é um dos 5 papéis fixos nem um "agente adicional" de exceção; ver Additional Constraint check abaixo), 1 fila de escalonamento humana própria deste BC, 4 regras de consistência determinísticas.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Tabela `validacoes_orcamento_historico` append-only grava regra avaliada, resultado (passou/falhou) e timestamp de cada tentativa; reconstruível por `orcamentoId` | PASS |
| II. Desacoplamento por eventos | Validação só entra em ação via assinatura de `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (EventBridge); nunca chama diretamente componente interno da Extração; nenhuma leitura cross-BC de dado bruto | PASS |
| III. Dado bruto imutável | Não aplicável a escrita de bruto (BC não toca S3); resultado de validação é nova representação em tabela própria, vinculada por referência, nunca sobrescrevendo dado da Extração | PASS |
| IV. Exceção nunca é silenciosa | `OrcamentoInconsistenciaDetectada` publicado com lista específica de regras falhadas; fila de escalonamento humana nunca autoaprova por tempo/volume; histórico nunca sobrescrito. **Nota de desvio de padrão**: esta spec usa a via (a) do Princípio IV (escalonamento direto), não a via (b) (camada de IA revisora) usada em 001/002 — ambas são explicitamente autorizadas pelo próprio texto do princípio; ver ADR-001 | PASS |
| V. IA generativa como motor de entendimento | Regras de consistência são determinísticas por natureza explícita da spec (Additional Constraint da constituição já prevê isso: "Regras de negócio determinísticas são aceitáveis apenas na camada de validação de consistência"); IA generativa usada só para interpretar contexto ambíguo em texto livre (categorização de item), nunca para flexibilizar regra obrigatória — ver ADR-002 | PASS |
| VI. Serverless-first | Toda a stack é Lambda/managed (API Gateway, EventBridge, SQS, Aurora Serverless v2); nenhum servidor fixo ocioso introduzido | PASS |
| VII. Segurança e LGPD desde o desenho | Ver seção Segurança; CNPJ e dado de cadastro do fornecedor são dado comercial sensível — least-privilege IAM, criptografia em repouso (KMS) e trânsito (TLS); nenhum novo dado pessoal de pessoa física introduzido além do já tratado nas specs 001/002 | PASS |
| VIII. Roadmap em 3 fases vinculante | Esta spec é Fase 02, depende apenas de Extração (002, Fase 01) — coerente com o roadmap; não depende de Indexação (004), Orquestrador completo (005) ou Multi-tenant (007), todos Fase 02/03 posteriores nesta linha | PASS |
| Additional Constraint — 5 agentes, papéis fixos | **Ponto de atenção, não bloqueante**: o `AgenteCategorizadorItemGateway` (Bedrock) introduzido nesta spec não é o papel fixo "Validador" nem um "agente adicional explícito" de tratamento de exceção (Princípio IV) — é um agente auxiliar de interpretação semântica, dentro do próprio papel do Validador ("podendo usar IA generativa para interpretar contexto ambíguo em campos de texto livre", conforme a seção "Camada de IA / Governança" da spec). Modelado como uma capacidade interna do papel Validador, não como agente novo — revisar se uma spec futura expandir esse uso além de categorização de item | PASS, com nota |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; correção/confirmação de inconsistência tratada como consumidor externo de frontend, fora de escopo | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Não aplicável — esta spec não converte documento bruto | N/A |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida pelo desenho de agregado/eventos abaixo — gate permanece PASS. Pontos de atenção não-bloqueantes (ver "Riscos remanescentes" no Relatório Final):
1. o payload de `OrcamentoExtraido` (spec 002) não inclui um campo de "data de emissão da proposta" — necessário para a regra de coerência de prazo desta spec — e precisa ser coordenado com o plano da spec 002 (mesmo padrão de risco que a própria spec 002 já registrou em relação à spec 001);
2. a interação entre `OrcamentoExtraidoComPendenciaConfirmada` (campo confirmado como indisponível no documento, spec 002) e a regra "campos obrigatórios preenchidos" desta spec é resolvida por uma decisão explícita do arquiteto (ver seção Domain abaixo), não estava especificada em nenhuma das duas specs.

## Bounded Context e Context Map (recorte desta spec)

```text
[BC: Extração] --(evento)--> OrcamentoExtraido / OrcamentoExtraidoComPendenciaConfirmada --(assina)--> [BC: Validação]
                                                                                                              |
                                                                                          [Agente Validador — regras determinísticas]
                                                                                     (opcional: Agente Categorizador de Item, Bedrock,
                                                                                      só para seleção de faixa de preço por categoria)
                                                                                                              |
                                              (todas regras OK) OrcamentoValidado          (1+ regra falhou) OrcamentoInconsistenciaDetectada
                                                                                                              |
                                                                                                              v
                                                                          [Fila de escalonamento assíncrona — própria da Validação]
                                                                                                              |
                                                                                      (decisão humana explícita, via API própria)
                                                                                                              v
                                              OrcamentoValidado (correção aplicada, regra revalidada)
                                              OU OrcamentoValidadoComRessalva (humano aceita explicitamente a inconsistência remanescente)

Consumidores externos (fora deste BC, apenas via evento/API — nunca chamada direta):
  - BC Orquestração (spec 005, Fase 02): assina OrcamentoValidado e OrcamentoValidadoComRessalva para decidir roteamento pós-validação.
  - BC Acompanhamento / consumidor de frontend externo: assina todos os eventos + consulta GET /orcamentos/{id}/validacao/status.
```

Relação entre contextos: **Customer/Supplier** — Extração é upstream (supplier) de Validação; Validação é upstream de Orquestração. Validação nunca altera o modelo de dado da Extração, apenas consome seu evento.

**Anti-Corruption Layer obrigatória**: entre o Domain deste contexto e (a) o payload bruto do evento `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (`OrcamentoExtraidoEventACL`, que traduz o shape do evento upstream para os VOs locais deste BC, nunca importando os tipos de domínio da Extração), (b) a resposta do Bedrock (`BedrockCategorizacaoACL`), e (c) a resposta do gateway externo de cadastro de fornecedores (`FornecedorCadastradoACL`, dado que a base de fornecedores é "dependência de dado já existente/fora do escopo de criação nesta spec" — sistema externo cujo formato de resposta nunca cruza para o Domain sem tradução).

## Domain — Agregados, VOs, Domain Events

### Agregado raiz: `OrcamentoValidacao` (escopo: Validação)

- **Identidade**: `orcamentoId` (mesmo valor de `OrcamentoId`, UUID v7, gerado exclusivamente pela Ingestão — Validação reutiliza o valor como referência/identidade correlata do seu próprio agregado 1:1; VO `OrcamentoId` redefinido localmente neste BC, mesmo padrão de duplicação aceitável já usado na spec 002).
- **Atributos**: `dadosExtraidos` (VO `DadosExtraidosParaValidacao`, cópia imutável traduzida do payload do evento upstream via `OrcamentoExtraidoEventACL` no momento da criação — nunca referência viva ao agregado da Extração), `status` (VO `StatusValidacao`: PENDENTE | VALIDADO | PENDENTE_REVISAO_HUMANA | VALIDADO_COM_RESSALVA), `inconsistencias` (lista de VO `InconsistenciaDetectada`, substituída — nunca acumulada — a cada nova tentativa de avaliação de regras), `historico` (lista imutável de `TentativaValidacao`, append-only).
- **Invariantes** (aplicadas nos métodos do agregado, nunca na Application):
  - Só transita para `VALIDADO` quando **todas** as regras de consistência aplicáveis retornam sucesso na mesma tentativa (`avaliarRegrasDeConsistencia(resultado)`); nunca transita para `VALIDADO` com qualquer inconsistência pendente, mesmo que parcial.
  - `avaliarRegrasDeConsistencia(resultado)`: se 1+ regra falhou, transita para `PENDENTE_REVISAO_HUMANA` diretamente (nunca existe uma segunda tentativa automática/IA — ver ADR-001); substitui `inconsistencias` pela lista da tentativa atual; anexa `TentativaValidacao` ao histórico.
  - `registrarDecisaoHumana(decisao)`: só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`. Duas decisões possíveis: `CORRECAO_APLICADA` (humano indica que o dado upstream foi corrigido/reenviado — reexecuta `avaliarRegrasDeConsistencia` com os dados corrigidos fornecidos na própria decisão; se todas as regras passam agora, transita para `VALIDADO`; se ainda houver falha, permanece em `PENDENTE_REVISAO_HUMANA` com nova tentativa registrada, nunca autoaprova) ou `ACEITE_COM_RESSALVA` (humano confirma explicitamente que aceita o orçamento apesar da(s) inconsistência(s) remanescente(s) — transita para `VALIDADO_COM_RESSALVA`, terminal, decisão humana definitiva, análogo ao padrão já estabelecido por `OrcamentoExtraidoComPendenciaConfirmada` na spec 002). Nunca apaga `historico`, apenas anexa.
  - Qualquer tentativa de sobrescrever `dadosExtraidos` fora do construtor de criação lança erro de domínio (`DadosExtraidosImutavelError`) — correção de dado passa exclusivamente por `registrarDecisaoHumana`, nunca por mutação direta do atributo.

**Decisão de arquitetura sobre interação com `OrcamentoExtraidoComPendenciaConfirmada`**: um campo que a Extração já marcou como `extraido: false` por confirmação humana explícita de indisponibilidade no documento **ainda é avaliado pela regra "campos obrigatórios preenchidos"** desta spec e, se obrigatório, **ainda gera inconsistência** aqui — Validação não herda automaticamente a decisão de aceite da Extração, porque a pergunta de negócio é diferente ("o documento não tinha o dado" vs. "o orçamento é aceitável sem esse dado para fins de compra"). Essa segunda pergunta é exatamente o que a fila de revisão humana desta spec resolve, e o caminho natural de resolução para esse caso específico é `ACEITE_COM_RESSALVA`, não `CORRECAO_APLICADA` (dado que reenviar/corrigir o documento normalmente não é possível quando o campo já foi confirmado como ausente). Nenhuma regra desta spec MUST assumir aceite implícito só porque a Extração já passou por um fluxo humano — cada BC decide sua própria pergunta de negócio, conforme convenção #2 estabelecida na spec 001.

### Value Objects

- `OrcamentoId` — mesmo formato/validação das specs 001/002 (UUID v7), redefinido localmente.
- `CNPJ` — string normalizada (14 dígitos), valida formato + dígito verificador (algoritmo padrão, determinístico, sem chamada externa); lança erro de domínio se inválido. Compatibilidade com "cadastro conhecido" é verificada por um `FornecedorCadastradoGateway` (não é validação de formato, é regra de negócio separada — ver Application).
- `FaixaPreco` — `{ categoria, precoMinimo: Dinheiro, precoMaximo: Dinheiro }`, carregada via `ParametroFaixaPrecoGateway` (tabela de configuração `faixas_preco_categoria`, nunca valor hardcoded no Domain — atende ao critério de aceite "parametrizável sem nova spec").
- `Dinheiro` — mesmo shape das specs 001/002, redefinido localmente.
- `CategoriaItem` — string livre validada contra um catálogo de categorias configurado (mesma tabela de configuração), preenchida por `AgenteCategorizadorItemGateway` quando o item não já vem categorizado (ver Application) — nunca decide sozinha se o preço está "correto", apenas seleciona qual `FaixaPreco` aplicar.
- `PeriodoValidade` — mesmo conceito das specs 001/002, redefinido localmente; usado junto de `DataEmissaoProposta` (ver dependência registrada no Constitution Check) para a regra de coerência de prazo.
- `InconsistenciaDetectada` — `{ regra: 'CNPJ_INVALIDO' | 'CNPJ_DIVERGENTE_CADASTRO' | 'CAMPO_OBRIGATORIO_AUSENTE' | 'PRECO_FORA_DE_FAIXA' | 'PRAZO_INCOERENTE', referenciaItem (opcional, quando a regra é por item), detalhe (texto legível para orientar correção, nunca "inconsistente" genérico) }` — atende ao critério de aceite "identifica especificamente qual regra falhou".
- `DadosExtraidosParaValidacao` — cópia traduzida (via `OrcamentoExtraidoEventACL`) do payload do evento upstream: `{ cnpjFornecedor, itens: ItemParaValidacao[], condicoesComerciais, dataEmissaoProposta (ver dependência) }`.
- `ItemParaValidacao` — `{ descricao, quantidade, precoUnitario: Dinheiro, categoria: CategoriaItem opcional até categorização, extraido: boolean }` (o campo `extraido` preserva, na tradução, se o item veio com pendência confirmada da Extração — necessário para a decisão de negócio descrita acima).
- `TentativaValidacao` — entrada de histórico imutável: `{ resultado: 'VALIDADO' | 'INCONSISTENTE', inconsistencias (se houver), timestamp }`.

### Domain Events (payload sempre com `schemaVersion: 1`, `orcamentoId`, `ocorreuEm`; `source: nexo.validacao`)

1. `OrcamentoValidado` — publicado quando `OrcamentoValidacao` transita para `VALIDADO` (primeira tentativa ou após correção). Payload: `orcamentoId`, confirmação de que todas as regras passaram. Consumido pelo futuro BC Orquestração (005) e por Acompanhamento.
2. `OrcamentoInconsistenciaDetectada` — publicado quando 1+ regra falha (primeira tentativa ou reavaliação pós-correção que ainda falha). Payload inclui a lista completa de `InconsistenciaDetectada` da tentativa atual (nunca acumulado de tentativas anteriores — reflete apenas o estado atual). Este é o evento de exceção explícito exigido pelos critérios de aceite da spec — **não** é um evento interno-only como os equivalentes de 001/002, porque aqui não existe uma segunda camada de IA a acionar internamente; é diretamente o evento consumido por Acompanhamento para exibir "pendente de validação (inconsistência)".
3. `OrcamentoValidadoComRessalva` — publicado quando humano decide `ACEITE_COM_RESSALVA` (decisão definitiva, não é falha silenciosa — Princípio IV satisfeito por decisão humana explícita e auditável, mesmo padrão de `OrcamentoExtraidoComPendenciaConfirmada` da spec 002). Payload inclui a lista de inconsistências aceitas com ressalva.

Nota: os três eventos acima são todos contratos externos estáveis desta spec — diferente de 001/002, não há aqui um evento "interno" de baixa confiança, pois não existe camada de IA revisora intermediária (ver ADR-001). `OrcamentoInconsistenciaDetectada` é publicado publicamente desde a primeira falha, exatamente como exigido pelo critério de aceite "esse estado de pendência fica visível na consulta de status do documento".

## Application — Casos de uso

- `ValidarOrcamento(orcamentoId, payloadOrcamentoExtraido)` — consumidor dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` (via SQS). Traduz o payload via `OrcamentoExtraidoEventACL`, cria o agregado `OrcamentoValidacao`, para cada item sem `categoria` conhecida invoca `AgenteCategorizadorItemGateway` (Bedrock) para obter `CategoriaItem` antes de avaliar a regra de preço, consulta `ParametroFaixaPrecoGateway` e `FornecedorCadastradoGateway`, aplica as 4 regras determinísticas via `OrcamentoValidacao.avaliarRegrasDeConsistencia`, persiste, publica `OrcamentoValidado` ou `OrcamentoInconsistenciaDetectada`.
- `RegistrarDecisaoHumanaValidacao(orcamentoId, decisao)` — caso de uso síncrono acionado pelo endpoint REST de decisão humana. Valida que o agregado está em `PENDENTE_REVISAO_HUMANA`, aplica `registrarDecisaoHumana` (reavaliando regras se `CORRECAO_APLICADA`), publica `OrcamentoValidado` ou `OrcamentoValidadoComRessalva` (ou mantém `PENDENTE_REVISAO_HUMANA` com nova tentativa registrada, se a correção ainda falhar).
- `ConsultarStatusValidacao(orcamentoId)` — query, retorna status atual + inconsistências + histórico completo (nunca escreve).

Todos os casos de uso publicam evento via a mesma interface `EventPublisher` (implementada na Infra sobre EventBridge, instância própria deste BC apontando para o mesmo bus `nexo-dominio-bus`) — nunca chamam SDK AWS diretamente. `AgenteCategorizadorItemGateway` e `FornecedorCadastradoGateway` são interfaces definidas no Domain/Application, implementadas na Infrastructure — regra de dependency inversion padrão do projeto.

## Infrastructure

- `BedrockCategorizadorItemGateway` — implementa `AgenteCategorizadorItemGateway`; usa saída estruturada (tool-use/JSON Schema) restrita ao catálogo de categorias configurado, nunca texto livre interpretado como categoria; `BedrockCategorizacaoACL` próprio, mesma disciplina de ACL das specs 001/002.
- `FornecedorCadastradoHttpGateway` — implementa `FornecedorCadastradoGateway`; cliente para o sistema externo de cadastro de fornecedores (fora do escopo de criação desta spec, conforme "Fora de escopo" do `spec.md`) — protocolo/contrato exato a confirmar com Ricardo/produto antes da implementação (registrado como risco remanescente); `FornecedorCadastradoACL` traduz a resposta externa para VOs locais (nunca o JSON externo cru cruza para o Domain).
- `DrizzleFaixaPrecoRepository` — lê/escreve a tabela de configuração `faixas_preco_categoria` (categoria, precoMinimo, precoMaximo, moeda); é a única escrita de configuração operacional prevista nesta spec (fora do fluxo de evento), acessível também por uma futura tela administrativa (fora de escopo de UI deste time, conforme Additional Constraint de escopo backend).
- `EventBridgePublisher` — implementa `EventPublisher`, publica no bus `nexo-dominio-bus` (mesma instância física, wiring próprio deste BC).
- `DrizzleOrcamentoValidacaoRepository` — traduz linha↔agregado sobre Aurora Serverless v2 Postgres; tabelas `validacoes_orcamento` (estado atual, `dados_extraidos` e `inconsistencias` em coluna JSONB, mesmo racional de ADR-004 da spec 002 — YAGNI sobre normalização até haver demanda real de consulta relacional) e `validacoes_orcamento_historico` (append-only, nunca UPDATE/DELETE, apenas INSERT).
- Fila SQS: `validador-queue` (único consumidor assíncrono desta spec, dado que não há camada de Agente Revisor — ver ADR-001), com DLQ própria + alarme CloudWatch em mensagem na DLQ.
- IAM: uma role por Lambda (`ValidarOrcamentoLambdaRole`, `RegistrarDecisaoHumanaValidacaoLambdaRole`, `ConsultaStatusValidacaoLambdaRole`), least privilege — ex.: `ValidarOrcamentoLambdaRole` tem `bedrock:InvokeModel` restrito ao ARN do modelo de categorização aprovado, acesso de leitura à tabela `faixas_preco_categoria`, e nenhuma permissão sobre o bucket `nexo-orcamentos-raw` (esta spec nunca precisa dele).

## Interface

- Consumidor SQS (`validador-queue`) acionado por regra EventBridge roteando `OrcamentoExtraido` e `OrcamentoExtraidoComPendenciaConfirmada` → fila deste BC.
- `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana` — decisão humana explícita (body: `decisao: 'CORRECAO_APLICADA' | 'ACEITE_COM_RESSALVA'`, com dados corrigidos quando `CORRECAO_APLICADA`, ou justificativa textual quando `ACEITE_COM_RESSALVA`). Só aceito quando status é `PENDENTE_REVISAO_HUMANA`; caso contrário, 409 Problem Details (RFC 7807).
- `GET /v1/orcamentos/{orcamentoId}/validacao/status` — retorna status + inconsistências + histórico. Contrato Problem Details para erros.
- `POST /v1/configuracoes/faixas-preco-categoria` / `GET /v1/configuracoes/faixas-preco-categoria` — CRUD simples de parâmetro operacional (transaction script, sem agregado rico — é configuração, não regra de negócio do domínio `OrcamentoValidacao`; ver nota de complexidade abaixo). Autenticação: Cognito, papel administrativo distinto do papel de comprador.
- Todos os endpoints validam entrada via Zod na borda; nenhuma regra de negócio nos controllers — apenas mapeamento request↔Application.
- Autenticação: Cognito (JWT), mesmo esquema das specs 001/002.

**Nota de complexidade (YAGNI)**: o endpoint de configuração de faixas de preço é um CRUD simples de parâmetro operacional, não um caso de uso do domínio `OrcamentoValidacao` — implementado como transaction script direto sobre a tabela `faixas_preco_categoria`, sem agregado, VO rico ou domain event próprio. Aplicar DDD tático completo aqui adicionaria complexidade sem benefício (não há invariante de negócio complexa sobre "uma faixa de preço configurada" além de validação de forma). Se uma spec futura introduzir regras de aprovação/versionamento sobre mudança de faixa de preço, essa decisão MUST ser revisitada.

## Segurança (riscos específicos desta spec)

- **CNPJ e dado de cadastro do fornecedor**: dado comercial sensível (Princípio VII) — least privilege IAM, criptografia em repouso (Aurora KMS) e trânsito (TLS), sem exposição cross-tenant (preparação para Fase 03 multi-tenant, sem implementar isolamento completo agora).
- **Dependência de sistema externo de cadastro de fornecedores**: `FornecedorCadastradoHttpGateway` é a primeira integração síncrona desta arquitetura com um sistema fora do controle direto do produto — MUST ter timeout curto e circuit breaker/retry limitado (nunca bloquear o processamento de outros orçamentos na fila caso o sistema externo esteja indisponível — Princípio II); resposta tratada como entrada não confiável, sempre traduzida via `FornecedorCadastradoACL` antes de entrar no Domain.
- **Uso de IA generativa restrito e não decisório**: `AgenteCategorizadorItemGateway` nunca recebe autoridade para aprovar/reprovar consistência — seu único efeito possível é selecionar qual `FaixaPreco` (dado determinístico, já configurado) será comparada; mesma disciplina de saída estruturada validada por ACL das specs 001/002, mesmo risco de prompt injection via descrição de item do fornecedor mitigado da mesma forma (bloco delimitado de conteúdo, nunca instrução de sistema).
- **Nenhuma leitura de dado bruto**: reforça Princípio III por design — nenhuma role IAM deste BC tem qualquer permissão sobre o bucket `nexo-orcamentos-raw`.

## Project Structure

### Documentation (this feature)

```text
specs/003-validacao-consistencia-orcamentos/
├── spec.md               # já existente, clarified (versão 1)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — mesma convenção monorepo único, por Bounded Context, estabelecida na spec 001

```text
src/
└── bounded-contexts/
    └── validacao/
        ├── domain/
        │   ├── orcamento-validacao.aggregate.ts
        │   ├── value-objects/ (orcamento-id, cnpj, faixa-preco, dinheiro, categoria-item, periodo-validade, inconsistencia-detectada, dados-extraidos-para-validacao, item-para-validacao, tentativa-validacao)
        │   ├── events/ (orcamento-validado, orcamento-inconsistencia-detectada, orcamento-validado-com-ressalva)
        │   ├── repositories/ (orcamento-validacao.repository.ts — interface)
        │   └── gateways/ (agente-categorizador-item.gateway.ts, fornecedor-cadastrado.gateway.ts, parametro-faixa-preco.gateway.ts, orcamento-extraido-event.acl.ts — interfaces)
        ├── application/
        │   └── use-cases/ (validar-orcamento, registrar-decisao-humana-validacao, consultar-status-validacao)
        ├── infrastructure/
        │   ├── persistence/ (drizzle-orcamento-validacao.repository.ts, drizzle-faixa-preco.repository.ts, schema/)
        │   ├── aws/ (eventbridge.publisher.ts)
        │   ├── bedrock/ (bedrock-categorizador-item.gateway.ts, acl/)
        │   └── external/ (fornecedor-cadastrado-http.gateway.ts, acl/)
        └── interface/
            ├── http/ (controllers REST + Zod schemas — inclui CRUD de configuração de faixa de preço)
            └── events/ (handlers Lambda consumidores de SQS)

tests/
└── bounded-contexts/validacao/
    ├── domain/ (unit, sem mocks de rede — regras determinísticas são o alvo prioritário de teste, nunca "coverage theater")
    ├── application/ (unit, mocks de gateway/repositório)
    └── contract/ (contratos REST)
```

**Structure Decision**: mesma convenção das specs 001/002 — novo subdiretório `src/bounded-contexts/validacao/` isolado, sem import direto de código de `extracao/` ou `ingestao-identificacao/`; toda comunicação de entrada via evento (`OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`) consumido por SQS.

## Complexity Tracking

*Nenhuma violação do Constitution Check — tabela não aplicável. Único desvio de padrão intencional (ausência de camada de Agente Revisor de IA) está justificado via ADR-001, dentro da flexibilidade já prevista pelo Princípio IV(a)/(b) da constituição — não é uma violação.*

## ADRs desta spec

### ADR-001 — Mecanismo de resolução de inconsistência: escalonamento humano direto, sem camada de Agente Revisor de IA

**Contexto**: o `spec.md` desta feature deixa explicitamente aberto ao arquiteto decidir se o mecanismo de resolução de inconsistência segue o mesmo padrão de Agente Revisor de IA + fila assíncrona usado nas specs 001 e 002, ou outro mecanismo válido pelo Princípio IV da constituição (que autoriza tanto escalonamento direto quanto camada de IA revisora, isolados ou em cadeia).

**Problema**: replicar o padrão "Agente Revisor de IA tenta uma vez antes de escalar" (já estabelecido em 001/002) por consistência de arquitetura, ou aplicar um mecanismo mais simples, já que as regras desta spec são qualitativamente diferentes das de 001/002.

**Alternativas consideradas**:
(a) Replicar o padrão de 001/002: `AgenteRevisorValidacaoGateway` (Bedrock) tenta resolver a inconsistência com contexto adicional antes de escalar para revisão humana;
(b) Escalonamento direto para fila de revisão humana assíncrona, sem camada de IA revisora intermediária — via (a) do Princípio IV.

**Vantagens (opção b, escolhida)**: as quatro regras desta spec (CNPJ válido, campo obrigatório presente, preço dentro de faixa, prazo coerente) são checagens determinísticas e binárias — CNPJ está ou não está no formato/dígito verificador correto e bate ou não bate com o cadastro; um campo está ou não está preenchido; um preço está ou não está dentro de uma faixa numérica já configurada; uma data é ou não é anterior/coerente com outra. Nenhuma delas é uma estimativa de confiança que uma segunda passada de um LLM com "mais contexto" resolveria de forma diferente — dar uma segunda tentativa de IA a um CNPJ com dígito verificador incorreto não produz um CNPJ correto, apenas adia a correção real (que só o fornecedor ou o comprador podem fornecer). Introduzir um Agente Revisor aqui seria complexidade sem função real — exatamente o tipo de "sofisticação automática" que o mandato deste arquiteto instrui a evitar. Menos um componente de infraestrutura (fila+Lambda+gateway Bedrock) para operar e monitorar.

**Desvantagens**: quebra a simetria estrutural com 001/002 (uma pessoa lendo os três planos pode estranhar a ausência do "segundo estágio"); se uma spec futura expandir as regras desta spec para incluir alguma checagem que dependa de julgamento/confiança (ex.: "a descrição do item é plausível para a categoria declarada" avaliado por IA, não só formato), esta decisão MUST ser revisitada com ADR próprio.

**Decisão**: escalonamento direto para fila de revisão humana assíncrona (`validador-queue` de saída de exceção + estado `PENDENTE_REVISAO_HUMANA`), sem `AgenteRevisorValidacaoGateway`. Válido explicitamente pelo Princípio IV(a) da constituição, que autoriza esta via isoladamente, sem exigir a via (b).

**Trade-offs**: menos consistência estrutural entre specs do pipeline, em troca de não introduzir um componente que não teria função real de resolução — trade-off aceitável dado que a constituição autoriza explicitamente ambas as vias e a spec autoriza explicitamente a escolha do arquiteto.

**Impactos futuros**: se uma spec futura de Validação (ou revisão desta) introduzir uma regra de consistência que dependa de julgamento probabilístico (não apenas checagem determinística), a introdução de um Agente Revisor de IA para aquela regra específica MUST ser avaliada por ADR próprio — a ausência de Agente Revisor nesta spec não é um veto permanente para todo o BC Validação, é uma decisão específica às 4 regras atuais.

### ADR-002 — Uso de IA generativa restrito à categorização semântica de item, nunca à decisão de consistência

**Contexto**: a regra "preço dentro de faixa esperada para a categoria do item" pressupõe saber a categoria do item, mas o agregado `ItemOrcamento` extraído pela spec 002 não carrega um campo `categoria` estruturado — apenas uma descrição em texto livre.

**Problema**: como obter a categoria do item sem (a) introduzir uma regra fixa "if/else" por palavra-chave (proibido pelo Princípio V para entendimento de conteúdo) nem (b) permitir que a IA decida, ela mesma, se o preço está correto (o que violaria a natureza determinística exigida desta camada pela constituição).

**Alternativas consideradas**:
(a) Regra fixa de palavra-chave/dicionário para mapear descrição→categoria;
(b) IA generativa (Bedrock) categoriza semanticamente o item a partir da descrição, e a comparação numérica contra a `FaixaPreco` da categoria resultante permanece 100% determinística, no Domain, sem envolvimento da IA;
(c) exigir que a categoria já venha estruturada desde a Extração (spec 002), eliminando a necessidade de categorização aqui.

**Vantagens (opção b, escolhida)**: preserva o Princípio V (entendimento de conteúdo variável, como a descrição livre de um fornecedor, é tarefa de IA generativa, não de regra fixa) sem violar a exigência de que a decisão de consistência em si seja determinística — a IA só produz um dado de entrada (`categoria`), nunca o veredito "dentro/fora de faixa". A opção (c) foi descartada porque exigiria alterar o contrato já publicado da spec 002 (fora do escopo deste plano, e a categorização de item para fins de preço é uma preocupação específica da Validação, não da Extração — Extração extrai o que o documento diz, não infere categoria de mercado).

**Desvantagens**: mais uma dependência de Bedrock (custo, cold start, disponibilidade) nesta spec, mesmo ela sendo majoritariamente determinística; erro de categorização pela IA pode levar a comparar contra a faixa errada — mitigado por: saída estruturada restrita ao catálogo de categorias já configurado (a IA nunca inventa uma categoria nova), e qualquer resultado "fora de faixa" continua gerando `InconsistenciaDetectada` revisável por humano (a categorização errada não causa uma falsa aprovação silenciosa, no piso ela causa uma falsa exceção, que é o lado seguro do erro).

**Decisão**: `AgenteCategorizadorItemGateway` (Bedrock, saída estruturada restrita ao catálogo configurado) fornece `CategoriaItem`; a comparação com `FaixaPreco` é sempre determinística, executada no Domain, sem qualquer participação da IA na decisão final.

**Trade-offs**: dependência adicional de IA em uma camada que a constituição descreve como "regra determinística", mitigada pelo fato de a IA nunca decidir consistência, apenas fornecer um dado de entrada, e pelo viés do erro sempre pender para exceção revisável, nunca para aprovação indevida.

**Impactos futuros**: se a Extração (002) vier a estruturar `categoria` nativamente em uma revisão futura, este gateway pode ser removido/tornado fallback, sem quebrar o contrato de `OrcamentoValidado`/`OrcamentoInconsistenciaDetectada` desta spec.
