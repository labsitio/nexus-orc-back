## Leva T019 (issue #84, PR #457, commit `61c4670`)

| Critério de aceite (spec.md / plan.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Contrato de resposta de `GET /extracao/status` reflete exatamente os `paraPayload()` reais dos VOs (`ItemOrcamento`, `CondicoesComerciais`, `CampoExtraido<T>`, `Dinheiro`, `DescricaoProduto`) | Drift contrato/domínio | Contrato (Zod) | 4 status possíveis do agregado (`PENDENTE`, `EXTRAIDO`, `PENDENTE_REVISAO_HUMANA`, `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`) + `orcamentoId` inválido + `status`/`agenteOrigem` fora do enum + 404 Problem Details | `status.contract.test.ts` (9 testes) | PASS |
| Campo obrigatório sem confiança nunca aparece com valor inventado na resposta de status | Financeiro (crítico) | Contrato (Zod) | cenário `PENDENTE_REVISAO_HUMANA` com `CampoExtraido` `valor: null`/`extraido: false` | `status.contract.test.ts` (1 dos 9 testes) | PASS |

### Fora desta leva
- Endpoint real (T024, controller) não existe ainda — este contrato só é
  exercitado end-to-end quando T024 for implementada e reusar estes schemas.

---

# Matriz de Rastreabilidade — SPEC 002 (leva T001, T005-T011)

| Critério de aceite (spec.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Nenhum campo obrigatório é preenchido com valor inventado quando confiança insuficiente | Financeiro (crítico) | Unit | `CampoExtraido.naoExtraido` sempre produz `valor: null`; `extraido()` com `null` lança erro | `campo-extraido.vo.test.ts` (4 testes) | PASS |
| Campo obrigatório sem confiança escalona direto para revisão humana, nunca fica extraído parcial | Silencioso (crítico) | Unit | `registrarTentativaExtrator` com item incompleto → `PENDENTE_REVISAO_HUMANA`, nunca `EXTRAIDO` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Preservação de vínculo: `referenciaClassificacao`/`referenciaBrutaS3` nunca sobrescritos | Rastreabilidade | Unit | `atualizarReferenciaClassificacao`/`atualizarReferenciaBrutaS3` sempre lançam `ReferenciaImutavelError` | `extracao-orcamento.aggregate.test.ts` (2 testes) | PASS |
| Confirmação humana só válida a partir de `PENDENTE_REVISAO_HUMANA`; histórico append-only | Governança | Unit | transição inválida lança erro; valor real → `EXTRAIDO`; indisponibilidade → `EXTRAIDO_COM_PENDENCIA_CONFIRMADA`; histórico cresce (nunca é resetado) | `extracao-orcamento.aggregate.test.ts` (3 testes) | PASS (ressalva BUG-001: getter `historico` não é cópia defensiva) |
| VOs nunca aceitam primitivo solto fora de invariante (Dinheiro, Quantidade, DescricaoProduto, PeriodoValidade, ItemOrcamento, CondicoesComerciais, ReferenciaClassificacao, ReferenciaS3, TentativaExtracao, OrcamentoId, NivelConfianca) | Integridade de domínio | Unit | construção válida + construção inválida por VO | 12 arquivos de teste de VO | PASS |
| 3 Domain Events com `schemaVersion: 1`, `source: nexo.extracao` | Contrato de evento | Unit | shape do evento | `domain-events.test.ts` (3 testes) | PASS |

## Fora desta leva (não rastreado ainda)
- "Consulta de status reflete a etapa extraído/pendência" — depende do
  endpoint de status (T024, T039), não existe ainda.
- "Conversão via MarkItDown por padrão" — depende do ACL de Infrastructure
  (T021), interface já definida (`markitdown-conversao-extracao.acl.ts`) mas
  sem implementação nesta leva.

## Leva T012 (issue #77, PR #423, commit `27409c6`)

| Critério de aceite (spec.md / plan.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| Schema persiste estado atual do agregado (`itens`/`condicoesComerciais` em JSONB, ADR-004) | Persistência | Integração (Postgres real) | criação com `itens` default `[]`, `condicoesComerciais` opcional | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `status` e `referencia_classificacao_agente_origem` restritos ao enum de domínio | Integridade de dados | Integração (Postgres real) | INSERT com valor fora do enum → violação de CHECK | `extracao-orcamento.schema.test.ts` (1 teste) | PASS |
| `extracoes_orcamento_historico` é append-only (nunca sobrescrito) | Governança/auditoria | Integração (Postgres real) | UPDATE/DELETE em linha de histórico → `RAISE EXCEPTION` | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** — migração 0005 não aplica, coluna `id` não migrada para `bigserial`, INSERT falha antes do UPDATE/DELETE ser exercitado |
| `TentativaExtracao` é sucesso XOR insucesso, nunca ambos/nenhum | Integridade de domínio | Integração (Postgres real) | INSERT com ambos os campos e com nenhum → violação de CHECK | `extracao-orcamento.schema.test.ts` (2 testes) | **BLOQUEADO por BUG-003** (mesma causa raiz) |
| Migração aplica sem erro em Postgres real a partir do baseline (pré-condição p/ CI e T013) | Deploy/CI | Integração (Postgres real) | `drizzle-kit migrate` a partir do estado pós-T002 | manual (`drizzle-kit migrate` + `psql` direto) | **FAIL** — `bugs/BUG-003.md`, CRÍTICA |
| `db:generate` sem diff pendente (schema TS ≡ migração commitada) | Consistência schema/migração | Estático | `npx drizzle-kit generate` | manual | PASS |

## Leva T015 (issue #80, PR #429, commit `3580e09`)

| Critério de aceite (tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `EventBridgePublisher` implementa `EventPublisher` (Domain), instância própria do BC Extração, mesmo bus `nexo-dominio-bus` | Contrato/integração | Unit (mock `EventBridgeClient`) | publica com `EventBusName`, `Source: nexo.extracao`, `DetailType` e `Detail` (JSON do envelope) corretos | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Falha reportada pelo EventBridge (`FailedEntryCount > 0`) vira erro descritivo, nunca falha silenciosa | Confiabilidade/observabilidade | Unit | `ErrorMessage` presente → mensagem inclui detailType, orcamentoId, bus e motivo | `eventbridge.publisher.test.ts` (1 teste) | PASS |
| Fallback de mensagem quando EventBridge não informa `ErrorMessage` | Confiabilidade | Unit | `Entries: [{}]` → erro com "motivo desconhecido" | `eventbridge.publisher.test.ts` (1 teste) | PASS |

Limitação: sem LocalStack neste worktree — sem teste de integração real contra
EventBridge (`PutEventsCommand` de verdade). Risco residual: comportamento real
do SDK AWS (retries, throttling) não exercitado; mitigado por ser mock fiel ao
shape de retorno documentado do SDK (`FailedEntryCount`/`Entries[].ErrorMessage`).

## Leva T018 (issue #83, PR #451, commit `a8ff244`)

| Critério de aceite (tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `MarkItDownConversaoExtracaoACL.converter` invoca Lambda dedicado do BC (ADR-002, instância própria) com conteúdo em base64 | Contrato/integração | Unit (mock `LambdaClient`) | `send` chamado com `FunctionName` e `Payload` corretos; texto sanitizado devolvido | `markitdown-conversao-extracao.acl.test.ts` (1 teste) | PASS |
| Texto do MarkItDown sempre sanitizado antes de sair do ACL — nunca repassa texto bruto ao Application/Domain | Segurança (prompt injection) | Unit | resposta do Lambda com `\x00` + payload de injeção → ACL devolve sem caractere de controle | `markitdown-conversao-extracao.acl.test.ts` (1 teste) | PASS |
| Erros do Lambda (`FunctionError`, `Payload` ausente, JSON inválido, shape inesperado) nunca propagam payload cru, sempre erro descritivo | Confiabilidade | Unit | 4 cenários de falha | `markitdown-conversao-extracao.acl.test.ts` (4 testes) | PASS |
| Sanitização remove caractere de controle (inclusive usado para ofuscar prompt injection) preservando `\t\n\r`, trunca em 50_000 chars por code point completo, nunca lança erro | Segurança/DoS | Unit | texto normal, controle+ANSI, truncamento, entrada vazia, fronteira de emoji (surrogate pair), documento adversarial 10M chars, injeção literal preservada como texto | `sanitizar-conteudo-extracao.test.ts` (7 testes) | PASS |
| Mitigação de DoS: loop nunca varre o `textoBruto` inteiro quando composto majoritariamente de caracteres de controle | Segurança/DoS | Unit (timing) | limite de 500ms (vs 200ms do par de spec-001, ajustado por já ter sido reportado como flaky sob `--coverage`) | `sanitizar-conteudo-extracao.test.ts` (1 dos 7 testes acima) | PASS — verificado: impl. atual ~102ms sob `--coverage`; regressão simulada sem o limite de varredura ~1676ms sob `--coverage` (teste continua útil, não está frouxo) |

Réplica mecânica do par já validado em spec-001 (`sanitizar-conteudo-documento.ts`/`markitdown-conversao.acl.ts`) — mesma lógica de sanitização, zero decisão de design nova; apenas o limite de tempo do teste de DoS diverge (500ms vs 200ms), justificado no commit e confirmado empiricamente nesta validação.

Risco residual (fora do escopo desta leva): BUG-001 (spec 002, severidade BAIXA, P3) segue `PRONTO PARA RETESTE`, não relacionado a T018/arquivos desta PR. O par de spec-001 do teste de DoS (200ms) reproduziu-se como flaky sob `--coverage` (full-suite run desta validação, teste passou isolado) — confirma o relato do dev-back-end/backend-reviewer; nenhum arquivo de spec-001 foi tocado por esta PR, então nenhum BUG novo foi aberto por esse achado pré-existente.

## Leva T020 (issue #85, PR #460, commit `be208e5`)

| Critério de aceite (spec.md / tasks.md) | Risco | Nível | Cenário | Teste | Resultado |
|---|---|---|---|---|---|
| `OrcamentoClassificado` consumido → `OrcamentoExtraido` publicado com itens/condições estruturados quando todo campo obrigatório tem confiança suficiente | Orquestração/contrato de evento | Integração simulada (fakes em memória) | fluxo completo ler bruto → converter → extrair → `registrarTentativaExtrator` → publicar; assert no shape do evento (`detailType`, `schemaVersion`, `itens`, `condicoesComerciais`) | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS |
| 1+ campo obrigatório sem confiança → `ExtracaoEscalonadaParaRevisaoHumana`, nunca valor inventado | Financeiro/silencioso (crítico) | Integração simulada | item com `precoUnitario` sem confiança → status `PENDENTE_REVISAO_HUMANA`; assert explícito `valor: null`/`extraido: false` no campo pendente | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS |
| Tempo até extração disponível (p95) até 5 minutos (spec.md, meta compartilhada com spec 001) | Performance (proxy) | Integração simulada (20 execuções em memória) | mede p95 da orquestração local contra meta de 5min | `extrair-dados-orcamento.integration.test.ts` (1 dos 3 testes) | PASS — proxy local explícito (comentário `ponytail:` no teste); não valida a meta ponta a ponta real (rede AWS/Bedrock/cold start), isso é T042 |

Verificação de fidelidade ao contrato real (sem antecipar T021/T022):
- Assinaturas dos fakes (`LeituraBrutaGatewayFake.ler`, `MarkItDownConversaoExtracaoACLFake.converter`, `AgenteExtratorGatewayFake.extrair`, `EventPublisherFake.publicar`) conferem, campo a campo, com as interfaces reais em `src/bounded-contexts/extracao/domain/gateways/*.ts` — nenhuma assinatura inventada.
- `registrarTentativaExtrator(itens, condicoesComerciais)` chamado exatamente como definido em `extracao-orcamento.aggregate.ts`; a decisão de evento (`EXTRAIDO` → `OrcamentoExtraido`, senão `ExtracaoEscalonadaParaRevisaoHumana`) lê `extracao.status` resultante do agregado — o teste não decide a regra de negócio por conta própria, só orquestra em torno da decisão do domínio.
- `CampoExtraido.naoExtraido`/`extraido` (VO real) garante estruturalmente `extraido === false ⟺ valor === null` — o teste 2 não afirma isso por mock, afirma sobre o VO real do domínio.

### Fora desta leva
- `ExtrairDadosOrcamento` (Application, T022/#87) e o handler Lambda de `extrator-queue` (Interface, T023) não existem ainda — este teste fixa a especificação executável que a implementação real deverá seguir; não substitui o teste de integração real (LocalStack) nem a medição de p95 ponta a ponta (T042, após T021/T023).
