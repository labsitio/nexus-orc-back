# Plano de infraestrutura e ambientes dev/prod — Nexo

Complementa `docs/plano-finalizacao.md` (Fases 4/5, §5). Não contradiz: aqui
detalha-se o "como" da Fase 4 (handlers de produção + IAM) e da Fase 5
(bloqueio de credencial AWS), com foco no requisito do dono do repo: **um
código-fonte, dois ambientes, chaveados por configuração**.

Verificado no código em 2026-08-03 (worktree
`/home/victor1090/Documentos/Labs/nexus-orc-back`, branch `main`):
`infra/lib/` tem 16 stacks (7 filas SQS, 1 bus, 1 bucket, 7 roles IAM), zero
`lambda.Function`/`NodejsFunction`. `src/` tem zero `export const handler`.
`src/composition/`, `src/dev/`, `tests/composition/` existem como untracked
(recuperados de `git stash`, não commitados — decisão do dono pendente).
`.env.example`, o script `dev:seed` e a dependência `@aws-sdk/client-sqs`
seguem em `stash@{0}`, não restaurados; por isso `tsc` falha hoje em
`src/dev/seed-localstack.ts`.

## 1. Matriz de recursos dev × prod

| Recurso | Dev (local) | Como é simulado | Prod | Chave de swap |
|---|---|---|---|---|
| S3 (`nexo-orcamentos-raw`) | LocalStack | `S3Client({forcePathStyle:true, requestChecksumCalculation:'WHEN_REQUIRED'})` — mesmo adaptador `S3ArmazenamentoBrutoGateway` de produção | Bucket real via `infra/lib/ingestao-identificacao-storage-stack.ts` | `AWS_ENDPOINT_URL` (lido nativamente pelo AWS SDK v3) + `NEXO_BUCKET_RAW` |
| EventBridge (`nexo-dominio-bus`) | LocalStack | mesmo `EventBridgePublisher` | Bus real via `infra/lib/dominio-event-bus-stack.ts` | `AWS_ENDPOINT_URL` + `NEXO_EVENT_BUS` |
| SQS (7 filas) | LocalStack | `SQSClient({useQueueUrlAsEndpoint:false})` | Filas reais via `infra/lib/*-queue-stack.ts` | `AWS_ENDPOINT_URL` |
| Lambda (handlers de fila/HTTP) | **Não existe hoje nem local nem prod.** Precedente formal: #589 (rodar o Lambda MarkItDown no LocalStack Lambda, community suporta Lambda) | LocalStack Lambda (`docker-compose.yml`), mesmo `InvokeCommand` do cliente | `NodejsFunction`/`lambda.Function` no CDK, role dedicada já existe para 7 casos de uso | Nenhuma — é código que falta em ambos os ambientes (ver §3) |
| Aurora Postgres/pgvector | Postgres local (Docker) | Drizzle/`node-postgres` sobre TCP, `DATABASE_URL` | Aurora Serverless v2 + RDS Proxy | `DATABASE_URL` — já é swap puro de config, sem porta nova (ADR-001 já registra: acesso via TCP, nunca RDS Data API) |
| Bedrock (classificação, extração, categorização T151, embedding 004, orquestração 005) | **Não roda em LocalStack community** (é recurso Pro) | Requer implementação alternativa da porta de domínio (`AgenteClassificadorGateway` e irmãs) — não é troca de endpoint | `BedrockClassificadorGateway` etc., `bedrock:InvokeModel` restrito a ARN do modelo | Seleção de implementação por config (`NEXO_AGENTE_IA=local\|bedrock`), nunca por endpoint — ver §5 |
| Cognito | Não verificado nesta tarefa — `RotaOpts.preHandler` em `src/composition/ingestao-identificacao.ts` já modela o ponto de injeção (auth desligada localmente) | — | Cognito real, JWT | Presença/ausência de `preHandler` — decisão explícita de não autenticar localmente já está documentada no doc-comment de `registrarRotasIngestaoIdentificacao` |
| DynamoDB (cache identificação, spec 009) | Não implementado ainda (#359, #366) | LocalStack | Tabela real | `AWS_ENDPOINT_URL` (mesmo padrão) |

**Regra geral confirmada no código**: para S3/SQS/EventBridge/Postgres o swap
é 100% `AWS_ENDPOINT_URL`/`DATABASE_URL` — o mesmo adaptador de produção roda
contra LocalStack sem nenhuma classe trocada. Isso já é prática no repo
(`src/dev/config.ts`), não uma proposta nova. **Bedrock é a única exceção
genuína**: LocalStack community não o emula, logo a única forma honesta de
"testar o fluxo local" é uma segunda implementação da mesma porta de
domínio, escolhida por variável de ambiente — não um endpoint alternativo.

## 2. Contrato de configuração

Variáveis já existentes (`src/dev/config.ts`, `.env.example` em
`stash@{0}`, não commitado ainda):

| Variável | Dev | Prod | Ausente → |
|---|---|---|---|
| `AWS_REGION` | `us-east-1` | região real | default do SDK (pode assumir errado silenciosamente — **recomendo falha rápida em prod**, hoje não valida) |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` | **ausente** (SDK usa endpoint real da AWS) | `clientesLocais()` já lança erro explícito se ausente em dev (`src/dev/config.ts:53`) — correto |
| `AWS_ACCESS_KEY_ID`/`SECRET` | `test`/`test` | via IAM Role da execução (Lambda), nunca env var | N/A em prod — Lambda usa a role, não credenciais estáticas |
| `NEXO_BUCKET_RAW` | `nexo-orcamentos-raw` | idêntico (mesmo nome, conta distinta) | default hardcoded no código hoje (`'nexo-orcamentos-raw'`) — aceitável mas caminho maduro é IAM/CDK injetar via `Environment` da Lambda, não confiar em default |
| `NEXO_EVENT_BUS` | `nexo-dominio-bus` | idêntico | idem — default hoje, migrar para env var obrigatória na Lambda de produção |
| `DATABASE_URL` | Postgres local | Aurora via RDS Proxy | **já resolvido, verificado**: `src/shared-kernel/database/client.ts:5` lê a variável e lança erro explícito se ausente (falha rápida no import), montando um `Pool` único por processo e exportando `db`. Não está em `src/dev/config.ts` porque é global ao processo, não específico de dev. Consequência para a Lambda: a ausência falha no *init*, não na invocação — comportamento desejável, mas exige `DATABASE_URL` no `environment` de toda `NodejsFunction` que importe a cadeia de persistência |
| `NEXO_LOCAL_CONFIANCA` | `90` (default) | não se aplica (só dev) | default no código |
| `NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO` | `false` | não se aplica | default no código |
| `NEXO_AGENTE_IA` (**proposta**, não existe hoje) | `local` | `bedrock` | falha rápida no boot da composition root — sem essa variável não dá para saber qual gateway instanciar |
| `PORT` | `3000` | porta do Fastify (se rodar em ECS/Fargate; Lambda não usa) | default no código |

**Falta hoje, não suposição**: nenhuma variável de seleção de ambiente
(`NEXO_AGENTE_IA` ou equivalente) existe no código lido. `DATABASE_URL` não
aparece em `src/dev/config.ts` — quem monta o `NodePgDatabase` passado a
`IngestaoIdentificacaoDeps.db` não foi localizado nesta tarefa (fora do
escopo dos arquivos lidos); recomendo o dev-back-end confirmar antes de
assumir que a composition root já resolve isso.

## 3. Handlers Lambda de produção — formato recomendado

**Recomendação: `export const handler` direto, sem adapter Fastify, sem
container**, por caso de uso/consumidor de fila. Trade-off:

- Fastify-sobre-Lambda (`@fastify/aws-lambda` ou similar) faz sentido quando
  há muitas rotas HTTP e se quer 1 Lambda servindo tudo. Aqui os "handlers"
  de fila (`classificador-queue`, `extrator-queue`, `validador-queue`, +4)
  não são HTTP — são consumidores SQS. Meter Fastify no meio é dependência e
  cold start sem ganho: a fábrica (`criarClassificadorQueueHandler(deps)`)
  já devolve exatamente a assinatura `(event) => Promise<response>` que a
  AWS Lambda runtime para Node espera.
- Container (Docker image Lambda) só se justifica se houver dependência
  nativa pesada ou se o pacote runtime ultrapassar os limites de layer —
  não é o caso aqui (TS puro + AWS SDK v3).

**Onde os arquivos ficam**: um arquivo por Lambda em
`src/bounded-contexts/<bc>/interface/events/<nome>.production.ts` (ou
`.lambda.ts`), fino, só compondo:

```ts
// src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.production.ts
import { criarClassificadorQueueHandler } from './classificador-queue.handler.js';
import { criarIngestaoIdentificacao } from '../../../../composition/ingestao-identificacao.js';
import { clientesProducao } from '../../../../composition/aws-clients.production.js'; // novo, espelha clientesLocais()

const deps = clientesProducao(); // lê env vars de prod, monta S3Client/EventBridgeClient reais
const modulo = criarIngestaoIdentificacao(deps);
export const handler = criarClassificadorQueueHandler(modulo.classificarOrcamento);
```

A mesma fábrica (`criarClassificadorQueueHandler` e as 3 irmãs em
`extrator-queue.handler.ts`, `validador-queue.handler.ts`,
`sftp-upload.handler.ts`) serve ao handler de produção acima **e** a
`src/dev/local.ts` sem duplicar wiring — só quem constrói `deps` muda
(`clientesLocais()` vs. uma futura `clientesProducao()`), exatamente o
padrão que `src/composition/ingestao-identificacao.ts` já documenta no
próprio doc-comment ("o que muda é só quem constrói `deps`"). Não existe
hoje um `clientesProducao()` — é o item que falta (ver issues, §7).

**Composition root de produção fica neste repo** (`src/composition/` +
`infra/lib/`) — o dono do repo já respondeu essa metade da decisão pendente
listada em `docs/plano-finalizacao.md` §5 ao pedir "um plano de infra que
vai ficar nesse repo". Registrar isso fecha a lacuna de ADR apontada lá.

## 4. CDK — declarar as Lambdas

Para cada uma das 7 filas/roles já existentes, adicionar em `infra/lib/` uma
`NodejsFunction` (via `aws-cdk-lib/aws-lambda-nodejs`, que já faz bundling
com esbuild — sem passo de build manual):

```ts
new NodejsFunction(this, 'ClassificadorFunction', {
  entry: 'src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.production.ts',
  handler: 'handler',
  role: classificadorLambdaRole, // já existe, stack separada
  environment: { NEXO_EVENT_BUS: 'nexo-dominio-bus', DATABASE_URL: ... },
  timeout: Duration.seconds(30), // calibrar por caso de uso, não copiar valor único
});
new SqsEventSource(classificadorQueue) // liga a fila já existente como trigger
```

**Dev × prod no CDK**: mesma definição de `NodejsFunction`; o que muda é o
alvo do deploy. Precedente já registrado no board para "Lambda rodando
localmente": #589 propõe `cdklocal`/LocalStack Lambda para o Lambda
MarkItDown, mantendo `InvokeCommand` idêntico — mesmo caminho serve às 7
Lambdas de fila.

**`cdk synth` local**: valida sintaxe CDK, resolução de tipos, e que
IAM/roles/ARNs referenciados existem nas stacks — **não valida** que a
política IAM realmente concede o necessário em tempo de execução (LocalStack
community não valida IAM, `docs/plano-finalizacao.md` já registra isso), nem
mede cold start/performance real, nem testa o código do handler contra
Bedrock real. `cdklocal deploy` (LocalStack Pro teria Lambda completo; a
community já supporta Lambda per #589) valida que o handler roda e a fila
aciona — é o gate mais forte disponível sem credencial AWS. Recomendo os
dois: `cdk synth` no CI (rápido, sem Docker), `cdklocal deploy` + teste de
integração no dev local antes de abrir PR.

## 5. Modelo local no lugar do Bedrock

**Recomendação de runtime**: Ollama (`ollama serve`, container no
`docker-compose.yml` já existente para LocalStack — mesma composição).
Motivo: API HTTP compatível com o formato de `chat`/`generate` já usado por
qualquer cliente HTTP simples, sem SDK proprietário; suporta saída JSON
restrita a schema (`format: "json"` no request) — atende ao requisito de
"classificação devolve confiança numérica, extração devolve campos" sem
parsing de texto livre por regex, mesma restrição que os ACLs de Bedrock já
impõem (`BedrockClassificadorGateway` e irmãs).

**Modelo**: um modelo pequeno o bastante para rodar em CPU de dev machine
(ex.: família Llama 3.1 8B ou Qwen2.5 7B via Ollama) — não é recomendação de
acurácia, é recomendação de "roda em qualquer laptop do time sem GPU
dedicada". Fidelidade de classificação **não é objetivo** — já registrado
como não-requisito pelo dono do repo.

**Seleção por configuração, não por BC novo nem fork de gateway**: as portas
de domínio já existentes — nomes confirmados no código por `grep`, são **6**,
não 5:

| Porta | Arquivo | Spec |
|---|---|---|
| `AgenteClassificadorGateway` | `ingestao-identificacao/domain/gateways/agente-classificador.gateway.ts` | 001 |
| `AgenteExtratorGateway` | `extracao/domain/gateways/agente-extrator.gateway.ts` | 002 |
| `AgenteCategorizadorItemGateway` | `validacao/domain/gateways/agente-categorizador-item.gateway.ts` | 003 (#151) |
| `AgenteEmbeddingGateway` | `busca-indexacao/domain/gateways/agente-embedding.gateway.ts` | 004 |
| `AgenteInterpretadorConsultaGateway` | `busca-indexacao/domain/gateways/agente-interpretador-consulta.gateway.ts` | 004 |
| `AgenteOrquestradorGateway` | `orquestracao/domain/gateways/agente-orquestrador.gateway.ts` | 005 |

004 tem **duas** portas de IA (embedding e interpretação de consulta em
linguagem natural), não uma — e a de embedding tem restrição extra que as
outras não têm: o vetor local precisa ter a **mesma dimensionalidade** do
modelo de produção, senão o schema pgvector e os índices já criados não
servem para os dois ambientes. Confirmar a dimensão esperada no schema antes
de escolher o modelo de embedding local.

Cada uma ganha uma segunda implementação
`Ollama<Nome>Gateway` ao lado da `Bedrock<Nome>Gateway` existente. A
composition root escolhe qual instanciar lendo `NEXO_AGENTE_IA` (proposta,
§2) — não um `if` espalhado pelo domínio, e não uma nova pasta de bounded
context. Isso é reforço direto do requisito do dono: "não fork de código nem
adaptador duplicado onde for evitável" — aqui a duplicação é a mínima
possível (implementação de porta), não estrutura.

**O que essa substituição NÃO prova** (honestidade explícita, aceita pelo
dono do repo):
- Fidelidade de classificação/extração comparada ao modelo Claude real em
  produção.
- Calibração de confiança — o campo `confianca` que o domínio usa para
  decidir escalonamento (`>= X classifica, < X escalona`) não tem o mesmo
  comportamento estatístico entre um modelo pequeno local e Bedrock; não dá
  para tunar o limiar de produção observando só o ambiente local.
- Comportamento de prompt injection — as issues #64, #109, #158, #203, #259
  (revisão de segurança "com Bedrock real") continuam bloqueadas por
  credencial AWS; um teste adversarial contra o modelo local não substitui
  essa revisão, só exercita que o pipeline de sanitização de prompt roda sem
  erro.
- Latência/custo real de inferência — p95 medido localmente não tem relação
  com p95 de Bedrock em produção (#107, #157, #202, #258 continuam
  bloqueadas).
- **Completude de extração de documento dentro do orçamento de tempo do
  pipeline** (achado ADR-015, teste ponta a ponta pós-#734/#735/#736): sem
  GPU, extração de documento com poucos itens leva ~156s por tentativa; um
  documento com 10 itens não completou em nenhuma das 3 tentativas
  (`maxReceiveCount`) antes de cair na DLQ — uma por `headersTimeout` do
  undici (~300s), outra por shape inválido do modelo. Ollama local prova o
  encadeamento de eventos ponta a ponta (001→002→003→004→005); **não prova**
  que extração de documento realista completa dentro do timeout do pipeline.
  Não confundir "roda sem erro de wiring" com "processa em tempo viável" —
  são afirmações diferentes, e só a primeira está provada pelo ambiente
  local.

Registrar essa perda no ADR (§7) e no README de dev, não escondê-la atrás do
"ambiente local funciona".

## 6. Caminho de promoção dev → prod (primeira subida com credencial AWS)

1. Confirmar `cdk synth` limpo em todas as 16+N stacks (N = novas Lambdas).
2. `cdk bootstrap` na conta/região de destino (uma vez).
3. Deploy das stacks sem dependência de dado (bus, filas, buckets, roles)
   primeiro — já existem, sobem sem mudança de comportamento.
4. Deploy das `NodejsFunction` novas com `NEXO_AGENTE_IA=bedrock` fixado no
   `environment` — nunca deixar como default ambíguo em produção.
5. Smoke test: 1 orçamento sintético ponta a ponta (upload → classificação
   → extração → validação), monitorando CloudWatch Logs de cada Lambda.
6. Auditoria IAM real (#580, #65) — só tem valor com credencial real, pois
   LocalStack community não valida IAM.
7. Medição de p95 real (#107, #157, #202, #258) e security review com
   Bedrock real (#64, #109, #158, #203, #259) — Fase 5 do
   `docs/plano-finalizacao.md`, sem mitigação de design possível antes de
   ter a credencial.
8. Rollback: `cdk destroy` da Lambda problemática isolada (roles/filas
   permanecem) ou `cdk deploy` da versão anterior — nunca rollback manual de
   console.

## 7. Suposições e riscos

**Verificado no código nesta tarefa**:
- Ausência total de `lambda.Function`/`NodejsFunction`/`export const
  handler` em `infra/`/`src/` (grep vazio).
- As 4 fábricas de handler existem e têm a assinatura descrita.
- `src/dev/config.ts` implementa `AWS_ENDPOINT_URL` nativo + o fix de
  `requestChecksumCalculation` (BUG-001/#592).
- `ValidarOrcamentoLambdaRoleStack` não tem `events:PutEvents` (só
  `AWSLambdaBasicExecutionRole` + `grantConsumeMessages`) — confirma a
  lacuna apontada em `plano-finalizacao.md`.
- `tasks.md` de 001/002/003 já marca "handler Lambda consumidor" como `[x]`
  concluído (T034, T023 em 001; T023 em 002; T025 em 003) — mas isso se
  refere só à fábrica, não à Lambda real. Nenhuma task numerada cobre "criar
  `NodejsFunction` + `export const handler` de produção" em nenhuma das 3
  specs — é lacuna real, não leitura equivocada de tasks.md já feitas.

**Suposto, não verificado**:
- Cognito: só o ponto de injeção (`RotaOpts.preHandler`) foi confirmado;
  a implementação real do provider Cognito não foi auditada aqui.
- Dimensionalidade do vetor esperada pelo schema pgvector de 004 — restringe
  a escolha do modelo de embedding local (ver §5).

**Resolvido após a redação inicial** (verificado por `grep`, corrige duas
suposições que constavam aqui):
- Os nomes das 6 portas de IA estão confirmados e tabelados em §5 — 004 tem
  duas, não uma.
- `DATABASE_URL` já é lido com falha rápida em
  `src/shared-kernel/database/client.ts:5`; não era lacuna. Ver §2.

**Decisão do dono do repo**:
- Commitar `src/composition/`, `src/dev/`, `tests/composition/` como estão,
  ou revisar antes — este documento não decide isso, só usa o conteúdo como
  base de análise (instrução explícita da tarefa).
- Se `NEXO_AGENTE_IA` é o nome final da variável de seleção de ambiente de
  IA, ou se prefere nome diferente/estrutura de config tipada.
- Timeout/memória por Lambda (§4) — valores de exemplo, não medidos; exigem
  a Fase 5 (p95 real) para calibrar de verdade.

## ADR recomendado

Um ADR curto, no formato já usado em `docs/architecture-diagrams/` (HTML,
mesmo padrão de ADR-004/ADR-008), registrando:
- Formato de handler de produção: `export const handler` direto (decidido
  aqui, §3) — evita re-decidir por BC.
- Composition root de produção vive neste repo (decidido aqui, respondendo
  a pendência de `plano-finalizacao.md` §5).
- Seleção de gateway de IA (Bedrock vs. modelo local) por variável de
  ambiente na composition root, nunca por fork de bounded context.

Recomendo nomear como ADR-009 (próximo número livre na sequência 004/008
já usada) e é uma decisão que o dono do repo deve ratificar antes do código
da Fase 4 (mesma recomendação já registrada em `plano-finalizacao.md` §5).
