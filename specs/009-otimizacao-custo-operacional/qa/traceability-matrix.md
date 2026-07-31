# Matriz de rastreabilidade — spec-009 (parcial, T004+T005+T007)

| Task | Requisito/Critério | Nível | Cenário | Teste | Resultado | Evidência Allure |
|---|---|---|---|---|---|---|
| T004 | tasks.md L29: VO `AssinaturaEstrutural` string opaca, construtor valida formato de hash, sem lógica de cálculo | Unitário | Cria a partir de hash SHA-256 hex válido | `assinatura-estrutural.test.ts::cria a partir de hash SHA-256 hex válido` | PASS | allure-results/ (uuid ver test-execution-report.md) |
| T004 | Critério: "rejeita string vazia/malformada com erro de domínio" | Unitário | vazio, espaços, curto demais, maiúsculo, 63 chars, 65 chars, char inválido no limite | `assinatura-estrutural.test.ts::rejeita string vazia/malformada: %s` (7 casos, `it.each`) | PASS (7/7) | idem |
| T004 | (implícito) igualdade por valor, não por referência | Unitário | `equals` compara pelo valor | `assinatura-estrutural.test.ts::equals compara pelo valor` | PASS | idem |
| T005 | tasks.md L30: VO `SinalCacheIdentificacao` = `{ assinatura, resultadoAnterior, ultimaConfirmacaoEm }`, factory estático | Unitário | Cria com dados válidos e expõe os três campos | `sinal-cache-identificacao.test.ts::cria com dados válidos e expõe os campos` | PASS | allure indisponível (ver limitação de ambiente) |
| T005 | (implícito ao VO, alinhado ao padrão dos demais VOs) rejeita data inválida com erro de domínio próprio | Unitário | `ultimaConfirmacaoEm: new Date('data-invalida')` | `sinal-cache-identificacao.test.ts::rejeita ultimaConfirmacaoEm inválida` → `SinalCacheIdentificacaoInvalidoError` (subclasse de `ErroDominio`) | PASS | idem |

Cobertura de linha das tasks: `assinatura-estrutural.ts` e `sinal-cache-identificacao.ts` — 100% statements/branches/functions/lines em ambos (ver coverage-final.md).

Nota de escopo: cálculo do hash (algoritmo, entradas) é T010 — fora do escopo de T004/T005 e desta rodada de QA. Validação de `assinatura` e `resultadoAnterior` já é responsabilidade dos VOs `AssinaturaEstrutural`/`ResultadoClassificacao` (não duplicada em `SinalCacheIdentificacao`, conforme a implementação).

| T007 | tasks.md L?: `DomainEventEnvelope` ganha campo opcional `prioridade?: 'PADRAO' \| 'LOTE_BAIXA_PRIORIDADE'`, aditivo, sem novo evento | Unitário | Interface exposta em TypeScript, sem lógica executável própria | `npx tsc --noEmit` — compila sem erro; contrato validado estaticamente | PASS | allure indisponível (ver limitação de ambiente, mesma de T005) |
| T007 | Critério: "payload sem o campo continua válido (default implícito PADRAO)" | Unitário | Para os 4 eventos concretos existentes (`OrcamentoRecebido`, `OrcamentoClassificado`, `OrcamentoEscalonadoParaRevisaoHumana`, `OrcamentoReclassificadoPorRevisaoHumana`), instancia sem `prioridade` e afirma `evento.prioridade` `undefined` | `domain-events.test.ts::payload sem "prioridade" continua válido (default implícito PADRAO) — $detailType` (4 casos via `describe.each`) | PASS (4/4) | idem |
| T007 | Regressão: shape prévio do envelope (`detailType`, `schemaVersion`, `orcamentoId`, `ocorreuEm`) inalterado nos 4 eventos | Unitário | Mesma suíte, teste já existente reexecutado | `domain-events.test.ts::schemaVersion 1, orcamentoId e detailType "$detailType"` (4 casos) | PASS (4/4) | idem |

Cobertura de T007: `domain-event.ts` é interface pura (TypeScript type-only), 0 statements/branches/functions executáveis — 100% trivial via `coverage-summary.json`. Os 4 eventos concretos que implementam o envelope permanecem 100% statements/branches/functions/lines (ver coverage-final.md).
