// ── Scope check ──────────────────────────────────────────────────────────────
// One job: catch a name used where it does not exist. esbuild only checks that
// the syntax parses, and the money tests never render a component, so a real
// crash slipped through both — a wallet total computed inside a child component
// that had never been given the wallets. It built clean, passed every test, and
// took the whole page down on load.
//
// Deliberately not a style linter. Formatting rules on a 7,000-line file would
// bury the one rule that matters in thousands of complaints nobody reads.
//
//   npx eslint fintracker/src tests build
import globals from 'globals';

export default [
  {
    files: ['**/*.js', '**/*.mjs', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        // loaded from CDN in fintracker/index.html, not bundled
        React: 'readonly',
        ReactDOM: 'readonly',
        firebase: 'readonly',
        Chart: 'readonly',
        // declared in fintracker/index.html's inline script, above the bundle
        auth: 'readonly',
        db: 'readonly',
        // stamped in at bundle time by build/build.mjs (esbuild `define`)
        __BUILD_DATE__: 'readonly',
        __GIT_HASH__: 'readonly',
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-undef': 'error',
      // a name assigned but never read is usually a rename left half-finished
      'no-unused-vars': ['warn', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
      // `if (x = 1)` and friends — cheap to check, expensive to debug
      'no-cond-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      // two React components or handlers sharing a name: the later one wins
      // silently, which is how a fix can appear to do nothing at all
      'no-redeclare': 'error',
      'no-func-assign': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
    },
  },
  {
    // node scripts and tests, not the browser
    files: ['tests/**', 'build/**', 'functions/**', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['functions/**'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
