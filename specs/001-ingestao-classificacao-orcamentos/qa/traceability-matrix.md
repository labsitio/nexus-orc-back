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
