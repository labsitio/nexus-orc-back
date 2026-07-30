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

---

# Coverage Baseline — T011 (issue #16) — PR #410

Baseline = suíte existente no branch antes desta validação (commit
`2c65c3b`, sem teste de `DrizzleOrcamentoRepository`), medida com
`pnpm exec vitest run --coverage` e `DATABASE_URL` setado (74 testes, 13
arquivos): Statements 81.15% · Branches 55% · Functions 75.67% · Lines
80.97%. `drizzle-orcamento.repository.ts` (arquivo do diff desta task):
**0%** statements/branches/functions/lines — arquivo novo, sem nenhum teste
consumindo-o antes desta validação.

---

# Coverage Baseline — T050–T055 (issues #55–#60) — PR #416

Baseline = suíte de `main` antes deste PR (sem `DATABASE_URL`, 12 testes
Drizzle/Postgres pulados): 176 testes/38 arquivos executados já incluem os
testes de US5 escritos pelo dev-back-end no mesmo commit avaliado (T050/T051
já existiam como unit/contract test antes de T052-T055 implementarem
produção — TDD). Todos os arquivos de produção do diff
(`confirmar-revisao-humana.ts`, `revisao-humana.controller.ts`,
`revisao-humana.schema.ts`, `confirmar-revisao-humana-lambda-role-stack.ts`)
são novos nesta trilha — baseline de cobertura para eles é 0% por não
existirem antes. Ver `coverage-final.md` para o resultado desta validação.
