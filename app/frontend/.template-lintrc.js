'use strict';

const fs = require('fs');
const path = require('path');

// no-implicit-this cannot tell a curly *component* invocation ({{guided-tour}},
// which resolves to a real component at runtime) from a bare *property* ref
// ({{home_board_pref}}, which throws an unrecoverable render error in Ember 5.x).
// It has no resolver, so it flags both. We want it to flag ONLY the real bugs.
//
// So we hand it the resolver it lacks: allow-list every dasherized component name
// that actually exists on disk. This is generated (not hardcoded) so new components
// are covered automatically, and it is self-correcting -- a mistyped or nonexistent
// component name has no matching file, stays off the allow-list, and is still caught.
// A bare property (snake_case / camelCase, no matching component file) is never
// allow-listed and continues to fail lint, which is the behavior we actually want.
function existingComponentNames() {
  const names = new Set();
  const roots = [
    'app/components',
    'app/templates/components',
    'app/templates/modals',
  ];
  const walk = (dir, base) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // directory may not exist in every build context
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, base);
      } else if (/\.(js|ts|hbs|gjs|gts)$/.test(entry.name)) {
        const rel = path
          .relative(base, full)
          .replace(/\.(js|ts|hbs|gjs|gts)$/, '');
        names.add(rel); // nested form, e.g. foo/bar
        names.add(rel.split('/').pop()); // leaf form, e.g. bar
      }
    }
  };
  for (const root of roots) {
    walk(path.join(__dirname, root), path.join(__dirname, root));
  }
  return [...names].sort();
}

module.exports = {
  extends: 'recommended',

  plugins: ['./template-lint-plugin-lingolinq'],

  rules: {
    'no-fn-handler-factory': 'error',
    'no-partial': true,
    // Enforce no-implicit-this to catch bare-property render crashes (Ember 5.x),
    // while allow-listing real curly component invocations so they are not flagged.
    'no-implicit-this': { allow: existingComponentNames() },
    // Disabled deliberately -- NOT to silence a defect. This rule is satisfied only by a
    // <track kind="captions"> containing the words being said. Our media is user-recorded
    // speech/sounds and app sound effects; the 9 <video>s have no transcription field at all,
    // so the rule is unsatisfiable for them. A stub/empty track was rejected: it would falsely
    // advertise captions to a deaf user. What we could honestly do was done -- every exposed
    // player has a descriptive aria-label (ecb5a9625).
    // The real gap (we already speech-to-text recorded sounds and never surface it as captions)
    // is written up as a tracked opportunity: docs/ACCESSIBILITY_MEDIA_CAPTIONS.md
    'require-media-caption': false,
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
