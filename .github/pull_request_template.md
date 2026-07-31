## Checklist

- [ ] Nenhum import direto entre Bounded Contexts (`src/bounded-contexts/<bc>/`). Comunicação cross-context é via Domain Event ou Anti-Corruption Layer explícita.
  - **Única exceção autorizada**: `src/shared-kernel/tenant/` (ADR-004, spec 007). Qualquer outro código compartilhado por import direto entre contextos deve ser rejeitado na revisão.
  - Violação é detectada automaticamente por `npm run lint` (regra `nexo-boundaries/no-cross-bounded-context-import` em `eslint-rules/no-cross-bounded-context-import.mjs`).
- [ ] Testes relacionados ao diff passam.
