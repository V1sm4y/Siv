import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', '**/coverage/**',
      '**/generated.ts', '**/*.generated.css', 'packages/db/drizzle/**', 'playwright-report/**', 'test-results/**',
      '.claude/**', 'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  // Next.js rules only where Next code lives.
  ...nextVitals.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx}'] })),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // The domain layer must stay strictly typed and framework-free.
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': ['error', { patterns: ['next/*', 'react', 'react-dom'] }],
    },
  },
  {
    files: ['**/*.test.ts', 'e2e/**/*.ts', 'tooling/**', 'packages/**/scripts/**', 'packages/domain/src/seed.ts', 'packages/db/src/migrate-cli.ts'],
    rules: { 'no-console': 'off' },
  },
);
