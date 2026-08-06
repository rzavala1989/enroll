import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat config on ESLint 9, matching apps/web.
 *
 * The API previously declared eslint 8 with the legacy plugin packages
 * and shipped no config file at all, so `pnpm --filter api lint` was a
 * command that could not succeed. Two config eras in one repo also
 * meant no single `pnpm lint` could run across both apps.
 */
export default tseslint.config(
  {
    // __mocks__ is a CommonJS Jest shim, not application source.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/__mocks__/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules are off for now: turning them on across a
        // codebase this size is its own change with its own diff.
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // Nest constructors are all parameter properties, and DTO classes
      // are all declarations; neither reads as an unused variable.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` shows up in the Prisma seams and every spec's mocks. Worth
      // seeing, not worth failing a build over.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
