'use strict';

module.exports = {
  rules: {
    'no-this-in-promise-executor': require('./rules/no-this-in-promise-executor'),
    'no-orphaned-action': require('./rules/no-orphaned-action')
  }
};
