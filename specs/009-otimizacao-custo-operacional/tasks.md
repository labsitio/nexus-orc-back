# Tasks: Otimização Contínua de Custo Operacional

**Input**: `specs/009-otimizacao-custo-operacional/plan.md`, `spec.md` (versão 1, clarified)

**Tests**: incluídas — spec tem critérios de aceite testáveis explícitos e esta feature toca invariantes que não MUST regredir (Princípio I/III da constituição: rastreabilidade e imutabilidade nunca degradadas pelas alavancas de custo).

**Organização**: tarefas agrupadas por user story (P1–P3, mapeadas 1:1 às três alavancas do `spec.md`), rastreáveis ao `plan.md`. Cada task abaixo está pronta para virar issue técnica no GitHub (título = ID + descrição; critério de aceite = referência ao item correspondente do `spec.md`).

**Pré-requisito de fato**: `specs/001-ingestao-classificacao-orcamentos` (tasks T001–T015, ao menos Phase 1/2, e a Phase 4 `ClassificarOrcamento` de US2) deve existir no repositório antes de US1 desta spec ser implementada — as tasks abaixo estendem, não recriam, esse código.

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Confirmar com Ricardo que `specs/001-ingestao-classificacao-orcamentos` (Phase 1/2 + caso de uso `ClassificarOrcamento` de US2) já está implementado no branch de destino; se não estiver, esta spec fica bloqueada até lá (dependência declarada em `spec.md`: `depende_de: [ingestao-classificacao-orcamentos]`).
- [ ] T002 [P] Adicionar dependência `@aws-sdk/client-dynamodb` e `@aws-sdk/lib-dynamodb` ao `package.json` do monorepo.
- [ ] T003 [P] Criar diretório `infra/` na raiz do repositório (convenção deste plano, ver `plan.md` Project Structure) para configuração de conta/serviço gerenciado transversal (fora de qualquer Bounded Context).

**Checkpoint**: dependência de 001 confirmada, SDK novo disponível, diretório `infra/` criado.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [ ] T004 Domain: implementar VO `AssinaturaEstrutural` em `src/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.ts` — string opaca, construtor valida formato de hash, sem lógica de cálculo (cálculo é Application, ver T010). Critério: rejeita string vazia/malformada com erro de domínio.
- [ ] T005 [P] Domain: implementar VO `SinalCacheIdentificacao` em `src/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.ts` — `{ assinatura: AssinaturaEstrutural, resultadoAnterior: ResultadoClassificacao, ultimaConfirmacaoEm: Date }`.
- [ ] T006 [P] Domain: definir interface `CacheIdentificacaoGateway` em `src/bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.ts` — métodos `buscar(assinatura: AssinaturaEstrutural): Promise<SinalCacheIdentificacao | null>` e `registrar(assinatura: AssinaturaEstrutural, resultado: ResultadoClassificacao): Promise<void>`. Sem implementação, apenas contrato.
- [ ] T007 Domain: estender o tipo de envelope de Domain Event (usado pelos 5 eventos já definidos em 001) com campo opcional `prioridade?: 'PADRAO' | 'LOTE_BAIXA_PRIORIDADE'` — mudança aditiva, retrocompatível, sem novo evento. Critério: payload sem o campo continua válido (default implícito `PADRAO`).
- [ ] T008 Infrastructure (IaC): provisionar tabela DynamoDB `nexo-cache-identificacao-fornecedor` em `infra/dynamodb/nexo-cache-identificacao-fornecedor.ts` — on-demand, partition key `assinaturaEstrutural`, atributo TTL nativo habilitado. ADR-009-001.
- [ ] T009 [P] Infrastructure (IaC): habilitar S3 Intelligent-Tiering (incluindo Archive Access e Archive Instant Access) no bucket `nexo-orcamentos-raw` em `infra/s3/lifecycle-intelligent-tiering.ts`, sem alterar versionamento/Object Lock existente. ADR-009-002.
- [ ] T010 Infrastructure: `DynamoCacheIdentificacaoGateway` em `src/bounded-contexts/ingestao-identificacao/infrastructure/aws/dynamo-cache-identificacao.gateway.ts` implementando `CacheIdentificacaoGateway` — inclui cálculo determinístico de `AssinaturaEstrutural` a partir da saída sanitizada do `MarkItDownConversaoACL` + `Canal` (algoritmo de hashing é decisão de implementação, não arquitetural). Tratamento de erro: qualquer falha de leitura/escrita (throttle, timeout) MUST ser capturada e retornar `null`/no-op, nunca propagar exceção.
- [ ] T011 IAM: adicionar `dynamodb:GetItem`/`dynamodb:PutItem` restrito ao ARN da tabela `nexo-cache-identificacao-fornecedor` à role já existente `ClassificadorLambdaRole` (de 001) — sem `dynamodb:DeleteItem`, sem role nova.

**Checkpoint**: VOs, gateway (interface + implementação), tabela DynamoDB e regra de lifecycle S3 prontos e testáveis isoladamente, antes de qualquer integração com o caso de uso existente.

---

## Phase 3: User Story 1 — Cache de identificação para fornecedor recorrente (Priority: P1) 🎯 MVP

**Goal**: um orçamento de fornecedor/formato já conhecido reaproveita o sinal cacheado como contexto para o Classificador, com custo de processamento reduzido, sem nunca pular a publicação do evento de classificação.

**Independent Test**: publicar `OrcamentoRecebido` duas vezes para o mesmo fornecedor/formato (fingerprint idêntico); verificar que a segunda execução consulta o cache (hit), ainda invoca `AgenteClassificadorGateway`, e ainda publica `OrcamentoClassificado`/`OrcamentoEscalonadoParaRevisaoHumana` normalmente — critério de aceite spec.md "gera um evento de classificação igualmente válido e rastreável... sem nunca pular a publicação do evento".

### Tests (US1)

- [ ] T012 [P] [US1] Unit test: cache miss não bloqueia nem falha `ClassificarOrcamento` — simula `CacheIdentificacaoGateway.buscar` lançando erro/timeout e verifica que o caso de uso segue o caminho de custo total normalmente.
- [ ] T013 [P] [US1] Unit test: escrita no cache só ocorre quando `nivelConfianca >= 80` (limiar de 001) — simula resultado de baixa confiança e verifica que `CacheIdentificacaoGateway.registrar` NÃO é chamado.
- [ ] T014 [P] [US1] Unit test: uma correção humana com resultado diferente do sinal cacheado sobrescreve a entrada de cache (nunca acumula/funde com a anterior) — critério de aceite spec.md "nenhuma alavanca... reduz a rastreabilidade".
- [ ] T015 [P] [US1] Integration test: consumidor `classificador-queue` com cache hit simulado ainda produz exatamente um dos dois eventos de saída (`OrcamentoClassificado` ou `OrcamentoEscalonadoParaRevisaoHumana`) — mesmo contrato de evento de 001/US2, inalterado.

### Implementation (US1)

- [ ] T016 [US1] Application: estender `ClassificarOrcamento` (`src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.ts`, de 001) para: (1) calcular `AssinaturaEstrutural` via `DynamoCacheIdentificacaoGateway`; (2) consultar `CacheIdentificacaoGateway.buscar` com fallback silencioso em erro; (3) repassar `SinalCacheIdentificacao` (se houver hit) como contexto adicional a `AgenteClassificadorGateway.classificar`; (4) manter inalterada a publicação de evento já existente de 001; (5) após persistir resultado com confiança ≥ 80%, chamar `CacheIdentificacaoGateway.registrar`.
- [ ] T017 [US1] Infrastructure: estender a assinatura de `BedrockClassificadorGateway.classificar` (de 001) para aceitar `SinalCacheIdentificacao` opcional como contexto de prompt — nunca como override do resultado, apenas como contexto adicional isolado no prompt (mesma disciplina de ACL de prompt injection já aplicada em 001).
- [ ] T018 [US1] Injeção de dependência: registrar `DynamoCacheIdentificacaoGateway` como implementação de `CacheIdentificacaoGateway` no bootstrap do Lambda consumidor de `classificador-queue`.
- [ ] T019 [US1] Observabilidade: log estruturado (pino) indicando `cacheHit: boolean` na trilha de `orcamentoId` — nunca substitui o log de decisão do agente, apenas complementa (Princípio I).

**Checkpoint**: US1 funcional e testável isoladamente — cache reduz custo de processamento sem alterar o contrato de evento observável de 001.

---

## Phase 4: User Story 2 — Arquivamento automático por lifecycle (Priority: P2)

**Goal**: dado bruto migra automaticamente para camada de armazenamento de custo mais baixo sem intervenção manual, sem exclusão, permanecendo consultável.

**Independent Test**: após habilitar Intelligent-Tiering no bucket, forçar (via simulação/mock em ambiente de teste, já que a transição real depende do padrão de acesso ao longo do tempo) uma leitura de objeto em tier de arquivamento e confirmar `GetObject` retorna 200 sem etapa de restore — critério de aceite spec.md "permanece consultável e sem impacto no histórico de rastreabilidade".

### Tests (US2)

- [ ] T020 [P] [US2] Teste de infraestrutura (LocalStack ou verificação de configuração IaC): bucket `nexo-orcamentos-raw` tem Intelligent-Tiering habilitado E mantém versionamento + bucket policy deny-overwrite/deny-delete de 001 inalterados.
- [ ] T021 [P] [US2] Teste de infraestrutura: nenhuma regra de lifecycle introduzida por esta spec tem ação de expiração (`Expiration`)/exclusão configurada — apenas transição de tier.

### Implementation (US2)

- [ ] T022 [US2] Infrastructure (IaC): aplicar a configuração de `infra/s3/lifecycle-intelligent-tiering.ts` (T009) ao bucket `nexo-orcamentos-raw` via pipeline de deploy existente (CDK/Terraform de Ricardo).
- [ ] T023 [US2] Documentação de convenção (comentário no próprio arquivo IaC + referência a ADR-009-002): todo bucket S3 de artefato de pipeline criado pelas specs 002–005 MUST reaproveitar este mesmo módulo de configuração, não reimplementar a regra.

**Checkpoint**: US2 funcional e testável isoladamente — arquivamento não depende de nenhuma mudança de código de aplicação, apenas configuração de bucket.

---

## Phase 5: User Story 3 — Processamento em lote de baixa prioridade (Priority: P3)

**Goal**: cargas de baixa prioridade (ex.: reprocessamento em massa) são processadas sem competir por capacidade com o fluxo principal (p95 5 min de 001).

**Independent Test**: publicar um lote de eventos com `prioridade: 'LOTE_BAIXA_PRIORIDADE'` simultaneamente a um evento padrão; verificar que o evento padrão é consumido dentro da meta de 5 min independentemente do tamanho do lote — critério de aceite spec.md "cargas... nunca competem pelo tempo de resposta da meta padrão".

### Tests (US3)

- [ ] T024 [P] [US3] Unit test: `envelope-prioridade.ts` — payload sem campo `prioridade` é tratado como `PADRAO`; payload com `LOTE_BAIXA_PRIORIDADE` é reconhecido corretamente.
- [ ] T025 [P] [US3] Integration test: regra EventBridge roteia evento com `detail.prioridade == 'LOTE_BAIXA_PRIORIDADE'` para `classificador-queue-lote`, nunca para `classificador-queue` padrão, e vice-versa.
- [ ] T026 [P] [US3] Unit test: `ReprocessarEmLote` rejeita lista vazia de `orcamentoIds` e não publica evento algum nesse caso (nunca publica evento vazio/genérico).

### Implementation (US3)

- [ ] T027 [US3] Domain/Application: utilitário `envelope-prioridade.ts` em `src/bounded-contexts/ingestao-identificacao/infrastructure/eventbridge/envelope-prioridade.ts` — função pura que injeta/lê o campo `prioridade` no envelope do evento (convenção compartilhada, ver `plan.md`).
- [ ] T028 [US3] Application: novo caso de uso `ReprocessarEmLote(orcamentoIds, motivo)` em `src/bounded-contexts/ingestao-identificacao/application/use-cases/reprocessar-em-lote.ts` — para cada `orcamentoId`, reemite o evento equivalente já existente no pipeline com `prioridade: 'LOTE_BAIXA_PRIORIDADE'`; nunca cria evento novo fora do catálogo já definido em 001.
- [ ] T029 [US3] Infrastructure (IaC): provisionar fila SQS `classificador-queue-lote` + DLQ própria + alarme CloudWatch (mesmo padrão de `classificador-queue` de 001), com concorrência reservada Lambda baixa (valor a calibrar operacionalmente).
- [ ] T030 [US3] Infrastructure (IaC): regra EventBridge adicional no bus `nexo-dominio-bus` roteando `detail.prioridade == 'LOTE_BAIXA_PRIORIDADE'` para `classificador-queue-lote`; regra existente de 001 (`OrcamentoRecebido` → `classificador-queue`) permanece inalterada para ausência do campo/`PADRAO`.
- [ ] T031 [US3] Interface: expor `ReprocessarEmLote` apenas como invocação Lambda interna (sem rota de API Gateway pública) — role IAM dedicada, least-privilege, restrita aos gateways necessários para reemitir eventos.
- [ ] T032 [US3] IAM: role dedicada `ReprocessarEmLoteLambdaRole`, sem acesso amplo — apenas `events:PutEvents` no bus `nexo-dominio-bus` e leitura do necessário em `orcamentos_historico` para validar `orcamentoId` existente antes de reemitir.

**Checkpoint**: US1+US2+US3 juntas entregam as três alavancas da spec, cada uma independentemente testável e sem alterar o contrato observável de 001.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Atualizar `plan.md`/Constitution Check de 001 (nota, não reescrita) apontando que `ClassificarOrcamento` foi estendido por 009 — rastreabilidade documental entre specs.
- [ ] T034 [P] Métrica operacional: instrumentar contador `cache_hit_total`/`cache_miss_total` (OpenTelemetry) para alimentar a métrica de produto "Percentual de reaproveitamento de classificação via cache" já declarada no `spec.md`.
- [ ] T035 Rodar `npm audit`/`pnpm audit` e Semgrep sobre o novo código de infraestrutura (`DynamoCacheIdentificacaoGateway`, IaC) antes de merge.
- [ ] T036 Revisão de segurança dirigida: confirmar que nenhuma role IAM nova/estendida desta spec concede permissão além do listado nas tasks acima (least privilege, ver seção Segurança do `plan.md`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depende apenas da confirmação externa de que 001 está implementado (T001) — bloqueante para tudo mais.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories.
- **User Stories (Phase 3–5)**: todas dependem de Foundational. US2 (lifecycle) e US3 (lote) são independentes entre si e de US1 — podem ser feitas em paralelo por pessoas diferentes. US1 (cache) é a única que toca o caso de uso `ClassificarOrcamento` compartilhado com 001; recomenda-se completá-la primeiro para reduzir risco de conflito de merge com quem estiver ainda finalizando 001.
- **Polish (Phase 6)**: depende de todas as stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1 — cache)**: depende de Foundational; nenhuma dependência de US2/US3.
- **US2 (P2 — lifecycle)**: depende de Foundational (T009); nenhuma dependência de código de aplicação — pode até ser entregue antes de US1 sem risco, é puramente infraestrutura.
- **US3 (P3 — lote)**: depende de Foundational (T007, envelope de evento); não depende de US1/US2 para funcionar, mas reaproveita o mesmo padrão de fila companheira que poderia, no futuro, também servir US1 se o cache precisar de reprocessamento em lote.

### Parallel Opportunities

- T002, T003 (Setup) em paralelo.
- T005, T006, T009 (Foundational) em paralelo entre si (arquivos distintos); T004 antes de T005 (T005 referencia o VO de T004).
- Todas as tasks marcadas `[P]` dentro de cada Phase 3–5 (testes e IaC de arquivos distintos) em paralelo.
- US2 inteira pode ser executada em paralelo a US1/US3 por outra pessoa — não compartilha arquivo.

---

## Parallel Example: User Story 1 (Cache)

```bash
# Testes de US1 em paralelo:
Task: "Unit test cache miss degrada para custo total em tests/.../classificar-orcamento.cache-miss.test.ts"
Task: "Unit test escrita de cache só com confiança >=80 em tests/.../classificar-orcamento.cache-write.test.ts"
Task: "Unit test correção humana sobrescreve cache em tests/.../classificar-orcamento.cache-overwrite.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (inclui confirmar 001 implementado).
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories).
3. Completar Phase 3: User Story 1 (cache).
4. **PARAR e VALIDAR**: testar US1 isoladamente — cache reduz custo sem pular publicação de evento.
5. Deploy/demo se pronto — já é a alavanca de maior "leading indicator" definida no `spec.md` (percentual de reaproveitamento via cache).

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 (cache) → testar isoladamente → deploy (MVP).
3. US2 (lifecycle) → testar isoladamente → deploy (pode ser feito em paralelo a US1, é puramente infra).
4. US3 (lote) → testar isoladamente → deploy.
5. Cada story agrega valor de custo sem quebrar o contrato observável das specs 001–005.

### Parallel Team Strategy

Com múltiplos desenvolvedores:

1. Time completa Setup + Foundational junto.
2. Depois de Foundational:
   - Dev A: US1 (cache) — precisa coordenar com quem estiver finalizando 001.
   - Dev B: US2 (lifecycle) — puramente IaC, sem dependência de código de aplicação.
   - Dev C: US3 (lote) — infra + um caso de uso novo isolado.
3. Stories completam e integram de forma independente.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência entre si.
- `[Story]` mapeia a task à user story para rastreabilidade.
- Nenhuma task desta spec MUST alterar o contrato de evento externo já publicado por 001 (`OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`, etc.) — toda mudança é aditiva (campo opcional) ou puramente de infraestrutura.
- Verificar que os testes falham antes de implementar.
- Parar em qualquer checkpoint para validar a story isoladamente.
- Evitar: task vaga, conflito de mesmo arquivo entre US1 e US3 (ambas tocam infraestrutura de fila/evento — coordenar T016/T017 com T027/T030 se feitas em paralelo).
