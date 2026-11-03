# Serve leftover asset locations from LingoLinq

Date: 2026-10-23. Branch: `fix/scot-serve-assets-from-lingolinq-4a45ddbb` (base `develop` at `4bae48a9c`).

Several images, the Windows installer links and the premium voice files point at an S3 location that serves
nothing. This change points the images at copies the app serves itself, drops screenshots of the old interface
from one email, hides the Windows links until a URL is configured, hides the Premium Voices entry points where
voices cannot be downloaded (the web), and removes the external weblinger script fallback.

Learnings searched: `weblinger`, `premium voice`, `content_security_policy`, `installed_app`, `cordova` in
`LEARNINGS.md` (no hits) and `learnings-archive/` (the 2026-06 eye-gaze entry, already superseded by the
self-hosted `/weblinger/` copy; the Capacitor offline entry, see fact 4c).

## Fact sheet

### 1. Icons

- (a) READ: each icon is an `<img src>` literal in a template, rendered by the browser.
  CONFIRMED: `components/button-settings.hbs:419,422,426`, `templates/user/edit.hbs:455,459`,
  `templates/gift_purchase.hbs:87`.
- (b) Shapes: web (`path` helper returns `/images/x`) and installed app (`images/x`, relative).
  CONFIRMED `utils/template_helpers.js:12-18`. Native builds copy `public/images/*` and `public/images/logos/*`
  only. CONFIRMED `lib/tasks/extras.rake:575-576,684-685`.
- (c) Local copies: `public/images/lessonpix_symbolstix_pcs.png` (574x300) and `public/images/logos/ifttt.png`
  (500x500) exist and are served (200 from app.lingolinq.com, 2026-10-22). CONFIRMED. `lessonpix-lingolinq.png`
  and `pcs-lingolinq.png` are promo banners, not icons. CONFIRMED by viewing the file. Square originals
  `lessonpix.png` 300x300, `pcs.png` 284x284, `symbolstix.png` 350x350 downloaded and checked with `file`.

### 2. Usage-reminder email

- (a) READ: `app/views/user_mailer/usage_reminder.html.erb:7,17,28,42` (four `<img>` to the empty bucket).
  The mail is sent from `models/concerns/subscription.rb:1248`. CONFIRMED.
- (b) Shapes: rendered from the file, OR from an admin-saved override (`mailers/concerns/system_email_override.rb:18-32`).
  An override saved from the old default would keep the old image URLs. Whether any environment has one is
  UNVERIFIED (the dev DB tool did not connect); this change cannot reach it. Listed under "Not covered".
- (c) The text part has no images. CONFIRMED (grep of `usage_reminder.text.erb`).

### 3. Windows installer links

- (a) READ: `templates/ambassadors.hbs:31-32` (hard-coded hrefs). `download.hbs:56-71` already gates its Windows
  block on `this.app_state.domain_settings.windows_64_bit_url`. CONFIRMED. `ambassadors.hbs` already reads
  `this.app_state.domain_settings.kindle_store_url` (lines 20, 23), so `app_state` is in scope. CONFIRMED.
- (b) Shapes: setting unset (block hidden) or set by an org's host settings (`models/organization.rb:2315`) /
  `.env.example` `WINDOWS_*_URL`.

### 4. Premium Voices

- (a) READ: entry points `components/voice-output.hbs:30`, `templates/user/preferences.hbs:1923,1963,1979`,
  `components/setup/voice.hbs:30-32`. Setup is ALREADY gated on `setup.premium_voices_supported`
  = `!!(window.cordova || window.extra_tts)` (`controllers/setup.js:568-570`). CONFIRMED.
- (b) Shapes: web (no `window.cordova`, no `window.extra_tts`: download rejects in `capabilities.tts.tts_exec`,
  `utils/capabilities.js` "platform-level tts not available"); Cordova app (`window.cordova.exec`); Electron
  (`window.extra_tts`). CONFIRMED.
- (c) The Capacitor shell installs Cordova-shaped shims; whether it defines `window.cordova` is ASSUMED, not
  checked (shell is outside this repo). Not load-bearing: setup already uses the same test, so gating the other
  entry points the same way keeps every platform consistent with setup's current behaviour.

### 5. Weblinger fallback

- (a) READ: `app/frontend/app/index.html:357-366`, `app/views/layouts/application.html.erb:122-131`.
  `weblingerScriptFailed()` already exists in both and sets `weblinger_load_failed` and status `failed`.
  CONFIRMED. `controllers/user/preferences.js:223-241` polls those globals for 15 s. CONFIRMED.
- (b) Shapes after the change: same-origin load OK (`ready`) or fails (`failed` immediately).
- (c) `https://app.covidspeak.org` is in script-src (`config/initializers/content_security_policy.rb:52`) and
  connect-src (`:88`) and nowhere else outside the learnings archive. CONFIRMED by `git grep -i covidspeak`.

## Proposal

1. Icons: copy the three square icons into `public/images/`; switch all six `<img>` to `{{path "images/..."}}`;
   add `alt=""`. Alternative rejected: reuse the `*-lingolinq.png` banners (wrong shape and content).
2. Email: delete the four `<img>` lines only. Alternative rejected: copy the screenshots (old interface with
   another product's usernames; Scot decided 2026-10-22 to drop them).
3. Ambassadors: wrap the Windows `<h4>` and `<div>` in `{{#if this.app_state.domain_settings.windows_64_bit_url}}`
   and read both hrefs from `domain_settings`, as `download.hbs` does. Alternative rejected: delete only the
   links (leaves "download the right version" copy with nothing to download). `.env.example`: empty the values.
4. Premium Voices: add `capabilities.tts.premium_voices_supported()`. Proposed as setup's
   `!!(window.cordova || window.extra_tts)`; after the implementation review it is
   `!!((window.cordova && window.cordova.exec) || window.extra_tts)`, the condition `tts_exec` uses. Expose it as `premium_voices_supported` computed on the preferences
   controller and the voice-output component and wrap each button in `{{#if}}`. Setup keeps its own computed
   for now: switching it needs a new import line that shifts all 17 `.eslint-todo` anchors in `setup.js`
   (re-baselining needs approval), so it is a noted follow-up. Alternatives rejected: (i) `capabilities.installed_app`
   (differs from setup's existing gate and would show the buttons in an installed shell without the voice bridge,
   where download cannot work); (ii) reusing `tts_exec`'s exact `window.cordova && window.cordova.exec` (stricter
   than setup; would make setup and the other entry points disagree). Revisited in the implementation review:
   (ii) was adopted, see the end of this log; setup's own check is the noted follow-up. Place the new computeds after each file's
   last `.eslint-todo` anchor so no anchor shifts.
5. Weblinger: delete `weblingerLoadFallback`, point `onerror` at `weblingerScriptFailed()`, drop the CSP host from
   both lists.

### Tests (red first) and the mutation that must fail each

- CSP: new `spec/initializers/content_security_policy_spec.rb` asserting no `covidspeak` in script-src or
  connect-src. Mutation: re-add the host.
- Layout: `spec/controllers/boards_controller_spec.rb` renders the Rails layout and reads the Ember `index.html`
  file, asserting no fallback, no `covidspeak` and `onerror` wired to `weblingerScriptFailed()`. Mutation: restore
  the fallback.
- Email: in `spec/mailers/user_mailer_spec.rb` `describe "usage_reminder"`, assert the HTML has no `amazonaws`
  and no `<img` for each of the three branches. Mutation: restore one `<img>`.
- Predicate: unit test, true with `window.cordova`, true with `window.extra_tts`, false with neither, globals
  restored by descriptor. Mutation: return `true`.
- Rendering: `<VoiceOutput />` with a stubbed voice list: button absent with no bridge, present with
  `window.cordova` stubbed. Mutation: remove the `{{#if}}`.
- Icons and ambassadors: templates with no logic beyond the existing helper; verified by grep, template-lint and a
  200 from the dev server for each new path.

### Risks and open questions

- Electron and Capacitor shells are outside this repo; if one defines neither global, its users lose the
  buttons (they could not download there anyway, and setup already hides it there).
- A saved email override (fact 2b) is not reached by this change.
- `preferences.js:220-222` listens on `document` for events the loader dispatches on `window`; out of scope.

## Proposal review (adversary agent, 2026-10-23)

No Critical or High findings; every CONFIRMED fact held (two locator corrections applied above). Accepted:
a unit test for the preferences controller computed; the asset spec scans `git ls-files` (including `.html`,
`.json`, `.yml`) and allows only `voices/` URLs in `tts_voices.js`; the PR text says the external script is
removed from the web app (installed-app shells boot from their own `www/index.html`, outside this repo).
Not taken: splitting the weblinger change into its own PR (the prompt asks for one PR; it is its own commit,
and the choice is put to Scot before pushing). Corrected: the reason for leaving `setup.js` alone. An import
added at the END of `setup.js` would not shift `.eslint-todo` rows (imports are hoisted); it is left because an
import there breaks the file's convention, and the duplicate check is a follow-up.

## Results

Commits (one unit each): weblinger and CSP; icons; usage-reminder email; ambassadors and `.env.example` (with
the asset spec); Premium Voices.

- RSpec (private test DB, after `rails extras:assert_js`): `content_security_policy_spec.rb`,
  `legacy_asset_locations_spec.rb`, `boards_controller_spec.rb` and the `usage_reminder` block of
  `user_mailer_spec.rb` all green. `boards_controller_spec.rb`: 34 examples, 0 failures, 1 pending (the
  pre-existing bodiless `it` at line 195).
- Ember (`--filter "/premium.voices/i"`): 8 tests, 8 pass (after the review's negative predicate test).
- Lint: `npm run lint:js:ci` findings=1556 baseline=1556 new=0; `ember-template-lint --no-clean-todo` on every
  changed template exits 0.
- `git grep` for the bucket now hits only `tts_voices.js` (9 lines); `covidspeak` appears only in the learnings
  archive and the new specs.

Falsification (fix reverted in the working tree after committing, then restored from HEAD):

| Mutation | Went red |
|---|---|
| Old `index.html`, layout and CSP | CSP spec and both weblinger examples (3 of 3) |
| Old `usage_reminder.html.erb` | the "no screenshot images" example |
| Old `ambassadors.hbs`, `.env.example`, `user/edit.hbs`, `pcs.png` removed | all 3 asset examples |
| `{{#if}}` removed from `voice-output.hbs` | "hidden on the web" |
| `premium_voices_supported()` returns `true` | "false on the web" |
| preferences computed returns `true` | controller "false when unavailable" |

The `{{#if}}` wrappers in `preferences.hbs` and the ambassadors Windows gate are not rendered in a test (the
preferences page needs a full user model); `spec/templates/download_gates_spec.rb` checks every Premium
Voices button and the Windows block sit directly inside their gates, and went red with each gate removed
(one preferences gate on its own, then each whole file reverted).

## Not covered

- Premium voice files for the installed apps (`tts_voices.js`), pending a voice licensing decision. Native
  Premium Voices buttons stay and their downloads still point at the empty location.
- Copy that still promises premium voices: `app-state.js` (advice to download one), `pricing.hbs`,
  `subscription-form.hbs`, the comparison row in `compare.hbs`.
- `controllers/setup.js` keeps its own copy of the check (`premium_voices_supported`, same logic).
- An admin-saved override of the usage-reminder email body would keep the old images (fact 2b, unverified).
- `preferences.js` listens on `document` for weblinger events the loader dispatches on `window`.
- A missing `weblinger.js` that the server answers with an HTML page (200) fires `onload`, not `onerror`, so
  the status reaches "unavailable" after the 15 s poll rather than "failed" at once.
- The ambassadors and download pages both hide the Windows section when only a 32-bit URL is configured.
- The full Ember suite and full RSpec suite were not run locally; CI runs both.

## Implementation review (dual review, 2026-10-23)

Preflight: `REVIEWED=range origin/develop (359b70930f5d004fe25142821937605ae54cc6f2) ... HEAD
(6f42d3bab503d4487263949bba31169f05064501)`. Codex `gpt-6.1-sol` (high) and the adversary agent: no Critical
or High. Applied: the predicate now requires `window.cordova.exec` (Codex; negative unit test added, red
first); `spec/templates/download_gates_spec.rb` for the template gates (both reviewers); commit messages
reworded so they claim the weblinger script, not every weblinger fetch, and only the shells that define the
bridge (adversary). Corrected: a learnings entry that blamed `stub()` for the order-dependent rendering
failure was wrong (`stub()` uses `set()` on Ember objects, `tests/helpers/jasmine.js` `shouldUseEmberSet`);
removed, and the test comment now states only what was observed. Not changed: the ambassadors Windows gate
keeps the download page's rule (Codex Medium; noted under Not covered).
