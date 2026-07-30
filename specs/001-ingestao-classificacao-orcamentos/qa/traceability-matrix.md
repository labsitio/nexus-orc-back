# Matriz de rastreabilidade — T001 (issue #6)

| Requisito/Risco | Nível | Cenário | Evidência | Resultado |
|---|---|---|---|---|
| `tsc --strict` rejeita tipo incompatível | smoke manual | `.ts` temporário com `string` atribuído a `number` | log do comando (`qa/test-execution-report.md`) | PASSOU |
| `tsc --strict` rejeita chamada com argumento obrigatório faltante | smoke manual | `.ts` temporário chamando função sem argumento | idem | PASSOU |
| `noUncheckedIndexedAccess` rejeita acesso a índice sem narrowing | smoke manual | `.ts` temporário lendo `arr[0]: string` sem `| undefined` | idem | PASSOU |
| `pnpm install` funciona em ambiente limpo (Node 24) | smoke manual | worktree isolado no commit 11b1959 | idem | PASSOU |
| `packageManager` pinado é respeitado pelo corepack | smoke manual | `pnpm --version` no worktree == valor pinado (`11.18.0`) | idem | PASSOU |
| Critérios de aceite funcionais do `spec.md` (Ingestão & Identificação) | — | N/A | N/A | NÃO APLICÁVEL (sem código de domínio nesta task) |

Nenhum requisito funcional de `spec.md` mapeado para T001 — task é puramente
de fundação/scaffolding. Cobertura estrutural (statements/branches/functions/
lines) não mensurável: não há função ou branch de produção no diff além do
placeholder `NEXO_VERSION` (constante, sem lógica).

---

# Matriz de rastreabilidade — T004/T006–T009 (issues #9, #11, #12, #13, #14)

| Requisito / Critério de aceite | Risco | Nível | Cenário | Arquivo / caso | Resultado |
|---|---|---|---|---|---|
| T006 — `OrcamentoId` só aceita UUID v7 | Identidade inválida persistida | Unit | `de()` rejeita string não-UUID-v7 | `orcamento-id.vo.test.ts` | PASS |
| T006 — `Canal` enum fechado (4 canais) | Canal inválido aceito | Unit | `de()` rejeita valor fora de `CANAIS_VALIDOS` | `canal.vo.test.ts` | PASS |
| T006 — `NivelConfianca` 0–100 inteiro | Confiança fora de faixa/decimal aceita | Unit | `de()` rejeita <0, >100, não-inteiro | `nivel-confianca.vo.test.ts` | PASS |
| T006 — `ReferenciaS3` campos obrigatórios | Ponteiro S3 incompleto | Unit | `de()` rejeita bucket/key/versionId vazios | `referencia-s3.vo.test.ts` | PASS |
| T006 — `ResultadoClassificacao` campos obrigatórios | Resultado de classificação incompleto | Unit | `criar()` rejeita fornecedor/formato vazios | `resultado-classificacao.vo.test.ts` | PASS |
| T006 — `TentativaClassificacao.insucesso` exige motivo | Histórico com motivo vazio | Unit | `insucesso()` rejeita motivo vazio | `tentativa-classificacao.vo.test.ts` | PASS |
| T007 — confiança < 80% nunca vira `CLASSIFICADO` (sempre `PENDENTE_REVISAO_HUMANA`) | Aprovação automática indevida com baixa confiança | Unit | `registrarTentativaClassificador(49)` → status `PENDENTE_REVISAO_HUMANA` | `orcamento.aggregate.test.ts` | PASS |
| T007 — confiança >= 80% aprova | Rejeição indevida de confiança suficiente | Unit | `registrarTentativaClassificador(80)` → `CLASSIFICADO` | `orcamento.aggregate.test.ts` | PASS |
| T007 — transição inválida lança erro de domínio | Reentrega SQS corrompe estado do agregado | Unit | 2ª chamada de `registrarTentativaClassificador` a partir de `CLASSIFICADO` → `TransicaoInvalidaError` | `orcamento.aggregate.test.ts` | PASS |
| T007 — `registrarConfirmacaoHumana` só a partir de `PENDENTE_REVISAO_HUMANA` | Confirmação humana fora de contexto | Unit | chamada a partir de `RECEBIDO` → `TransicaoInvalidaError` | `orcamento.aggregate.test.ts` | PASS |
| T007 — histórico append-only | Perda de rastro de tentativas anteriores | Unit | após classificador + confirmação humana, histórico tem 2 entradas | `orcamento.aggregate.test.ts` | PASS |
| T007 — `referenciaBruta` imutável (Princípio III) | Dado bruto sobrescrito | Unit | `atualizarReferenciaBruta()` sempre lança `ReferenciaBrutaImutavelError` | `orcamento.aggregate.test.ts` | PASS |
| T008 — 4 Domain Events com `schemaVersion: 1` | Evento sem versionamento de schema quebra consumidor | Unit | `describe.each` valida `schemaVersion`, `orcamentoId`, `detailType`, `ocorreuEm` ISO para os 4 eventos | `domain-events.test.ts` | PASS |
| T009 — interfaces sem implementação | Vazamento de detalhe de infra no contrato | Estático | grep confirma apenas `export interface` em `repositories/` e `gateways/` | inspeção manual | PASS |
| Isolamento do Domain (nenhuma classe/preço/item comercial, nenhum import de infra) | Regra de negócio vazando do Domain | Estático | grep por `aws-sdk`, `axios`, `process.env`, imports de `infra`/`application` em `domain/` | inspeção manual | PASS (0 ocorrências) |
| Tipagem estrita do projeto | Erro de tipo não pego | Estático | `tsc --noEmit` | comando | PASS (exit 0) |

Cobertura de branch das invariantes de validação (todos os `throw new` dos VOs e do agregado): 100% — 38/38 branches, 13 asserções `toThrow` cobrindo os 12 pontos de lançamento de erro de domínio. Detalhe em `qa/coverage-final.md`.

---

# Matriz de rastreabilidade — T016/T019 (issues #21, #24) — PR #402

| Requisito / Critério de aceite | Risco | Nível | Cenário | Arquivo / caso | Resultado |
|---|---|---|---|---|---|
| T016 — `Orcamento.receber` cria com os 4 canais fixos, status nasce `RECEBIDO` | Canal inválido ou status inicial incorreto persistido | Unit | `it.each(CANAIS_VALIDOS)` cria orçamento por canal e afirma `canal.valor` e `status === 'RECEBIDO'` | `orcamento.aggregate.test.ts` (describe `Orcamento.receber`) | PASS |
| T016 — rejeição de canal fora dos 4 fixos | Canal fora do domínio aceito | Unit | `Canal.de('EMAIL')` lança `CanalInvalidoError` (barreira antes do agregado; VO fechado por `CANAIS_VALIDOS`) | `canal.vo.test.ts` (pré-existente, T006) | PASS — coberto na fronteira do VO, redundante testar de novo no agregado |
| T019 — `armazenar()` grava no prefixo do canal e devolve `ReferenciaS3` com `VersionId` real do S3 | Chave sem isolamento por canal / referência sem versionId real | Unit | fake de `S3Client.send` resolve `VersionId: 'v-123'`; afirma `bucket`, `key` (regex `sftp-incoming/.+-orcamento.pdf`), `versionId` | `s3-armazenamento-bruto.gateway.test.ts` | PASS |
| T019 — `armazenar()` lança erro explícito se S3 não devolver `VersionId` (bucket sem versionamento) | Imutabilidade (Princípio III) quebrada silenciosamente | Unit | fake resolve `{}` (sem `VersionId`) → `rejects.toThrow(/VersionId/)` | `s3-armazenamento-bruto.gateway.test.ts` | PASS |
| T019 — `lerConteudoBruto()` lê pela `versionId` explícita da referência | Leitura da versão errada do objeto (não a que foi classificada) | Unit | fake resolve `Body` com conteúdo determinístico; afirma bytes devolvidos | `s3-armazenamento-bruto.gateway.test.ts` | PASS (não afirma o argumento `VersionId` enviado ao comando — ver limitação em `qa/test-plan.md`) |
| T019 — `lerConteudoBruto()` lança erro explícito se S3 não devolver `Body` | Silêncio em vez de erro ao ler objeto ausente/corrompido | Unit | fake resolve `{}` (sem `Body`) → `rejects.toThrow(/Body/)` | `s3-armazenamento-bruto.gateway.test.ts` | PASS |
| Regressão: VOs, agregado (T007), eventos (T008), interfaces (T009), status controller (trilha 001-E, fora de escopo mas coexistente na suíte) | Quebra de comportamento já validado | Regressão | suíte completa `pnpm exec vitest run --coverage` | 12 arquivos de teste, 63 casos | PASS (0 falhas, 0 regressões) |
| Tipagem estrita / lint do projeto | Erro de tipo ou violação de estilo não pego | Estático | `pnpm run typecheck`, `pnpm run lint` | comandos | PASS (exit 0, sem output) |

Cobertura da fatia `S3ArmazenamentoBrutoGateway`: 100% statements/branches/functions (12/12, 4/4, 3/3) — ver `qa/coverage-final.md`.

---

# Matriz de rastreabilidade — T044–T047 (issues #49–#52) — PR #404

| Requisito / Critério de aceite | Risco | Nível | Cenário | Arquivo / caso | Resultado |
|---|---|---|---|---|---|
| GET status retorna RECEBIDO | Status não consultável logo após ingestão | Contrato (HTTP) | orçamento recém-recebido → 200, `status: RECEBIDO`, histórico vazio | `status.controller.test.ts` | PASS |
| GET status retorna CLASSIFICADO + resultado + histórico com agente | Resultado de classificação não exposto | Contrato (HTTP) | confiança 92% → 200, `resultadoAtual` preenchido, `historico[0].agente = CLASSIFICADOR` | `status.controller.test.ts` | PASS |
| GET status retorna PENDENTE_REVISAO_HUMANA, histórico com a tentativa do Classificador | Escalonamento não visível na consulta | Contrato (HTTP) | confiança 62% → 200, `status: PENDENTE_REVISAO_HUMANA`, `historico[0]` com `nivelConfianca: 62`, `agente: CLASSIFICADOR` | `status.controller.test.ts` (reforçado por QA — assert de `historico`/`resultadoAtual` que faltava) | PASS |
| Histórico da tentativa do Classificador preservado após confirmação humana (nunca sobrescrito) | Perda/edição do registro da tentativa original | Contrato (HTTP) + Integração (caso de uso) | baixa confiança (40%) + `registrarConfirmacaoHumana` (100%, HUMANO) → `historico` com 2 entradas, a 1ª intacta (CLASSIFICADOR/40%), a 2ª anexada (HUMANO/100%) | `status.controller.test.ts` (novo teste, QA) + `consultar-status-orcamento.integration.test.ts` (T045, dev-back-end) | PASS |
| 404 Problem Details (RFC 7807) para orcamentoId inexistente | Consumidor não distingue "não encontrado" de outro erro | Contrato (HTTP) | UUID válido mas inexistente → 404, `content-type: application/problem+json`, `status: 404` | `status.controller.test.ts` | PASS |
| 400 Problem Details para orcamentoId mal formado | UUID inválido gera 500 em vez de erro de validação | Contrato (HTTP) | `orcamentoId = 'nao-e-uuid'` → 400, `content-type: application/problem+json` | `status.controller.test.ts` | PASS |
| Erro inesperado do repositório não é mascarado como 404 | Falha real de infraestrutura escondida atrás de um 404 silencioso | Contrato (HTTP) | fake de repositório lança erro genérico → 500 (rethrow, não capturado como `OrcamentoNaoEncontradoError`) | `status.controller.test.ts` (novo teste, QA) | PASS |
| Contrato Zod aceita os 3 status + rejeita status fora do enum | Schema divergente do agregado (`STATUS_ORCAMENTO`) | Contrato (schema) | fixtures RECEBIDO/CLASSIFICADO/PENDENTE_REVISAO_HUMANA aceitas; `APROVADO_AUTOMATICO` rejeitado | `status.contract.test.ts` (T044, dev-back-end) | PASS |
| `ConsultarStatusOrcamento` lança erro de domínio para ID inexistente | Exceção não tipada vazando para o controller | Integração | `executar(idInexistente)` → `rejects.toThrow(OrcamentoNaoEncontradoError)` | `consultar-status-orcamento.integration.test.ts` (T045) | PASS |
| Regressão: suíte completa (VOs, agregado, eventos, gateway S3, status) | Quebra de comportamento já validado em rodadas anteriores | Regressão | `pnpm exec vitest run --coverage` | 12 arquivos, 68 casos | PASS (0 falhas) |
| Tipagem estrita / lint do projeto | Erro de tipo ou violação de estilo não pego | Estático | `pnpm run typecheck`, `pnpm run lint` | comandos | PASS (exit 0, sem output) |

Cobertura da fatia desta entrega (`status.schema.ts`, `consultar-status-orcamento.ts`, `status.controller.ts`): 100% statements/lines, 91.66%–100% branch — ver `qa/coverage-final.md`.

Limitação aceita (não é gap de teste, é escopo de produto fora deste PR):
`DrizzleOrcamentoRepository` real (T011/#16) não existe ainda — nenhum teste
desta rodada exercita persistência real contra Aurora; todos usam fake
in-memory, suficiente para validar o contrato de `OrcamentoRepository` (T009)
que `ConsultarStatusOrcamento` consome.

---

# Matriz de rastreabilidade — T011 (issue #16) — PR #410

| Requisito / Critério de aceite | Risco | Nível | Cenário | Arquivo / caso | Resultado |
|---|---|---|---|---|---|
| `buscarPorId` retorna `undefined` para id inexistente | Erro não tipado vazando para a Application em vez de `undefined` esperado pelo contrato | Integração (Postgres real) | `buscarPorId(idNovo)` sem linha na tabela → `undefined` | `drizzle-orcamento.repository.test.ts` | PASS |
| `salvar` (1ª vez, RECEBIDO) → recarregar → `registrarTentativaClassificador` (confiança alta) → `salvar` → recarregar | Tradução linha↔agregado incorreta (status, resultado) | Integração (Postgres real) | confiança 90% → `CLASSIFICADO`, histórico com 1 entrada `CLASSIFICADOR`, `resultadoAtual.fornecedorIdentificado` correto | `drizzle-orcamento.repository.test.ts` | PASS |
| Confiança baixa escalona para `PENDENTE_REVISAO_HUMANA`; `registrarConfirmacaoHumana` retorna a `CLASSIFICADO` preservando a tentativa anterior | Histórico sobrescrito/perdido na confirmação humana | Integração (Postgres real) | confiança 50% → `PENDENTE_REVISAO_HUMANA` (1 entrada) → confirmação humana → `CLASSIFICADO` (2 entradas, `historico[0]=CLASSIFICADOR`, `historico[1]=HUMANO`) | `drizzle-orcamento.repository.test.ts` | PASS |
| Re-salvar o mesmo agregado sem transição nova não duplica histórico | Contagem de "linhas já persistidas" incorreta duplicando a última tentativa | Integração (Postgres real) | `salvar` do agregado recém-carregado (sem nova transição) → histórico permanece com 1 entrada | `drizzle-orcamento.repository.test.ts` | PASS |
| **`salvar` concorrente do mesmo agregado (retry de Lambda) serializado pelo lock — nunca duplica histórico** | **MAJOR da revisão anterior**: 2 transações lendo a mesma contagem de histórico e inserindo a mesma tentativa em duplicidade | Integração (Postgres real, 2 conexões distintas) | `Promise.all([repoA.salvar(agregadoA), repoB.salvar(agregadoB)])`, mesmo `orcamentoId`, mesma transição aplicada em ambos → exatamente 1 linha em `orcamentos_historico`, 1 linha em `orcamentos`, status final `CLASSIFICADO` | `drizzle-orcamento.repository.test.ts` | PASS |
| Regressão: suíte completa (VOs, agregado, eventos, gateway S3, status, schema T010) | Quebra de comportamento já validado em rodadas anteriores | Regressão | `pnpm exec vitest run --coverage` (com `DATABASE_URL`) | 14 arquivos, 79 casos | PASS (0 falhas) |
| Suíte não quebra ambiente de dev local sem Postgres | Dev sem Docker de pé não consegue rodar `pnpm run test` | Smoke | `pnpm run test` sem `DATABASE_URL` | comando | PASS (10 testes de integração pulados — T010 + T011 —, 68 demais passam) |
| Tipagem estrita / lint do projeto | Erro de tipo ou violação de estilo não pego | Estático | `pnpm run typecheck`, `pnpm run lint` | comandos | PASS (exit 0, sem output) |

Cobertura da fatia `DrizzleOrcamentoRepository`: 100% statements/lines/functions,
88.09% branch (3 branches residuais são o caminho `insucesso()`, nunca
produzido pelo Domain hoje — ver `qa/coverage-final.md`).

---

# Matriz de rastreabilidade — T050–T055 (issues #55–#60) — PR #416

| Requisito / Critério de aceite (US5) | Risco | Nível | Cenário | Arquivo / caso | Resultado |
|---|---|---|---|---|---|
| Confirmação humana transiciona `PENDENTE_REVISAO_HUMANA` → `CLASSIFICADO`, `agenteOrigem: HUMANO`, confiança 100 | Confirmação não registrada como decisão humana explícita | Unit | `registrarConfirmacaoHumana` via `ConfirmarRevisaoHumana.executar` | `confirmar-revisao-humana.test.ts` | PASS |
| Histórico do Classificador preservado, confirmação humana apenas anexada | Perda de rastro da tentativa automática após correção manual | Unit | histórico tem 2 entradas (`CLASSIFICADOR` então `HUMANO`) após confirmação | `confirmar-revisao-humana.test.ts` | PASS |
| `TransicaoInvalidaError` fora de `PENDENTE_REVISAO_HUMANA` (nunca publica evento, nunca salva) | Reprocessamento indevido fora do estado de escalonamento | Unit | confirmação a partir de `RECEBIDO` lança erro, 0 salvamentos, 0 eventos | `confirmar-revisao-humana.test.ts` | PASS |
| `OrcamentoNaoEncontradoParaRevisaoHumanaError` para id inexistente | 404 mascarado incorretamente ou exceção não tratada | Unit | `buscarPorId` retorna `undefined` → erro específico, 0 eventos | `confirmar-revisao-humana.test.ts` | PASS |
| `OrcamentoReclassificadoPorRevisaoHumana` publicado ao final, 1x | Evento de auditoria da correção manual ausente/duplicado | Unit | 1 evento publicado com `detailType` correto após confirmação bem-sucedida | `confirmar-revisao-humana.test.ts` | PASS |
| `POST /v1/orcamentos/{id}/revisao-humana` — 200 e corpo com `status`/`resultadoAtual` corretos | Contrato HTTP diverge do caso de uso | Contrato/HTTP | `app.inject` com orçamento `PENDENTE_REVISAO_HUMANA` real | `revisao-humana.controller.test.ts` | PASS |
| 409 Problem Details quando status não é `PENDENTE_REVISAO_HUMANA` | Reprocessamento aceito fora do estado correto via API | Contrato/HTTP | `app.inject` com orçamento `RECEBIDO` → 409 + `application/problem+json` | `revisao-humana.controller.test.ts` | PASS |
| 404 Problem Details para `orcamentoId` inexistente | Vazamento de stack trace ou 500 para recurso ausente | Contrato/HTTP | `app.inject` com UUID válido não persistido → 404 + Problem Details | `revisao-humana.controller.test.ts` | PASS |
| 400 Problem Details para body inválido (campo obrigatório ausente/vazio) | Payload malformado aceito, corrompendo dado de confirmação | Contrato/HTTP + Zod | body sem `fornecedorIdentificado` → 400; schema isolado rejeita vazio/ausente | `revisao-humana.controller.test.ts`, `revisao-humana.contract.test.ts` | PASS |
| 400 Problem Details para `orcamentoId` mal formado (não-UUID) | Injeção de valor não-UUID na busca do agregado | Contrato/HTTP + Zod | `orcamentoIdParamSchema` (reaproveitado de US4) rejeita `'nao-e-uuid'` | `revisao-humana.controller.test.ts`, `revisao-humana.contract.test.ts` | PASS |
| Reprocessamento só por ação humana explícita (nenhuma reclassificação automática a partir de `PENDENTE_REVISAO_HUMANA`) | Reclassificação automática indevida por IA | Estático + inspeção | grep confirma única transição de saída de `PENDENTE_REVISAO_HUMANA` é `registrarConfirmacaoHumana`, acionada só pelo endpoint deste PR | inspeção manual (`orcamento.aggregate.ts`) | PASS |
| IAM `ConfirmarRevisaoHumanaLambdaRole` least privilege (sem Bedrock/S3) | Role Lambda com permissão excessiva | Infra estático | `cdk synth ConfirmarRevisaoHumanaLambdaRoleStack` sintetiza só com `AWSLambdaBasicExecutionRole` | comando (`qa/test-execution-report.md`) | PASS |
| Regressão: suíte completa (US1–US4, VOs, agregados, eventos, gateways) | Quebra de comportamento já validado em rodadas anteriores | Regressão | `corepack pnpm test` | 38 arquivos, 176 casos | PASS (0 falhas) |
| Tipagem estrita / lint do projeto (app + infra CDK) | Erro de tipo ou violação de estilo não pego | Estático | `corepack pnpm run typecheck`, `typecheck:infra`, `lint` | comandos | PASS (exit 0, sem output) |

Cobertura da fatia desta task: `confirmar-revisao-humana.ts` 100% em todas as
métricas; `revisao-humana.controller.ts` 96%/90% branch (gap justificado —
rethrow de erro inesperado, ver `qa/coverage-final.md`); `revisao-humana.schema.ts`
100%.
