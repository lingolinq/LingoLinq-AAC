'use strict';

module.exports = {
  extends: 'recommended',

  rules: {
    'no-partial': true,
    // Temporarily disabled for Phase 1 - will address in Phase 2
    'link-rel-noopener': false,
    'no-inline-styles': false,
    'require-button-type': false,
    'require-valid-alt-text': false,
    'no-html-comments': false,
    'no-invalid-role': false,
    'no-invalid-interactive': false,
    'simple-unless': false,
    'no-log': false
  }
};
