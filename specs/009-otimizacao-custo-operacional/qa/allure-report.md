# Allure — T004 (spec-009)

Reporter já configurado no projeto (`vitest.config.ts`): `allure-vitest/reporter`,
`resultsDir: "allure-results"`.

Geração:
```
npx vitest run tests/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.test.ts
```
Resultado: `allure-results/` populado com 9 result-files (um por caso de teste),
sanitizado por padrão (VO não expõe segredo, PII ou payload externo — apenas hash
sintético de teste).

Geração do HTML (fora do escopo local deste worktree — depende de `allure` CLI
não instalado; delegado ao passo de CI, que já publica o artefato). Resultado bruto
(`allure-results/*.json`) é suficiente como evidência reproduzível deste gate.
