module.exports = {
  root: true,
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: {
      plugins: [
        ['@babel/plugin-proposal-decorators', { decoratorsBeforeExport: true }],
      ],
    },
  },
  plugins: [
    'ember',
    'lingolinq'
  ],
  extends: [
    'eslint:recommended',
    'plugin:ember/recommended'
  ],
  env: {
    browser: true
  },
  rules: {
    'lingolinq/no-this-in-promise-executor': 'warn',
    // Catches an action that ships but that no control reaches. The
    // board-detail redesign left nine board actions on an edit-mode-only panel
    // and orphaned the old menu's actions outright; the speak-bar features went
    // the same way. Both were found by outside usability review months later.
    // 'warn' + the .eslint-todo baseline: the ~74 pre-existing cases do not
    // block anyone, but a NEW orphan fails lint:js:ci. See
    // docs/task-management/CLAIM-CHECK-BACKLOG.md section G.
    'lingolinq/no-orphaned-action': 'warn',
    'no-console': 'off',
    'no-unused-vars': 'off',
    'ember/no-function-prototype-extensions': 'off',
    'no-useless-escape': 'off',
    'no-constant-condition': 'off',
    'no-empty': 'off',
    'no-redeclare': 'off',
    'no-debugger': 'off',
    'ember/closure-actions': 'off',
    'ember/avoid-leaking-state-in-ember-objects': 'off',
    'ember/no-observers': 'off',
    'ember/use-brace-expansion': 'off',

    // ── Classic-Ember architecture (OFF) ───────────────────────────────────
    // The `eslint-plugin-ember` upgrade (6.x → 11.5.0, pulled in by the Ember
    // 4.12 dependency bump) defaults to the Octane ruleset. This app is a large
    // classic Ember app (.extend() objects, `this.get()`, actions hashes,
    // jQuery, classic components/lifecycle hooks) — these rules flag the
    // *deliberate, working* architecture, not bugs. Following them means a full
    // Octane rewrite (tracked separately), so they're disabled to keep `lint:js`
    // signal-bearing. None of this changes runtime behavior — ESLint config is
    // lint-only.
    'ember/no-get': 'off',                       // this.get()/this.set() — required for paths/proxies here
    'ember/no-classic-classes': 'off',           // EmberObject.extend({...})
    'ember/no-classic-components': 'off',         // @ember/component
    'ember/no-component-lifecycle-hooks': 'off',  // didInsertElement/willDestroyElement
    'ember/require-tagless-components': 'off',
    'ember/no-actions-hash': 'off',              // actions: { ... }
    'ember/no-jquery': 'off',                    // jQuery used intentionally (see CLAUDE.md)
    'ember/require-computed-macros': 'off',
    'ember/use-ember-data-rfc-395-imports': 'off', // DS.* namespace — modernization tracked in deprecation audit
    'ember/no-controller-access-in-routes': 'off',
    'ember/no-unnecessary-route-path-option': 'off',
    'ember/no-mixins': 'off',
    'ember/no-new-mixins': 'off',

    // ── Real bugs / real deprecations (WARN — visible, non-blocking) ───────
    // Kept as warnings (not errors) so `lint:js` is green while these stay on
    // the radar to fix incrementally.
    'ember/require-super-in-lifecycle-hooks': 'warn',       // forgetting _super is a real bug
    'ember/require-computed-property-dependencies': 'warn', // missing deps → stale computeds
    'ember/require-return-from-computed': 'warn',
    'ember/no-side-effects': 'warn',
    'ember/no-string-prototype-extensions': 'warn',         // genuine Ember deprecation
    'ember/no-assignment-of-untracked-properties-used-in-tracking-contexts': 'warn',
    'ember/no-incorrect-calls-with-inline-anonymous-functions': 'warn',
    'ember/no-private-routing-service': 'warn',
    'ember/no-test-import-export': 'warn',
    'no-prototype-builtins': 'warn',
    'no-useless-catch': 'warn',
  },
  overrides: [
    {
      files: [
        '.eslintrc.js',
        '.prettierrc.js',
        '.stylelintrc.js',
        '.template-lintrc.js',
        'ember-cli-build.js',
        'testem.js',
        'blueprints/*/index.js',
        'config/**/*.js',
        'lib/*/index.js',
        'scripts/**/*.js',
        'server/**/*.js'
      ],
      parserOptions: {
        sourceType: 'script'
      },
      env: {
        browser: false,
        node: true
      },
      extends: ['plugin:n/recommended'],
    },
    {
      files: ['tests/**/*-test.{js,ts}'],
      extends: ['plugin:qunit/recommended'],
      // The qunit/recommended assertion-style rules flag legacy test patterns
      // (assert.equal vs strictEqual, missing assert.expect, etc.). Downgraded
      // to warnings so the existing suite doesn't fail `lint:js`; they remain
      // visible to clean up over time. Test-only — no app impact.
      rules: {
        'qunit/no-assert-equal': 'warn',
        'qunit/require-expect': 'warn',
        'qunit/no-assert-equal-boolean': 'warn',
        'qunit/no-ok-equality': 'warn',
        'qunit/no-assert-logical-expression': 'warn',
        'qunit/no-commented-tests': 'warn',
        'qunit/no-negated-ok': 'warn',
      },
    },
  ]
};
