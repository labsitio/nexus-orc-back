import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Worktrees de agente vivem em `.claude/worktrees/` dentro do repo; sem
    // isso o vitest varre as cópias de teste de cada worktree e reporta
    // falhas de código que não é o desta árvore.
    exclude: [...configDefaults.exclude, '.claude/**'],
    reporters: ['default', ['allure-vitest/reporter', { resultsDir: 'allure-results' }]],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
});
