import setupDeprecationWorkflow from 'ember-cli-deprecation-workflow';
import config from './config/environment';

// Surface — never silence — Ember deprecations. With EXTEND_PROTOTYPES:false and
// the app on the 6.0 trajectory, the 5.12 upgrade left deprecation warnings
// invisible (LL-44aae2db6b). This wires ember-cli-deprecation-workflow so those
// warnings are logged where they can be seen and fixed.
//
// Posture (deliberate, per CLAUDE.md "NEVER suppress or hide deprecations"):
//   - `workflow: []` with NO `{ handler: 'silence' }` entries — nothing is muted.
//   - `throwOnUnhandled: true` in **test** — unhandled deprecations fail the suite
//     so new until:6.0 (or other) debt cannot land unnoticed. Development keeps
//     `false` so exploratory console work still logs via Ember's default handler.
//   - Do NOT add `handler: 'silence'` to green the suite. Prefer fixing the call
//     site, or (for verified non-until:6.0 noise only) `{ handler: 'log', match }`.
//
// Note: `ember-htmlbars.style-xss-warning` uses Ember `warn()`, not `deprecate()`,
// so it does not enter this workflow (seen on some org pages as a console WARNING).
//
// Skipped in production: this is a build-hardening aid for developers, not a
// runtime feature, so end users never see deprecation console noise.
if (config.environment !== 'production') {
  setupDeprecationWorkflow({
    throwOnUnhandled: config.environment === 'test',
    workflow: [],
  });
}
