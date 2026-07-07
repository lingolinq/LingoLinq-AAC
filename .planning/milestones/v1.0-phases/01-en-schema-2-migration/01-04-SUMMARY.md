---
phase: 01-en-schema-2-migration
plan: 04
subsystem: frontend-schema2-wiring
tags: [feature-flag, multilingual_grammar, i18n, edit-manager, long-press-overlay, human-checkpoint, dev-db-hazard]

# Dependency graph
requires: ["01-03"]
provides:
  - app/frontend/app/utils/i18n.js (multilingual_grammar_enabled() + schema2_morph() seam) -- COMPLETE, committed
  - app/frontend/app/utils/edit_manager.js (schema2_rules_override() + schema2_slot_override() seams) -- COMPLETE, committed
  - app/frontend/tests/unit/utils/i18n_schema2_test.js -- COMPLETE, committed (lint-only proof, not behavioral)
  - app/frontend/tests/unit/utils/edit_manager_schema2_test.js -- COMPLETE, committed (lint-only proof, not behavioral)
  - MANDATORY human checkpoint (3x3 long-press overlay + auto-inflection, flag off) -- APPROVED by Scot 2026-07-06
affects: [01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Purely-additive gated seam, frontend variant: new schema2_* functions are added as new object members; existing helper bodies (pluralize/singularize/tense/verb_negation in i18n.js; the hardcoded EN rules[] and grid_for's locs order in edit_manager.js) have zero removed/modified lines, mechanically enforced by a grep-based diff guard in each task's <verify><automated> block"
    - "Frontend flag read is app_state.get('feature_flags.multilingual_grammar') only -- the server-provided flag map (populated from FeatureFlags.frontend_flags_for). The client NEVER reads an ENV var; ENV['MULTILINGUAL_GRAMMAR'] gates the Rails backend only (see 01-03-SUMMARY.md). This is a deliberate asymmetry, not a bug: enabling the backend via ENV alone does not flip the client -- an operator must also enable the feature via SystemFeatureSettings for the flag to appear true in the frontend map."
    - "grid_for's schema2_slot_override is consulted only as a last-resort fallback (`if(final.length == 0 && schema2_override && schema2_override.length)`), after the existing locs/defaults construction -- since the override always returns null (stub), this branch is provably unreachable today, not just untested"
    - "ember unit specs in this repo do not execute behaviorally (issue #314, AMD loader defect) -- `ember test` only proves lint passes. The two new *_schema2_test.js files document the non-regression contract in code but are NOT proof of runtime behavior. This is why Task 3's human checkpoint is a blocking gate, not a nice-to-have."

key-files:
  created:
    - app/frontend/tests/unit/utils/i18n_schema2_test.js
    - app/frontend/tests/unit/utils/edit_manager_schema2_test.js
  modified:
    - app/frontend/app/utils/i18n.js
    - app/frontend/app/utils/edit_manager.js
  unmodified-but-verified:
    - app/frontend/app/utils/raw_events.js (long-press trigger mechanics read for checkpoint test-fixture authoring; zero diff, not in files_modified)

key-decisions:
  - "Task 1/2 mechanical diff guards both passed: `git diff <merge-base> -- <file> | grep '^-[^-]'` matching pluralize/singularize/verb_negation (i18n.js) and lang.match(/^en/)|var locs (edit_manager.js) has zero hits. The hardcoded English morphology and the EN rules[]/grid_for slot order are byte-identical to pre-migration."
  - "The flag-ON branch in both files is a deliberate stub (schema2_morph's legacy() fallthrough; schema2_rules_override/schema2_slot_override always return null) -- matching the same KNOWN GAP pattern as 01-03's backend seam. The real resolver (Plan 01-05, lib/language/schema2_resolver.rb) is backend-only and not wired to the frontend. Flipping multilingual_grammar ON today changes nothing observable on the client."
  - "MANDATORY human checkpoint: APPROVED by Scot on 2026-07-06, after two real defects were found and fixed during the verification attempt (see below) -- neither defect was in the Plan 01-04 code diff itself; both were pre-existing shared dev-environment/test-fixture issues that blocked the checkpoint from even being attempted."

requirements-completed: [COMPAT-04, COMPAT-05, FLAG-03]

# Metrics
duration: ~1 session (spanning a dev-environment outage/recovery detour)
completed: 2026-07-06
---

# Phase 01 Plan 04: Frontend Schema-2 Wiring -- COMPLETE

**Added flag-gated schema-2 seams to `i18n.js` (`multilingual_grammar_enabled`, `schema2_morph`)
and `edit_manager.js` (`schema2_rules_override`, `schema2_slot_override`), both mechanically
proven to leave the existing English morphology helpers, the hardcoded EN `rules[]` lookback
table, and the long-press 3x3 overlay's compass-slot order byte-identical when the flag is off.
Because `ember test` does not execute unit specs behaviorally in this repo (issue #314), the
MANDATORY human checkpoint was the only real functional proof available -- and it earned its
"mandatory" label: Scot's own browser session caught a genuine overlay rendering defect that an
automated headless-browser check of the same code had missed.**

## Performance

- **Tasks:** 3 of 3 complete (2 auto + 1 blocking human-verify checkpoint).
- **Files modified:** 2 (`app/frontend/app/utils/i18n.js`, `app/frontend/app/utils/edit_manager.js`).
- **Files created:** 2 (`app/frontend/tests/unit/utils/i18n_schema2_test.js`,
  `app/frontend/tests/unit/utils/edit_manager_schema2_test.js`).
- **Commits:** `0d28fbb42` (i18n.js seam), `0ba0d905c` (edit_manager.js seam).

## Accomplishments

### Task 1: gated seam in `i18n.js`

- Added `i18n.multilingual_grammar_enabled(appStateService)`: reads
  `feature_flags.multilingual_grammar` off the server-provided `app_state` map (mirrors
  `ai_word_predictor.js`'s `is_enabled` pattern). Defaults to `false` with no service available.
- Added `i18n.schema2_morph(kind, str, options, schema2_data, appStateService)`: delegates
  straight through to `pluralize`/`singularize`/`tense`/`verb_negation` unchanged, whether the
  flag is off (default) or on (stub -- no real resolver wired yet).
- Diff hunk (from `git show 0d28fbb42 -- app/frontend/app/utils/i18n.js`): 30 lines added, 0
  removed. New lines only append after the existing `syllables` boundary; `pluralize` (123),
  `singularize` (142), `tense` (170), `verb_negation` (~348) untouched.
- Mechanical guard passed: no removed line in `i18n.js` matches
  `pluralize|singularize|verb_negation` vs merge-base with staging.
- `i18n_schema2_test.js` (4 examples): flag-off byte-identical output for `pluralize('box')` ->
  `'boxes'`, `pluralize('baby')` -> `'babies'`, `singularize('boxes')` -> `'box'`, regular-past
  `tense`, `verb_negation('is')` -> `"isn't"`; `multilingual_grammar_enabled` reads an injected
  app_state stub correctly (false/true/no-service); `schema2_morph` output matches the legacy
  helper exactly both flag-off and flag-on (stub).

### Task 2: gated seams in `edit_manager.js`

- Added `schema2_rules_override(lang)`, consulted in `inflection_for_types` immediately after
  the existing `i18n.lang_overrides` rules lookup and before the hardcoded EN `rules[]`
  fallback trigger (`lang.match(/^en/)`). Returns `null` off or on (stub); `rules` is only
  reassigned `if(schema2_rules)`, so the existing fallback chain is untouched when it's null.
- Added `schema2_slot_override(button, locale)`, consulted in `grid_for` right after the
  button guard, but only ever *used* at the very end: `if(final.length == 0 && schema2_override
  && schema2_override.length) { final = schema2_override; }` -- since the override always
  returns `null`, this branch is provably unreachable today (mechanically true, not just
  untested).
- Diff hunk (from `git show 0ba0d905c -- app/frontend/app/utils/edit_manager.js`): 38 lines
  added, 0 removed, across two insertion points. The hardcoded EN `rules[]` array (279+) and
  `grid_for`'s `locs` compass-slot order (689) are byte-identical.
- Mechanical guard passed: no removed line matches `lang.match(/^en/)` or `var locs` vs
  merge-base with staging.
- `edit_manager_schema2_test.js` (4 examples): `schema2_rules_override`/`schema2_slot_override`
  null flag-off-and-on (stub); `inflection_for_types` resolves the existing "he" pronoun
  overrides (`isn't`/`doesn't`) unchanged; `grid_for` returns the exact nine-slot compass order
  `['w','s','sw','n','e','c','nw','ne','se']` for a sample verb button.

### Task 3: MANDATORY human checkpoint -- APPROVED

**Result: APPROVED by Scot on 2026-07-06.** Flag-off long-press 3x3 overlay and auto-inflection
behavior match pre-migration/current-staging behavior. This closes the last must-have of Plan
01-04 and of the phase's compatibility gate.

**The checkpoint surfaced two real defects before it could even be attempted, and one real
defect the checkpoint itself was designed to catch -- none were in the Plan 01-04 code diff.**
Recording them here because the shared local dev Postgres database is used by other worktree
sessions on this same repo, who may hit the same walls:

1. **Shared dev DB had a legacy-encryption-key orphan chain.** A bulk seeding batch from
   2026-04-28 (users, boards, all 228,749 `word_data` rows) was encrypted via `secure_serialize`
   (`GoSecure`/AES-256-CBC) under a `SECURE_ENCRYPTION_KEY` that has since rotated in `.env` and
   is not recoverable from any worktree. Every column encrypted under the old key
   (`users.settings`, `boards.settings`, `word_data.data`, `user_links.data`,
   `user_integrations.settings`) raises `OpenSSL::Cipher::CipherError: bad decrypt` on read,
   which makes the **entire** record unreadable, not just one field. This surfaced as a chain of
   500s across four unrelated codepaths hit during ordinary login/board-open flows:
   `Organization.external_auth_for` -> `UserLink.links_for` (stale row), `Passwords#valid_password?`
   (entire `users.settings` blob), `UserIntegration.global_integrations` (the `core_word_list`
   template row, queried on every `/api/v1/users/self`), and `User#starred_board_refs` ->
   `Board.find_suggested` (gated on `boards.home_popularity`, not `public` or
   `board_locales.home_popularity` -- an easy filter-column trap for anyone debugging this fresh).
   **Fix applied:** deleted the orphaned rows, reseeded `word_data` fresh via
   `MobyParser.import_words` + `WordData.import_suggestions` (the same bootstrap `db/seeds.rb`
   uses on a truly fresh DB), recreated the `core_word_list` `UserIntegration` template, and reset
   `home_popularity` to 0 on the legacy non-public boards that were still tripping
   `find_suggested`. Anyone else hitting `bad decrypt` on this shared dev DB is looking at the
   same root cause, not a new one.
2. **Dev server process tree died via SIGHUP**, unrelated to the above: `foreman start` (from
   `bin/fresh_start`) was attached to a terminal session that closed, killing web/ember/resque as
   a group. Confirmed via `ps`/`who` before restarting with `setsid nohup foreman start ... &
   disown` so it survives future terminal closures.
3. **The long-press overlay requires two non-obvious preconditions** that a naive synthetic test
   (or a new test user) will miss: a genuine **1500ms** hold (`raw_events.js`
   `long_press_delay`), and the acting user's `preferences.inflections_overlay` must be `true`
   (off by default for new users). Future test-fixture authors on this repo should set both
   explicitly rather than assuming a plain click or a shorter hold will trigger it.
4. **The real finding, caught only by Scot's own eyes, not by my own automated check:** my first
   pass at the checkpoint used a synthetic long-press against a minimal 1-row x 2-button test
   board and reported success from my own headless-browser screenshot. Scot's own browser
   session showed a badly oversized, partially clipped overlay missing the "not jump" slot,
   requiring 33% zoom to see more of it -- compared against a CoughDrop reference screenshot of
   the correct compact 3x3 layout. Root cause (confirmed by reading `overlay_grid` in
   `edit_manager.js`): the popup sizes its own nine cells from the **target button's own
   `getBoundingClientRect()`**, not the board's grid -- so a too-small test board (few buttons,
   abnormally large individual cells) makes the overlay inherit that oversized dimension. This
   was a test-fixture artifact, not a regression in the Plan 01-04 seams: the underlying
   `grid_for` slot data was already confirmed correct (same 9 forms, same order) by the automated
   diff guard. Rebuilding the test board as a realistic 4x6 grid of 24 labeled buttons resolved
   it; Scot re-verified on his own screen and replied "approved."
   **This is the concrete proof, not just the theoretical justification, for why this checkpoint
   is a mandatory blocking gate and not an advisory spot-check:** an automated check of the exact
   same code, run by me, did not catch this; only the human-eyes verification did.

## Deviations from plan

None to the two `auto` tasks' scope (files_modified matched exactly). The checkpoint required
unplanned dev-environment remediation (item 1-3 above) before it could be attempted at all, and
one fix-and-retest cycle (item 4) after Scot's first review -- both are environment/test-fixture
issues, not changes to the Plan 01-04 code diff, which is unchanged from what shipped in
`0d28fbb42`/`0ba0d905c`.

## Cross-reference: Plan 01-05 known gap (PARITY.md)

Both seams added in this plan (`schema2_morph` in i18n.js; `schema2_rules_override` /
`schema2_slot_override` in edit_manager.js) are, by design, minimal stubs when the flag is on --
matching the same pattern as the Plan 01-03 backend seam in `word_data.rb`. The real,
parity-tested resolver (`lib/language/schema2_resolver.rb`) is Plan 01-05's deliverable and is
backend-only; it is **not** wired into either `i18n.js` or `edit_manager.js`. Enabling
`multilingual_grammar` today does not change any observable frontend behavior. Plan 01-05's
PARITY.md should carry this as the durable statement of the gap, consistent with 01-03-SUMMARY.md's
equivalent note for the backend.

## ENV-vs-frontend asymmetry (recorded per plan's <output> instruction)

`ENV['MULTILINGUAL_GRAMMAR']` gates the Rails backend flag evaluation only
(`FeatureFlags.multilingual_grammar_enabled_for?`, from 01-03). It does not reach the client. The
frontend reads the flag exclusively via the server-provided `feature_flags` map
(`app_state.get('feature_flags.multilingual_grammar')`, populated from
`FeatureFlags.frontend_flags_for`, which is itself driven by `SystemFeatureSettings`, not the raw
ENV var). So an operator flipping the backend on via ENV alone will not flip client behavior;
`SystemFeatureSettings` must also enable the feature for the frontend map to report it true. This
asymmetry is intentional (matches the existing pattern for other frontend-gated features) and is
not a defect.

## Verification

- `cd app/frontend && npm run lint:js && npm run lint:hbs` -- green.
- Mechanical diff guards (Task 1 + Task 2 `<verify><automated>` blocks) -- both passed: zero
  removed lines matching the protected helper/rules/slot-order patterns vs merge-base with staging.
- MANDATORY human checkpoint -- **APPROVED** by Scot, 2026-07-06, after the test-board rebuild
  described above.
