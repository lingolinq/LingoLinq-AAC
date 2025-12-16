module.exports = {
  root: true,
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      legacyDecorators: true
    }
  },
  plugins: [
    'ember'
  ],
  extends: [
    'eslint:recommended',
    'plugin:ember/recommended'
  ],
  env: {
    browser: true
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'off',
    'ember/no-function-prototype-extensions': 'off',
    'no-useless-escape': 'off',
    'no-constant-condition': 'off',
    'no-empty': 'off',
    'no-redeclare': 'off',
    'no-debugger': 'off',
    'ember/closure-actions': 'off', // TODO: fix this
    'ember/avoid-leaking-state-in-ember-objects': 'off', // TODO: fix this
    'ember/no-observers': 'off',
    'ember/use-brace-expansion': 'off',
    'ember/no-jquery': 'off', // TODO: refactor away from jQuery in future
    'ember/no-ember-testing-in-module-scope': 'off',
    'ember/no-unnecessary-route-path-option': 'off',
    'ember/require-return-from-computed': 'off'
  },
  overrides: [
    // node files
    {
      files: [
        '.eslintrc.js',
        '.template-lintrc.js',
        'ember-cli-build.js',
        'testem.js',
        'blueprints/*/index.js',
        'config/**/*.js',
        'lib/*/index.js',
        'server/**/*.js'
      ],
      parserOptions: {
        sourceType: 'script'
      },
      env: {
        browser: false,
        node: true
      },
      plugins: ['node'],
      rules: Object.assign({}, require('eslint-plugin-node').configs.recommended.rules, {
        // add your custom rules and overrides for node files here

        // this can be removed once the following is fixed
        // https://github.com/mysticatea/eslint-plugin-node/issues/77
        'node/no-unpublished-require': 'off',
      })
    }
  ]
};
