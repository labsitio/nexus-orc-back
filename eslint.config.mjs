// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import noCrossBoundedContextImport from './eslint-rules/no-cross-bounded-context-import.mjs';

// Regra (ADR-004, spec 001/007): nenhum código é compartilhado por import direto
// entre Bounded Contexts (src/bounded-contexts/<bc>/). A única exceção autorizada
// é src/shared-kernel/tenant/, que fica fora de bounded-contexts/ e portanto nunca
// é bloqueada por esta regra. Ver eslint-rules/no-cross-bounded-context-import.mjs.
const boundaryRule = {
  files: ['src/bounded-contexts/**/*.ts'],
  plugins: {
    'nexo-boundaries': { rules: { 'no-cross-bounded-context-import': noCrossBoundedContextImport } },
  },
  rules: {
    'nexo-boundaries/no-cross-bounded-context-import': 'error',
  },
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  boundaryRule,
);
