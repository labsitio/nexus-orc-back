# Matriz de rastreabilidade — spec-009 (parcial, T004)

| Task | Requisito/Critério | Nível | Cenário | Teste | Resultado | Evidência Allure |
|---|---|---|---|---|---|---|
| T004 | tasks.md L29: VO `AssinaturaEstrutural` string opaca, construtor valida formato de hash, sem lógica de cálculo | Unitário | Cria a partir de hash SHA-256 hex válido | `assinatura-estrutural.test.ts::cria a partir de hash SHA-256 hex válido` | PASS | allure-results/ (uuid ver test-execution-report.md) |
| T004 | Critério: "rejeita string vazia/malformada com erro de domínio" | Unitário | vazio, espaços, curto demais, maiúsculo, 63 chars, 65 chars, char inválido no limite | `assinatura-estrutural.test.ts::rejeita string vazia/malformada: %s` (7 casos, `it.each`) | PASS (7/7) | idem |
| T004 | (implícito) igualdade por valor, não por referência | Unitário | `equals` compara pelo valor | `assinatura-estrutural.test.ts::equals compara pelo valor` | PASS | idem |

Cobertura de linha desta task: `src/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.ts` — 100% statements/branches/functions/lines (ver coverage-final.md).

Nota de escopo: cálculo do hash (algoritmo, entradas) é T010 — fora do escopo de T004 e desta rodada de QA.
