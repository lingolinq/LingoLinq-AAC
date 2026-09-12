# app/frontend (Ember 5.12)

Loads when you work under `app/frontend/`. The repo-wide rules live in the root
`CLAUDE.md`; this file carries only what is specific to the Ember app.

## Commands

```bash
cd app/frontend
npm install
ember serve                       # port 8184, auto-compiles
ember test                        # QUnit
npm run lint:js && npm run lint:hbs
ember build --environment production
```

Node is 22 (`.nvmrc` here and at the repo root; `package.json` engines `>=22 <23`).
`bin/ember-server` at the repo root forces Node 22 for the dev server. Run `node -v`
before trusting any test output: a wrong-Node run can die during BUILD and still print
a `# fail` line, which looks exactly like a red suite.

## Reading a test run (the shape of the run, before the failures)

- **Check `# skip` first.** A complete run reports `# skip 38` (near-constant) with a
  total that drifts upward as tests are added. A truncated run reports a much smaller
  skip count and a total well short of the last good baseline. The usual cause is
  `Browser timeout exceeded: 120s`: testem's `browser_disconnect_timeout` reaping a
  headless browser that went silent under machine load, not a slow test. The tell is
  that the named test differs every run and passes in isolation
  (`npx ember test --filter "<name>"`).
- **A failure needs a baseline before it is a regression.** Re-run the full suite with
  your change reverted in the working tree. Same counts with different failing test
  names means flaky, not a regression; a real regression fails the same tests every time.
  Known global-failure source: an async `localStorage.getItem` in
  `capabilities.sync_access_token` landing after another test tore down its stub. QUnit
  charges that to whichever test is running.
- **Do not run a full suite while `ember serve` or browser probes are running.** That
  contention is the cause of truncation.
- **Do not raise `browser_disconnect_timeout` in `testem.js`.** The 120s is deliberate.
  CI's fail-fast is a separate mechanism: the `build-and-test` job has a 50-minute
  `timeout-minutes` step cap (`.github/workflows/ci.yml`). For a patient local run,
  copy the config to a temp file outside the repo and pass `--config-file`.
- The same discipline applies to any suite: reconcile totals against a known-good run
  before claiming a delta.

## Ember 5.12 facts that bite

- The 5.12 upgrade set `EXTEND_PROTOTYPES: false` (`config/environment.js`). Array and
  string prototype extensions (`.pushObject`, `.sortBy`, `.mapBy`, `.uniq`, `.compact`)
  do not exist on native arrays. Call them only on an `A()`-wrapped array
  (`import { A } from '@ember/array'`) or an Ember Data collection, or use native JS.
- `jquery-integration` is `false` in `config/optional-features.json`. jQuery (`$`) is
  still used for some DOM work but never `this.$()` on components; prefer native DOM
  APIs or Ember patterns.
- There is no `eq` template helper; `(eq ...)` throws and aborts the render. Use
  `is_equal` (`app/helpers/is_equal.js`).
- Board tiles have TWO render paths: `templates/board/index.hbs` and the `fast_html`
  string builder in `utils/button.js`. A tile change must land in both.
- `controllers/modals/*.js` files are orphaned (the modal system is component-based; see
  `docs/ember-5.12-migration-findings.md`). Do not revive one without reconciling it
  against its component twin.
- Breakage classes from the 3.28 to 5.12 upgrade: `docs/ember-upgrade/KNOWN-ISSUES.md`;
  open upgrade-regression findings: `audit-reports/ember-upgrade/FINDINGS-EMBER.json`.

## Code style

- **Plain-object and callback context.** When a computed property or function returns a
  plain object whose methods are called later (e.g.
  `appState.get('board_virtual_dom').button_from_point(x, y)`), `this` inside those
  methods is the plain object. Capture `var _this = this;` at the top and use `_this`
  inside. Same for callbacks passed to `new RSVP.Promise()`, `.then()`, or `forEach`.
  The custom ESLint rule `lingolinq/no-this-in-promise-executor` flags the Promise
  executor case.
- **i18n.** Never add raw user-facing text. Templates: `{{t "displayed text"
  key='translation_key'}}`. JS: `i18n.t('translation_key', "default text")`. Translation
  files: `public/locales/*.json`; generator: `i18n_generator.rb` at the repo root.
- **Quotes.** User-facing strings use double quotes; every other string uses single
  quotes. The i18n generator depends on this.
- **Deprecations.** Never suppress or hide one (`registerDeprecationHandler` is not a
  fix). Migrate to the recommended API (`observer()` over `.observes()`, `isTesting()`
  from `@ember/debug` over `Ember.testing`).
- **Styling.** Edit the existing selector in `app/styles/app.scss` or the relevant
  partial; never stack a higher-specificity override or an `!important` patch. Preserve
  class names used for styling unless there is a clear need to change them, and ask
  first. Mixed-unit math inside `clamp()` must be wrapped in `calc()` (SassC). CSS
  compression stays disabled in production (`docs/CSS_SCSS_GUIDELINES.md`).
- **Platform code.** Extract platform-specific behaviour into the `capabilities` library
  and gate features on capability checks; the app ships as web, Cordova, and Electron.
- **ESLint gate is line-anchored.** CI runs `npm run lint:js:ci` against `.eslint-todo`,
  which fingerprints legacy findings by line. Editing a legacy file can surface "new"
  findings that are really shifted old ones; fix them rather than re-baselining.

## Map

Offline support: IndexedDB (web) or SQLite (mobile) through `utils/dbman.js`.

Key utilities in `app/utils/`: `app_state.js` (application state, button activation),
`persistence.js` (local DB, sync, Ember Data caching), `edit_manager.js` (board editing,
undo/redo), `capabilities.js` (platform code), `button.js` (button helpers; buttons live
on board objects), `content_grabbers.js` (image/sound/video search), `raw_events.js`
(clicks, drags, dwell, eye-gaze), `scanner.js` (scanning mode), `speecher.js` (speech
synthesis), `utterance.js` (sentence box), `modal.js`, `i18n.js`, `sync.js` (online
status, remote modeling), `eval.js` (assessments), `profiles.js`.

Models in `app/models/` mirror server names; `User`, `Board`, and `ButtonSet` are large.

Hotspots: `editManager.process_for_displaying`, `Board.contextualized_buttons`,
`app_state.activate_button`, `persistence.sync`, `persistence.getJSON`,
`LingoLinq.Buttonset.load_button_set`, `User.currently_premium`,
`controllers/board/index.js:computeHeight`, `initializers/attempt_lang.js`.
