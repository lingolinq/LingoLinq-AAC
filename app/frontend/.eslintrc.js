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
    },
  ]
};
