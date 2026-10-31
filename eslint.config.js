import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NO_TOKEN_STORAGE =
  'The access token lives in memory only (src/auth/session.ts). Browser storage is readable by any script on the page.';

export default tseslint.config(
  { ignores: ['dist', '.e2e-site', 'coverage', 'playwright-report', 'test-results', 'src/api/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Enforce the "tokens never touch browser storage" rule mechanically.
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: NO_TOKEN_STORAGE },
        { name: 'sessionStorage', message: NO_TOKEN_STORAGE },
        { name: 'indexedDB', message: NO_TOKEN_STORAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: NO_TOKEN_STORAGE },
        { object: 'window', property: 'sessionStorage', message: NO_TOKEN_STORAGE },
        { object: 'window', property: 'indexedDB', message: NO_TOKEN_STORAGE },
        { object: 'document', property: 'cookie', message: NO_TOKEN_STORAGE },
      ],
    },
  },
  {
    // Tests may read storage to prove nothing was written there.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
