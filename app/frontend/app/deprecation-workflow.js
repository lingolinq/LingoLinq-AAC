import setupDeprecationWorkflow from 'ember-cli-deprecation-workflow';
import config from './config/environment';

// Surface — never silence — Ember deprecations. With EXTEND_PROTOTYPES:false and
// the app on the 6.0 trajectory, the 5.12 upgrade left deprecation warnings
// invisible (LL-44aae2db6b). This wires ember-cli-deprecation-workflow so those
// warnings are logged where they can be seen and fixed.
//
// Posture (deliberate, per CLAUDE.md "NEVER suppress or hide deprecations"):
//   - `workflow: []` with NO `{ handler: 'silence' }` entries — nothing is muted.
//   - `throwOnUnhandled: false` — unhandled deprecations fall through to Ember's
//     default handler, which LOGS them. This keeps dev/test builds working while
//     the migration-era deprecation backlog is worked down, instead of breaking
//     the suite on day one.
//   - Follow-up (CI hardening): once the deprecations are triaged into the
//     workflow list and cleared, flip `throwOnUnhandled` to true (or set
//     EmberENV.RAISE_ON_DEPRECATION in config/environment.js for the test env) so
//     new deprecations fail CI. Do NOT add `handler: 'silence'` to get there.
//
// Skipped in production: this is a build-hardening aid for developers, not a
// runtime feature, so end users never see deprecation console noise.
if (config.environment !== 'production') {
  setupDeprecationWorkflow({
    throwOnUnhandled: false,
    workflow: [],
  });
}
