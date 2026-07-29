# Implementation Plan: Hardening de Segurança e Conformidade LGPD

**Branch**: `008-hardening-seguranca-lgpd` | **Date**: 2026-07-29 | **Spec**: `specs/008-hardening-seguranca-lgpd/spec.md`

**Input**: Feature specification from `/specs/008-hardening-seguranca-lgpd/spec.md` (status: clarified, versão 1)

**Nota de natureza da feature**: esta spec formaliza o Princípio VII da constituição (Segurança e LGPD Desde o Desenho) como comportamento observável de produto. É **transversal** — atravessa todos os Bounded Contexts do Context Map (Ingestão & Identificação, Extração, Validação, Busca & Indexação, Orquestração, Acompanhamento), incluindo os ainda não arquitetados (002–007). Por isso este plano **não cria um novo Bounded Context de negócio** com agregado de domínio próprio ao estilo de 001 — modela-se como (a) políticas/contratos compartilhados que cada BC implementa sobre seus próprios dados, e (b) um processo de coordenação leve ("Conformidade") que orquestra via evento, nunca por acesso direto a dado de outro contexto. Nenhuma convenção estabelecida em `specs/001-ingestao-classificacao-orcamentos/plan.md` é contrariada sem ADR explícito — desvios estão registrados nos ADR-003 e ADR-004 abaixo.

## Summary

Requisito primário: (1) direito ao esquecimento executável sob demanda, sem apagar a trilha de rastreabilidade não-pessoal (Princípio I); (2) retenção configurável por categoria de documento, ajustável sem deploy; (3) segregação real entre ambientes dev/hml/prod, sem dado real de produção jamais presente fora de prod; (4) trilha de auditoria de acesso — não apenas de transição de pipeline (já coberta pelo Princípio I) — reconstruível por identificador de documento.

Abordagem técnica: cada Bounded Context permanece dono exclusivo de seus próprios dados (nenhum acesso direto cross-contexto) e implementa, dentro de si, os dois casos de uso que a conformidade exige sobre seu recorte de dado — anonimização e aplicação de política de retenção. Um processo de coordenação leve, **Conformidade** (não é BC de negócio; vive fora de `bounded-contexts/`, em `src/platform/`), orquestra o direito ao esquecimento fim-a-fim publicando um evento de solicitação e agregando as confirmações que cada BC publica de volta, sem nunca ler a base de dado de outro contexto diretamente. Segregação de ambiente e trilha de auditoria de acesso são resolvidas majoritariamente como decisão de infraestrutura/IAM (AWS Organizations multi-conta) e como um componente de observabilidade compartilhado (não-domínio), respectivamente — ambos deliberadamente fora do Domain de qualquer BC, pela mesma razão que logging/tracing já são tratados como Infrastructure/Interface, nunca Domain.

## Technical Context

**Language/Version**: TypeScript 5.x, modo `strict`, Node.js 24 — mesma base de 001; Ricardo MUST reconfirmar LTS vigente no momento real da implementação.

**Primary Dependencies**: Zod 4.4.x (validação de borda); AWS SDK v3 (`@aws-sdk/client-eventbridge`, `@aws-sdk/client-scheduler`, `@aws-sdk/client-kms`, `@aws-sdk/client-organizations` — este último apenas para scripts de provisionamento/IaC, nunca em runtime de Lambda de negócio); Fastify (Interface, mesma convenção de 001); Drizzle ORM (mesma convenção de 001 — ADR-001 de 001 permanece vinculante). Nenhuma dependência nova de IA/Bedrock — esta spec `envolve_ia_ou_agentes: false`, confirmado no frontmatter.

**Storage**: cada BC mantém seu próprio schema Aurora (sem mudança); esta spec adiciona: (a) schema `platform` dedicado, tabela `platform.solicitacoes_esquecimento` (agregado do processo de coordenação) e `platform.confirmacoes_anonimizacao` (append-only, uma linha por confirmação de BC); (b) tabela `platform.politicas_retencao` (config, mutável via API administrativa, chave = `categoriaDocumento`); (c) tabela `platform.trilha_auditoria_acesso` (append-only, correlacionada por `orcamentoId`, para acesso a dado — distinta da tabela `<bc>_historico` de cada contexto, que já cobre transição de pipeline por Princípio I).

**Testing**: Vitest (unit, sem mocks de rede no Domain de cada BC e no processo Conformidade); teste de contrato para os novos endpoints REST; teste de integração local (LocalStack) para EventBridge Scheduler e o fan-out de evento de solicitação de esquecimento.

**Target Platform**: AWS Lambda + EventBridge (bus único `nexo-dominio-bus`, reaproveitado — Princípio II e convenção de 001); EventBridge Scheduler para execução periódica de retenção; AWS Organizations (3 contas: dev, hml, prod) para segregação de ambiente; AWS Config + GuardDuty + Security Hub como mecanismo de detecção de ameaça na borda (escolha serverless-first, gerenciada, sem servidor fixo — Princípio VI; a spec exige apenas que o mecanismo exista, não qual, conforme "Fora de escopo").

**Performance Goals**: solicitação de esquecimento concluída (todas as confirmações recebidas) dentro do prazo de retenção assumido de 30 dias corridos (spec, Assunção) — meta de processo administrativo, não de latência de requisição.

**Constraints**: nenhum BC MUST expor acesso direto de leitura/escrita ao seu banco para o processo Conformidade — toda interação é via evento publicado/consumido ou via API pública do BC (mesma regra de fronteira do Context Map de 001). Execução de anonimização/retenção em cada BC MUST ser assíncrona (consumidor SQS de evento), nunca bloquear o pipeline principal desse BC (Princípio II).

**Scale/Scope**: componente de coordenação leve (Conformidade) + 1 caso de uso de anonimização e 1 caso de uso de aplicação de retenção *por Bounded Context existente ou futuro* (obrigação estrutural, não numérica — hoje 001 é o único BC arquitetado; 002–007 herdam a obrigação ao serem arquitetados). Nenhum agregado de domínio de negócio novo além do pequeno agregado de coordenação `SolicitacaoEsquecimento`.

## Constitution Check

*GATE avaliado contra `.specify/memory/constitution.md` v1.2.0.*

| Princípio | Verificação | Status |
|---|---|---|
| I. Rastreabilidade ponta a ponta | Anonimização remove/mascara apenas o dado pessoal, nunca a entrada de histórico em si (`historico` permanece, com o campo pessoal substituído por marcador `[ANONIMIZADO]` + referência à solicitação); trilha de auditoria de acesso é aditiva à rastreabilidade já exigida, nunca a substitui | PASS |
| II. Desacoplamento por eventos | Conformidade nunca lê banco de outro BC; solicita via `SolicitacaoEsquecimentoRegistrada`, cada BC responde com `DadoPessoalAnonimizadoNoContexto`; retenção é pull-based por BC a partir de config compartilhada, execução sempre local ao BC | PASS |
| III. Dado bruto imutável | Anonimização de dado pessoal em S3 (ex.: PDF com dado de contato) exige nova versão do objeto com campo mascarado, nunca sobrescrita da versão original — ver risco remanescente sobre custo de storage de versões pré-anonimização, tratado em Segurança/Riscos | PASS, com nota |
| IV. Exceção nunca é silenciosa | `SolicitacaoEsquecimentoPrazoExcedido` é publicado e nunca auto-resolve uma solicitação sem todas as confirmações; falha de um BC em confirmar dentro do prazo é escalonada, nunca descartada | PASS |
| V. IA generativa como motor de entendimento | Não aplicável — spec não envolve agente de IA (`envolve_ia_ou_agentes: false`) | N/A |
| VI. Serverless-first | EventBridge Scheduler, Lambda, Aurora Serverless v2, GuardDuty/Security Hub/Config — todos gerenciados, sem servidor fixo ocioso | PASS |
| VII. Segurança e LGPD desde o desenho | Esta spec é a própria formalização do princípio — ver seção Segurança | PASS |
| VIII. Roadmap em 3 fases vinculante | `fase_roadmap: Fase 03` no frontmatter, coerente com "Hardening de segurança" da Fase 03; spec não depende de capacidade de fase posterior | PASS |
| Additional Constraint — escopo exclusivamente backend | Nenhum componente de UI especificado; endpoints administrativos de conformidade são contrato de API para consumo por um futuro painel administrativo, não a UI em si | PASS |
| Additional Constraint — MarkItDown antes de serviço pago | Não aplicável a esta spec (sem etapa de conversão de documento) | N/A |
| Additional Constraint — 5 agentes, papéis fixos | Não aplicável — nenhum agente de IA novo introduzido | N/A |

**Re-check pós Phase 1 (desenho detalhado)**: nenhuma violação introduzida. Duas exceções à *convenção* (não ao princípio) de 001 estão registradas como ADR-003 e ADR-004 abaixo, por não se tratar de Bounded Context de negócio.

## Bounded Context e Context Map (recorte desta spec)

Esta spec não introduz um Bounded Context de negócio. Ela introduz um **componente de plataforma transversal** ("Conformidade") que se relaciona com todo BC existente/futuro por uma relação **Publisher/Subscriber simétrica** (nenhum lado é upstream fixo): Conformidade publica a solicitação, cada BC publica sua própria confirmação.

```text
[API administrativa] --(POST solicitação)--> [Conformidade: RegistrarSolicitacaoEsquecimento]
                                                        |
                                        SolicitacaoEsquecimentoRegistrada (bus nexo-dominio-bus)
                                                        |
                    +-----------------------------------+-----------------------------------+
                    v                                   v                                   v
     [BC Ingestão&Identificação]              [BC Extração (002, futuro)]         [BC N... (futuro)]
     AnonimizarDadoPessoalDoOrcamento          AnonimizarDadoPessoalDoOrcamento    (mesma obrigação estrutural)
                    |                                   |
     DadoPessoalAnonimizadoNoContexto          DadoPessoalAnonimizadoNoContexto
                    +-----------------------------------+-----------------------------------+
                                                        v
                                    [Conformidade: AcompanharConfirmacoesDeAnonimizacao]
                                          (agrega por solicitacaoId; todas confirmadas
                                           dentro do prazo => SolicitacaoEsquecimentoConcluida;
                                           prazo excedido sem todas => PrazoExcedido, nunca
                                           autoconclusão)

[EventBridge Scheduler, diário] --(evento)--> [cada BC: AplicarPoliticaRetencaoDoContexto]
                                                       (lê platform.politicas_retencao por
                                                        categoriaDocumento; expira/anonimiza
                                                        localmente; publica
                                                        RetencaoAplicadaNoContexto)

[Toda chamada de leitura/escrita sobre dado de orçamento, em qualquer BC]
        --(decorator de Application Service)--> [platform.trilha_auditoria_acesso]
        (append-only, correlacionável por orcamentoId — nunca substitui o historico do BC)
```

**Relação entre Conformidade e os demais BCs**: nenhuma é Customer/Supplier — é uma relação de **evento simétrico bidirecional** (cada lado publica o que o outro consome, nenhum lado depende do modelo interno do outro). Conformidade nunca importa código de nenhum BC nem acessa sua tabela; cada BC nunca importa código de Conformidade — apenas assina o `detail-type` do evento no mesmo bus `nexo-dominio-bus`.

**Anti-Corruption Layer**: não aplicável aqui — não há resposta de sistema externo (Bedrock/MarkItDown) a traduzir nesta spec. A "tradução" relevante é cada BC decidir, no seu próprio Domain, quais campos do seu agregado são dado pessoal (ex.: e-mail/telefone de contato do fornecedor) — essa decisão MUST viver no Domain de cada BC (é regra de negócio de quais campos são sensíveis), nunca em uma lista genérica mantida pela Conformidade.

## Domain — Agregados, VOs, Domain Events

### Agregado (único, escopo do componente de plataforma Conformidade): `SolicitacaoEsquecimento`

- **Identidade**: `SolicitacaoEsquecimentoId` (UUID v7, mesma convenção de 001).
- **Atributos**: `titularReferencia` (VO `ReferenciaTitular` — identifica a pessoa/contato, nunca o `OrcamentoId` sozinho, pois um titular pode aparecer em múltiplos orçamentos/BCs), `registradaEm`, `prazoLimite` (calculado a partir da política de retenção vigente na categoria aplicável — ver Assunção da spec, 30 dias default), `status` (VO `StatusSolicitacao`: REGISTRADA | EM_ANDAMENTO | CONCLUIDA | PRAZO_EXCEDIDO), `contextosEsperados` (lista fechada, config-driven, de quais BCs devem confirmar — nunca hardcoded no código de negócio, para não exigir alteração de Domain a cada novo BC; ver Infrastructure), `confirmacoes` (lista imutável append-only de `ConfirmacaoAnonimizacao`).
- **Invariantes**:
  - Só transita para `CONCLUIDA` quando `confirmacoes` cobre 100% de `contextosEsperados`, dentro de `prazoLimite`.
  - Se `prazoLimite` expira sem cobertura total, transita para `PRAZO_EXCEDIDO` — nunca para `CONCLUIDA` por decurso de tempo (idêntico em espírito ao Princípio IV: nenhuma fila autoaprova por exaustão de tempo).
  - `registrarConfirmacao(contexto, resultado)`: rejeita confirmação duplicada do mesmo contexto (idempotente, mantém apenas a primeira); nunca remove confirmação já registrada.

### Value Objects (compartilhados por convenção de nomenclatura, cada BC os declara localmente — nunca import cross-BC; ver ADR-004)

- `CategoriaDocumento` — enum fechado; único valor conhecido hoje: `ORCAMENTO_FORNECEDOR` (dado de orçamento recebido pelo pipeline). Novas categorias exigem alteração de código (decisão estrutural deliberada) — apenas o **prazo** por categoria é dado de configuração, conforme literal do critério de aceite ("configurável... sem exigir mudança de código" refere-se ao prazo, não à lista de categorias, que é taxonomia de negócio).
- `PoliticaRetencao` — `{ categoria: CategoriaDocumento, prazoEmDias: number positivo, baseLegal: string, atualizadaEm }`.
- `ReferenciaTitular` — identifica o titular de dado pessoal de forma estável entre BCs (ex.: e-mail normalizado ou CNPJ+contato) sem expor a modelagem interna de nenhum BC.
- `DadoAnonimizado` — marcador de campo anonimizado: `{ campoOriginal: string, metodo: 'MASCARAMENTO' | 'REMOCAO', aplicadoEm, solicitacaoId }`; nunca contém o valor original nem permite reversão (VO deliberadamente sem construtor que aceite o dado original de volta).
- `ConfirmacaoAnonimizacao` — `{ boundedContext: string, orcamentoId, camposAnonimizados: DadoAnonimizado[], confirmadoEm }`.

### Domain Events (payload sempre com `schemaVersion: 1`, `ocorreuEm`; `source = nexo.conformidade` para os publicados pelo processo de coordenação, `source = nexo.<bc-slug>` para os publicados por cada BC — mesma convenção de nomenclatura de 001)

1. `SolicitacaoEsquecimentoRegistrada` — publicado por `RegistrarSolicitacaoEsquecimento`. Payload: `solicitacaoId`, `titularReferencia`, `contextosEsperados`, `prazoLimite`.
2. `DadoPessoalAnonimizadoNoContexto` — publicado por **cada BC**, no seu próprio `source`, ao concluir `AnonimizarDadoPessoalDoOrcamento`. Payload: `solicitacaoId`, `orcamentoId`, `boundedContext`, `camposAnonimizados`.
3. `SolicitacaoEsquecimentoConcluida` — publicado pela Conformidade quando todas as confirmações chegam dentro do prazo.
4. `SolicitacaoEsquecimentoPrazoExcedido` — publicado pela Conformidade se o prazo expira sem 100% de confirmação; MUST disparar alarme (ver Observabilidade) — nunca é um evento "normal" de fluxo feliz.
5. `RetencaoAplicadaNoContexto` — publicado por **cada BC**, no seu próprio `source`, ao concluir `AplicarPoliticaRetencaoDoContexto`. Payload: `boundedContext`, `categoria`, `quantidadeAfetada`, `janelaAplicada`.

Nota, mesmo espírito da nota de 001: `SolicitacaoEsquecimentoConcluida`/`PrazoExcedido` são os únicos eventos de saída estáveis do processo Conformidade que um consumidor externo (ex.: painel administrativo) deve assinar; `DadoPessoalAnonimizadoNoContexto`/`RetencaoAplicadaNoContexto` são publicados por cada BC no seu próprio namespace de evento — não pertencem ao Conformidade, apenas são consumidos por ele.

## Application — Casos de uso

### No componente de plataforma Conformidade (`src/platform/conformidade/`)

- `RegistrarSolicitacaoEsquecimento(titularReferencia)` — endpoint administrativo. Resolve `contextosEsperados` a partir de config (lista de BCs que declaram possuir dado pessoal — ver Infrastructure), cria agregado, persiste, publica `SolicitacaoEsquecimentoRegistrada`.
- `AcompanharConfirmacoesDeAnonimizacao(solicitacaoId, confirmacao)` — consumidor de `DadoPessoalAnonimizadoNoContexto` (via SQS). Aplica `SolicitacaoEsquecimento.registrarConfirmacao`; se completo, publica `SolicitacaoEsquecimentoConcluida`.
- `VerificarPrazoDasSolicitacoes()` — job agendado (EventBridge Scheduler, diário). Varre solicitações `REGISTRADA`/`EM_ANDAMENTO` com `prazoLimite` expirado sem cobertura total, transita para `PRAZO_EXCEDIDO`, publica evento, dispara alarme.
- `AtualizarPoliticaRetencao(categoria, prazoEmDias, baseLegal)` — endpoint administrativo (RBAC restrito a grupo Cognito `compliance-admin`); grava em `platform.politicas_retencao`; nunca requer deploy de código.
- `ConsultarTrilhaDeAuditoria(orcamentoId)` — query, agrega (a) leitura via API pública de cada BC do histórico de pipeline daquele `orcamentoId` (Princípio I, já existente) e (b) `platform.trilha_auditoria_acesso` filtrada pelo mesmo id — nunca acessa a tabela interna de outro BC diretamente, apenas o contrato de leitura já publicado por ele (ex.: `ConsultarStatusOrcamento` de 001).

### Dentro de cada Bounded Context existente/futuro (obrigação estrutural desta spec sobre 001 e sobre 002–007 quando forem arquitetados)

- `AnonimizarDadoPessoalDoOrcamento(orcamentoId, solicitacaoId)` — consumidor de `SolicitacaoEsquecimentoRegistrada`, filtrado por `titularReferencia` correspondendo a algum orçamento sob a responsabilidade daquele BC. Aplica anonimização sobre os campos que o Domain daquele BC já sabe serem dado pessoal (ex.: em 001, dado de contato eventualmente capturado; em 002/Extração, dado de contato dentro de itens extraídos), grava nova versão (Princípio III), publica `DadoPessoalAnonimizadoNoContexto`. Se aquele BC não possuir dado do titular, publica a mesma confirmação com `camposAnonimizados: []` (confirmação de "nada a fazer" — nunca silêncio, sempre resposta explícita).
- `AplicarPoliticaRetencaoDoContexto()` — job agendado por BC. Lê `platform.politicas_retencao` (config compartilhada, leitura apenas), identifica dados daquele BC além do `prazoEmDias` da categoria aplicável, expira (S3 lifecycle já tagueado por `categoria` na ingestão) ou anonimiza (Aurora), publica `RetencaoAplicadaNoContexto`.

Todos os casos de uso publicam via a mesma interface `EventPublisher` (implementada sobre EventBridge) já estabelecida em 001 — nenhum caso de uso novo introduz mecanismo de publicação alternativo.

## Infrastructure

- `platform.solicitacoes_esquecimento`, `platform.confirmacoes_anonimizacao`, `platform.politicas_retencao`, `platform.trilha_auditoria_acesso` — schema Aurora dedicado ao componente de plataforma, via Drizzle (mesma convenção de ORM de 001, ADR-001).
- Config de `contextosEsperados`: tabela simples `platform.contextos_com_dado_pessoal` (BC slug + booleano "possui dado pessoal"), mantida por quem arquiteta cada novo BC — cada spec futura (002–007) MUST declarar essa linha ao ser arquitetada; PENDENTE até 002–007 serem desenhados (risco remanescente, ver abaixo).
- `AuditoriaAccessLogger` — decorator/middleware de Application Service aplicado nos casos de uso de leitura/escrita de dado de orçamento de cada BC; grava em `platform.trilha_auditoria_acesso`. É infraestrutura transversal sem regra de negócio (equivalente a logging/OpenTelemetry) — ver ADR-003 para a justificativa de por que isso não viola a convenção "sem import cross-BC" de 001.
- `AWS Organizations` — 3 contas separadas (dev, hml, prod) sob a mesma Organization; Service Control Policies (SCP) bloqueando: cópia de snapshot RDS/S3 de prod para dev/hml sem passar por pipeline de anonimização; acesso IAM cross-conta fora dos papéis de deploy explícitos.
- `GuardDuty` + `Security Hub` + `AWS Config` (conformance packs) — detecção de ameaça e desvio de configuração, gerenciados, sem servidor fixo (Princípio VI); satisfaz "Fora de escopo: ferramenta específica não é requisito, mas mecanismo deve existir e funcionar".
- IAM: role dedicada para os Lambdas do componente Conformidade (`ConformidadeLambdaRole`), sem `s3:GetObject`/`s3:PutObject` em bucket de nenhum BC — Conformidade nunca acessa dado bruto diretamente, apenas via evento/API pública.
- CI/CD (GitHub Actions, OIDC): role de deploy por conta/ambiente, nunca uma role única com acesso às 3 contas simultaneamente.

## Interface

- `POST /v1/conformidade/solicitacoes-esquecimento` — RBAC `compliance-admin`. Body: `titularReferencia`. Retorna `solicitacaoId` + `prazoLimite`.
- `GET /v1/conformidade/solicitacoes-esquecimento/{id}` — status + confirmações recebidas até o momento.
- `PUT /v1/conformidade/politicas-retencao/{categoria}` — RBAC `compliance-admin`. Body: `prazoEmDias`, `baseLegal`. Sem deploy de código, efeito imediato no próximo ciclo agendado.
- `GET /v1/conformidade/politicas-retencao` — lista todas as categorias e prazos vigentes.
- `GET /v1/conformidade/auditoria/{orcamentoId}` — RBAC `compliance-admin` ou `gestor-de-compras` restrito ao próprio tenant (Fase 03/multi-tenant, 007 — a integrar quando 007 for arquitetada). Retorna trilha agregada (pipeline + acesso).
- Todos os endpoints validam entrada via Zod na borda; Problem Details (RFC 7807) para erro; autenticação via Cognito (mesma convenção de 001).

## Segurança (riscos específicos desta spec)

- **Irreversibilidade da anonimização**: `DadoAnonimizado` é um VO sem construtor que aceite valor original de volta — impede reconstrução acidental do dado pessoal a partir do próprio código de domínio. Mascaramento MUST ser feito por função determinística sem chave reversível (hash unidirecional ou remoção literal), nunca criptografia simétrica reversível.
- **Vazamento de dado real de prod para dev/hml**: mitigado por SCP de AWS Organizations bloqueando cópia direta de snapshot; qualquer necessidade de dado "realista" em hml MUST passar pelo mesmo caso de uso de anonimização como etapa de pipeline de seed, nunca uma cópia bruta.
- **Excesso de privilégio no processo de auditoria**: `platform.trilha_auditoria_acesso` é append-only — nenhuma role, incluindo a de administrador de conformidade, tem `UPDATE`/`DELETE` sobre essa tabela (nem mesmo o Domain permite operação de alteração — só `INSERT`).
- **Confiança implícita entre Conformidade e BCs**: Conformidade nunca lê banco de outro BC (mitiga acoplamento e reduz superfície de acesso); cada BC decide, no seu próprio Domain, o que é dado pessoal — Conformidade nunca impõe uma lista genérica que poderia estar desalinhada com o modelo real de cada contexto.
- **Sem risco de prompt injection**: esta spec não envolve agente de IA generativa (`envolve_ia_ou_agentes: false`); risco específico da cadeia de agentes (ver 001) não se aplica aqui.

## Project Structure

### Documentation (this feature)

```text
specs/008-hardening-seguranca-lgpd/
├── spec.md               # já existente, clarificado (versão 1)
├── plan.md               # este arquivo
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root) — extensão da convenção de 001

```text
src/
├── platform/                                  # NOVO — componentes transversais, não BCs de negócio (ver ADR-003)
│   ├── conformidade/
│   │   ├── domain/
│   │   │   ├── solicitacao-esquecimento.aggregate.ts
│   │   │   ├── value-objects/ (solicitacao-esquecimento-id, referencia-titular, status-solicitacao, confirmacao-anonimizacao)
│   │   │   ├── events/ (solicitacao-esquecimento-registrada, solicitacao-esquecimento-concluida, solicitacao-esquecimento-prazo-excedido)
│   │   │   └── repositories/ (solicitacao-esquecimento.repository.ts — interface)
│   │   ├── application/
│   │   │   └── use-cases/ (registrar-solicitacao-esquecimento, acompanhar-confirmacoes-de-anonimizacao, verificar-prazo-das-solicitacoes, atualizar-politica-retencao, consultar-trilha-de-auditoria)
│   │   ├── infrastructure/
│   │   │   ├── persistence/ (drizzle-solicitacao-esquecimento.repository.ts, schema/)
│   │   │   └── aws/ (eventbridge.publisher.ts — reaproveita implementação de 001, scheduler-trigger.ts)
│   │   └── interface/
│   │       ├── http/ (controllers REST + Zod schemas)
│   │       └── events/ (handlers Lambda consumidores de SQS de DadoPessoalAnonimizadoNoContexto)
│   └── shared-value-objects/                   # categoria-documento, politica-retencao, dado-anonimizado
│       └── domain/ (ver ADR-004 sobre por que estes VOs são compartilhados)
└── bounded-contexts/
    └── ingestao-identificacao/                 # já existente (001) — extensão desta spec
        ├── domain/
        │   └── value-objects/ (campo-pessoal-marker — decisão local do BC sobre o que é dado pessoal)
        ├── application/
        │   └── use-cases/ (anonimizar-dado-pessoal-do-orcamento.ts, aplicar-politica-retencao-do-contexto.ts)  # NOVOS
        └── infrastructure/
            └── (extensão dos gateways existentes — sem novo componente de infraestrutura além do decorator de auditoria)

tests/
├── platform/conformidade/
│   ├── domain/ (unit, sem mocks de rede)
│   ├── application/ (unit, mocks de repositório/gateway)
│   └── contract/ (contratos REST)
└── bounded-contexts/ingestao-identificacao/
    └── application/ (unit dos 2 novos casos de uso, mocks de gateway)
```

**Structure Decision**: mantém monorepo único de 001. Introduz `src/platform/` como categoria de pasta irmã de `src/bounded-contexts/`, exclusivamente para componentes transversais sem modelo de negócio próprio — não é um precedente para "BC leve", é uma categoria estrutural distinta (ver ADR-003). Cada BC existente/futuro ganha exatamente 2 novos casos de uso de Application, sem novo agregado — a obrigação recai sobre `plan.md` de cada BC futuro (002–007) ao ser arquitetado.

## Complexity Tracking

| Violação (de convenção, não de princípio) | Por que necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Pasta `src/platform/` fora de `bounded-contexts/` (desvio da convenção #5 de 001) | Coordenação de direito ao esquecimento precisa de um lugar para viver que não seja "dono" de dado de negócio de nenhum BC | Modelar Conformidade como um BC de negócio pleno contrariaria a instrução explícita desta tarefa e criaria um agregado de domínio artificial sobre um processo que é, na essência, administrativo/regulatório, não uma capacidade de domínio de compras |
| VOs compartilhados (`CategoriaDocumento`, `PoliticaRetencao`, `DadoAnonimizado`) declarados em `shared-value-objects/` e replicados por import local em cada BC (ADR-004) | Sem eles, cada BC reinventaria a taxonomia de categoria/retenção de forma incompatível, quebrando o requisito de política única "configurável por categoria" | Duplicar a definição do VO em cada BC sem um ponto único de declaração arriscaria drift de enum entre contextos (ex.: um BC aceitando categoria que outro rejeita) |

## ADRs desta spec

### ADR-003 — Componente de coordenação transversal (`src/platform/`) em vez de Bounded Context de negócio

**Contexto**: direito ao esquecimento exige coordenar confirmações de múltiplos BCs; a convenção de 001 só define layout para Bounded Contexts de negócio.

**Problema**: onde vive o código que agrega confirmações e decide "solicitação concluída", sem violar a regra de que cada BC é dono exclusivo do seu próprio dado?

**Alternativas consideradas**: (a) modelar "Conformidade" como um BC de negócio pleno, com seu próprio Context Map e agregado de domínio "rico"; (b) embutir a lógica de agregação dentro do BC de Acompanhamento (que já lê eventos de todos os contextos para o Portal do Gestor); (c) componente de plataforma dedicado, fora de `bounded-contexts/`, com um agregado de coordenação deliberadamente pequeno.

**Vantagens (c)**: não força um Bounded Context de negócio artificial só para hospedar um processo administrativo; não sobrecarrega o BC de Acompanhamento com uma responsabilidade regulatória que não é sua Ubiquitous Language (Acompanhamento é sobre status/auditoria de pipeline para o gestor de compras, não sobre LGPD); mantém o processo simétrico (nenhum BC de negócio "manda" em outro).

**Desvantagens**: introduz uma terceira categoria de pasta (`platform/`) que Ricardo precisa entender como distinta de `bounded-contexts/`; exige disciplina para não se tornar um "God module" se novas capacidades transversais forem adicionadas sem critério.

**Decisão**: componente de plataforma dedicado (`src/platform/conformidade/`), com agregado de coordenação (`SolicitacaoEsquecimento`) que não modela nenhum conceito de negócio de compras — modela apenas o processo regulatório em si.

**Trade-offs**: aceita uma pequena inconsistência estrutural (uma pasta que não é nem BC nem infra genérica) em troca de não distorcer o Context Map de negócio real do produto.

**Impactos futuros**: qualquer nova capacidade verdadeiramente transversal (não de negócio de compras) — ex.: uma futura spec de "otimização de custo" (009) que precise coordenar múltiplos BCs — MUST avaliar primeiro se cabe em `src/platform/` existente antes de criar uma quarta categoria estrutural.

### ADR-004 — Value Objects de conformidade declarados em módulo compartilhado (`shared-value-objects/`), nunca importados como código de domínio entre BCs de negócio

**Contexto**: `CategoriaDocumento` e `PoliticaRetencao` precisam do mesmo shape em todos os BCs (para a política de retenção ser de fato única e configurável centralmente); a convenção de 001, item 5, proíbe "código nunca compartilhado por import direto entre contextos".

**Problema**: como garantir uma única taxonomia de categoria/retenção sem violar o isolamento de Domain entre Bounded Contexts de negócio?

**Alternativas consideradas**: (a) cada BC declara sua própria cópia local do enum/VO, sincronizada manualmente por convenção de nome; (b) um módulo compartilhado `shared-value-objects/`, importado por qualquer BC que precise, tratado como excecão explícita à regra de 001 porque é taxonomia regulatória/administrativa, não regra de negócio de domínio de compras; (c) resolver via evento (cada BC pede a categoria vigente a Conformidade por API, nunca importa o VO).

**Vantagens (b)**: elimina risco de drift entre BCs (ex.: um BC aceitando uma categoria que outro rejeita); é consistente com o próprio precedente da constituição de tratar "escopo de UI" e "MarkItDown vs Textract" como Additional Constraints atravessando todos os BCs sem que isso implique acoplamento de domínio de negócio.

**Desvantagens**: é, tecnicamente, import de código cross-módulo — exige disciplina para que `shared-value-objects/` nunca cresça para conter regra de negócio de domínio de compras (se isso acontecer, é sinal de que deveria ter sido resolvido via evento, não via import).

**Decisão**: `shared-value-objects/` como módulo compartilhado, restrito a VOs de taxonomia regulatória (categoria, política de retenção, marcador de anonimização) — nunca a agregados, nunca a Value Objects de domínio de compras (ex.: `Dinheiro`, `CNPJ` de um BC continuam declarados localmente naquele BC, sem mover para lá).

**Trade-offs**: aceita uma única exceção pontual e nomeada à regra "sem import cross-contexto" de 001, em vez de replicar taxonomia ou pagar o custo de uma chamada síncrona de API para resolver um enum estático.

**Impactos futuros**: specs 002–007, ao serem arquitetadas, MUST importar `CategoriaDocumento`/`PoliticaRetencao` de `shared-value-objects/` em vez de redeclarar localmente; qualquer VO novo cogitado para esse módulo MUST passar pelo teste "é taxonomia regulatória atravessando todos os BCs, ou é regra de negócio de um BC específico?" antes de entrar lá.
