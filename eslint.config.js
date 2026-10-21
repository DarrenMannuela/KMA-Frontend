import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Matches tsconfig's own noUnusedLocals/noUnusedParameters: false — this
      // codebase leaves unused destructured params/locals in a few deliberate
      // spots (documenting a shape, keeping a signature consistent). Catch
      // real mistakes (unused imports, unused after a refactor) without
      // fighting that convention everywhere else.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // React-specific rules only apply to the app itself — tests/e2e is
    // Playwright, not React, and its fixtures.ts exports a `use` callback
    // param that isn't a React hook; react-hooks/rules-of-hooks can't tell
    // the difference by name alone, so it doesn't belong linting this dir.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Only the two long-established hooks rules, not
      // eslint-plugin-react-hooks@7's full "recommended" bundle — that
      // pulls in a newer family of rules (refs, set-state-in-effect,
      // immutability, etc.) aimed at React Compiler adoption, which this
      // project isn't doing. On a first-time lint pass over an existing
      // ~15k-line app those added 75 of 94 findings, nearly all flagging
      // ordinary, working patterns (fetch-on-mount, syncing state to a
      // route param) rather than real bugs. rules-of-hooks and
      // exhaustive-deps catch actual hook mistakes (hooks called
      // conditionally, stale closures) and are worth enforcing from day one.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
