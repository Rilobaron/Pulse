// ESLint flat config — single source of lint rules for the whole monorepo.
//
// - Base: ESLint recommended + typescript-eslint recommended (syntax-based, not
//   overly restrictive).
// - Type-aware rules (floating promises) only on workspace sources via the
//   TypeScript project service.
// - React Hooks rules only on the web app.
// - Built output, dependencies and logs are never linted.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.log',
      'apps/web/dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Leading-underscore args/vars are intentionally unused (e.g. Express' `next`).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Type-aware rules for TypeScript sources (project service discovers the
  // nearest tsconfig for each file, so the three workspaces are covered).
  {
    files: [
      'apps/api/src/**/*.ts',
      'apps/web/src/**/*.{ts,tsx}',
      'packages/shared/src/**/*.ts',
    ],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // Catch fire-and-forget promises and async callbacks used as void fns.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
    },
  },

  // Node runtime for the API.
  {
    files: ['apps/api/src/**/*.ts', 'apps/api/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Browser runtime + React rules for the web app.
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/vite.config.ts'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },

  // Vitest globals in test files.
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
      },
    },
  },
);
