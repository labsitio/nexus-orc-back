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
