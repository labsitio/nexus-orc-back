# Coverage Baseline — T004/T006–T009

Antes desta task não havia ferramenta de cobertura configurada no projeto
(T001 não tinha lógica de produção; T003, que introduz CI/cobertura, ainda
não foi implementada). Baseline = 0 (inexistente).

QA adicionou `@vitest/coverage-v8` (test infra, dentro da autoridade de QA)
para medir a cobertura desta entrega. Ver `coverage-final.md` para o
resultado.

---

# Coverage Baseline — T016/T019 (PR #402)

Baseline = estado da suíte antes deste PR (commit `b1a2bf4`, `main`):
Statements 92.91% · Branches 100% · Functions 84% · Lines 92.8% (domain-only,
ver `coverage-final.md` rodada anterior). `s3-armazenamento-bruto.gateway.ts`
não existia.

---

# Coverage Baseline — T044–T047 (PR #404)

Baseline = suíte já existente no branch antes das adições de QA (commit
`56cf669`, base `main`@`6eaab14`), 66 testes / 12 arquivos:
Statements 92.52% · Branches 91.37% · Functions 90.32% · Lines 92.44%.
`consultar-status-orcamento.ts` e `status.schema.ts` já em 100%;
`status.controller.ts` em 94.11% stmt / 75% branch (rethrow de erro
inesperado, linha 62, não exercitado por nenhum teste do dev-back-end).
