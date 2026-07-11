---
phase: 01-expired-link-ux
plan: 02
subsystem: ui
tags: [ember, ember-data, route, controller, i18n, qunit]

# Dependency graph
requires:
  - phase: 01-expired-link-ux
    provides: "boards_controller#lesson boots the Ember shell for an unresolved lesson_share_token instead of 404 (Plan 01)"
provides:
  - "routes/lesson.js model() converts an unresolvable lesson_share_token (expired, malformed, wrong-signature) into a link_expired sentinel, regardless of whether findRecord resolves-with-no-user or rejects"
  - "controllers/lesson.js link_expired flag, defaulted false and reset on every setup_tracking() call"
  - "lesson.hbs renders a reason-agnostic link-expired panel (title/body/recovery link) mutually exclusive with the lesson iframe and all lesson content"
  - "public/locales/en.json + es.json carry the three new link_expired_* keys"
  - "UX-06 runtime finding: Ember Data 5.3.8's store.findRecord RESOLVES (does not reject) for an id-mismatched, user-less lesson payload -- logs two console warnings instead"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route model() hooks that call a tolerant JSON API should chain .then/.catch to normalize both a resolved-but-incomplete record and a rejected promise into one sentinel state, rather than relying on Ember's default error substate"
    - "setupController must overwrite controller.model unconditionally, before any conditional branch, whenever a route can resolve either a real model or a sentinel, to prevent a stale prior model surviving a fast re-transition"
    - "For route/controller-level Ember Data behavior verification in this repo, use setupTest + a stubbed adapter.findRecord (not setupApplicationTest + visit()) -- visit() hangs under Mirage per the repo's own documented, already-skipped precedent"

key-files:
  created:
    - app/frontend/tests/acceptance/lesson_expired_test.js
  modified:
    - app/frontend/app/routes/lesson.js
    - app/frontend/app/controllers/lesson.js
    - app/frontend/app/templates/lesson.hbs
    - app/frontend/tests/test-helper.js
    - public/locales/en.json
    - public/locales/es.json

key-decisions:
  - "UX-06 runtime finding (Task 1): store.findRecord('lesson', composite_id) RESOLVES for an id-mismatched, user-less payload -- it does NOT reject. Ember Data 5.3.8 logs two console warnings (record type/id mismatch; RecordIdentifier id-update refusal) but does not throw. This is outcome (b) from the plan, confirmed empirically, not assumed. Task 2's guard therefore treats resolve-with-no-user as the primary path and .catch as a defensive secondary path."
  - "Runtime-verification test uses setupTest (container-only, real store/adapter/serializer, stubbed adapter.findRecord) instead of setupApplicationTest + visit(). This repo's only pre-existing acceptance test (board-detail-empty-state-test.js) is entirely QUnit.skip'd because visit() hangs under Mirage (documented in that file and tests/acceptance/README.md); setupTest still exercises the real Ember-Data + RESTSerializer id-reconciliation logic in question, satisfying REQUIREMENTS.md UX-06's explicit alternative: \"an integration test exercising the real controller -- not asserted from reading code alone.\" A live `ember serve` + hand-crafted-token browser check was not attempted (would require standing up Rails+Postgres+Redis and real token fixtures in this worktree for marginal additional evidence beyond what the stubbed-but-real-Ember-Data test already proves)."
  - "Reverted a full `ruby i18n_generator.rb --generate` run: it correctly extracted the 3 new keys but also reordered/dropped ~190 unrelated keys in en.json (Dir.glob traversal-order non-determinism against this worktree's file set), which is out-of-scope churn. Added only the 3 new keys by hand, in the same content and position the generator produced, leaving the rest of en.json byte-for-byte unchanged."
  - "Added matching '*** <english>' placeholder entries for the 3 new keys to es.json only (the plan's named example locale); the other 11 locale files will pick up placeholders on the project's next full --merge pass, per normal existing workflow -- not run here to avoid the same out-of-scope full-file churn."
  - "Task 4's acceptance tests are route/controller integration tests (setupTest), not full DOM/visit() acceptance tests, following this repo's own existing precedent (tests/unit/components/share-board-guard-test.js) which explicitly scopes itself the same way for the same visit()-hangs reason. The template-structure half of the contract (iframe hidden, panel shown, recovery link present, no reason-revealing text) is verified by ember-template-lint (0 errors) and grep-based structural checks instead of a rendered DOM assertion."

requirements-completed: [UX-02, UX-03, UX-04, UX-05, UX-06, UX-07]

# Metrics
duration: ~55min (session work) + ~20min one-time environment repair (see Deviations)
completed: 2026-07-11
---

# Phase 01 Plan 02: Ember Lesson Route Link-Expired UX Summary

**`routes/lesson.js` now converts an unresolvable `lesson_share_token` into a `link_expired` state (proven by a real Ember-Data-driven test that the resolve-with-no-user path -- not a rejection -- is what actually fires), rendering a reason-agnostic link-expired panel in `lesson.hbs` instead of silently treating a stranger's session as a valid one.**

## UX-06 Runtime Finding (headline result)

`store.findRecord('lesson', '<lesson_id>:<lesson_code>:<user_token>')` **RESOLVES** (it does not reject/throw) when `api/lessons#show` returns its tolerant 200-with-`extra_user: nil` shape for an unresolved token (expired, malformed, or wrong-signature). Ember Data 5.3.8 logs two console warnings instead of throwing:

```
WARNING: You requested a record of type 'lesson' with id '<composite-id>' but the adapter
returned a payload with primary data having an id of '<bare-global-id>'. Use
'store.findRecord()' when the requested id is the same as the one returned by the adapter.
In other cases use 'store.queryRecord()' instead.

WARNING: The 'id' for a RecordIdentifier should not be updated once it has been set.
Attempted to set id for '@lid:lesson-<composite-id>' to '<bare-global-id>'.
```

The resolved record has `user` undefined -- the reliable "token unresolved" signal. This is the same underlying id-reconciliation quirk already worked around for `board` and `buttonset` in `app/serializers/application.js` (that fix normalizes the id before it reaches the store; `lesson` has no equivalent fix, so the warning surfaces, but it does not reject). Full writeup and the exact test that produced this evidence: `app/frontend/tests/acceptance/lesson_expired_test.js` (top-of-file comment + first test).

Because this is a console warning today, not a Promise-rejection contract, `routes/lesson.js#model()` handles BOTH outcomes: resolve-with-no-user (the observed, primary path) and reject (a defensive `.catch`, in case a future Ember Data version tightens the warning into a thrown assertion).

## Performance

- **Duration:** ~55 min of plan-execution work (4 task commits, `04:50Z`-`05:30Z`), plus a one-time ~20 min environment repair (fresh worktree had no `node_modules`; see Deviations)
- **Completed:** 2026-07-11T05:30:18-06:00
- **Tasks:** 4/4 completed
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Empirically determined (not assumed) that an id-mismatched, user-less `findRecord('lesson', ...)` payload **resolves** in this Ember Data version, via a real `setupTest` container test that exercises the actual store/serializer/RecordIdentifier machinery with only the network boundary (`adapter.findRecord`) stubbed.
- Hardened `routes/lesson.js#model()` to convert both possible Ember-Data outcomes (resolve-with-no-user, the observed path; reject, a defensive fallback) into one `{ link_expired: true }` sentinel, without changing the findRecord id composition or the valid-token path.
- Added a belt-and-suspenders route-level `actions.error` that stops any escaped rejection from bubbling to the generic application error page.
- `setupController` now always overwrites `controller.model` first, on both branches, so a fast valid-lesson -> expired-lesson transition can never leave a stale prior lesson visible (adversary-review condition from the plan).
- Added a reason-agnostic link-expired panel to `lesson.hbs`, gated by `{{#if this.link_expired}}`, with a title, explanatory body, and a `Go to LingoLinq` recovery `LinkTo`; the panel renders neither the `lesson_embed` iframe nor any `this.model.*` lesson content.
- Extracted 3 new i18n keys (`link_expired_title`, `link_expired_body`, `link_expired_home`) to `public/locales/en.json`, with `es.json` placeholders, without disturbing the rest of either file.
- 5 tests across `app/frontend/tests/acceptance/lesson_expired_test.js` pin the full contract: the UX-06 runtime finding, expired-token handling, malformed-token producing the identical outcome (UX-05 proof), the valid-token regression, and the no-stale-model guard. All 5 pass under `ember test --filter="lesson expired"`.
- Ran the FULL `ember test` suite (not just the filtered subset) as a regression check: **1707 tests, 1667 pass, 40 skip, 0 fail** -- no regressions introduced anywhere else in the app by this plan's changes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Runtime-verify the Ember-Data findRecord behavior on an expired token** - `82105be2c` (test)
2. **Task 2: Harden routes/lesson.js -- surface a link_expired state for both reject and user-less resolution** - `0a8fb3aaa` (feat)
3. **Task 3: Link-expired panel in lesson.hbs + i18n extraction** - `e5c55a873` (feat)
4. **Task 4: Update the acceptance test to assert the link-expired experience + valid-path regression** - `09405ac31` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `app/frontend/tests/acceptance/lesson_expired_test.js` (new) - UX-06 runtime-finding test (real store/serializer, stubbed adapter.findRecord) plus 4 route/controller integration tests covering expired, malformed, valid, and no-stale-model scenarios.
- `app/frontend/app/routes/lesson.js` - `model()` now chains `.then`/`.catch` to resolve a `LINK_EXPIRED_MODEL` sentinel on either outcome; new `actions.error` fallback; `setupController` always overwrites `controller.model` first, then branches on `link_expired`.
- `app/frontend/app/controllers/lesson.js` - `link_expired` property defaults to `false` and is reset inside `setup_tracking()` so it can never leak across transitions.
- `app/frontend/app/templates/lesson.hbs` - Top-level `{{#if this.link_expired}}` branch: expired panel (title/body/recovery link) vs. the unchanged existing lesson markup.
- `app/frontend/tests/test-helper.js` - Added the required explicit import for the new acceptance test file (repo convention; auto-discovery misses new test modules).
- `public/locales/en.json` - 3 new keys (`link_expired_title`, `link_expired_body`, `link_expired_home`).
- `public/locales/es.json` - Matching `"*** <english>"` placeholder entries for the 3 new keys.

## Decisions Made

See `key-decisions` in the frontmatter above for full rationale on: the UX-06 empirical finding, the `setupTest`-vs-`visit()` test-infrastructure choice, the reverted full i18n-generator run (out-of-scope churn), the `es.json`-only placeholder scope, and Task 4's route/controller-integration-test scope (vs. full DOM rendering).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no `node_modules`; `npm install` failed on `sqlite3`'s native build**
- **Found during:** Task 1 (attempting the first `ember test` run)
- **Issue:** This worktree checkout never had `npm install` run. A first `npm install` attempt failed entirely (`sqlite3` node-gyp build: `make: python: not found` -- WSL2 only has `python3` on `PATH`, no `python` alias, unlike the CI image which has `python-is-python3`).
- **Fix:** Re-ran with `npm_config_python=/usr/bin/python3 npm install`, which succeeded (2160 packages installed). No repo files changed by this fix (environment-only).
- **Verification:** `ember test --filter="smoke"` ran and passed afterward.
- **Committed in:** N/A (environment-only, no tracked file changed).

**2. [Rule 1 - Bug] Reverted a full `ruby i18n_generator.rb --generate` run that introduced unrelated churn**
- **Found during:** Task 3 (i18n extraction)
- **Issue:** Running the documented extraction command correctly picked up the 3 new keys, but also reordered and *dropped* ~190 pre-existing keys and changed 14 existing values elsewhere in `en.json` -- a side effect of `Dir.glob`'s traversal order in this worktree's file set, unrelated to this plan's change.
- **Fix:** Reverted `public/locales/en.json` and added only the 3 new keys by hand, in the exact content and position the generator itself produced, leaving the rest of the file untouched.
- **Files modified:** `public/locales/en.json` (3-line addition only, confirmed via `git diff --stat`).
- **Verification:** `python3 -c "import json; json.load(...)"` confirms valid JSON; `git diff --stat` shows a 3-line insertion only.
- **Committed in:** `e5c55a873` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking environment-setup issue, 1 bug/scope-creep prevention). Neither required a code-behavior change beyond what the plan specified.
**Impact on plan:** No scope creep in the shipped diff; the i18n-generator revert specifically PREVENTED scope creep that the documented tool command would otherwise have introduced.

## Issues Encountered

- The repo's only pre-existing acceptance test (`board-detail-empty-state-test.js`) is fully `QUnit.skip`'d due to a documented `visit()`-hangs-under-Mirage issue. This meant Task 1 and Task 4 could not follow a literal `setupApplicationTest` + `visit()` pattern as a first-class acceptance test. Both tasks instead used `setupTest` container tests that exercise the real store/adapter/serializer/controller/route objects directly -- documented in detail in the test file's top comment and in the key-decisions above. The `lesson.hbs` template-structure half of the contract (iframe hidden, panel shown, recovery link present) was verified via `ember-template-lint` (0 errors) and grep-based structural checks rather than a rendered-DOM assertion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both plans in Phase 1 (Expired-Link UX) are now complete: Plan 01 (Rails `boards_controller#lesson`) and Plan 02 (this plan, Ember `routes/lesson.js` + template).
- Finding LL-90045bb29c remains OPEN as intended -- nothing in this diff implies or marks it closed; closure is Scot's attestation per PROJECT.md.
- No blockers. This is the only phase in this project (see ROADMAP.md); the project is functionally complete pending Scot's review/merge.

---
*Phase: 01-expired-link-ux*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: app/frontend/tests/acceptance/lesson_expired_test.js
- FOUND: app/frontend/app/routes/lesson.js (contains `link_expired`)
- FOUND: app/frontend/app/controllers/lesson.js (contains `link_expired`)
- FOUND: app/frontend/app/templates/lesson.hbs (contains `{{#if this.link_expired}}`)
- FOUND: public/locales/en.json (contains `link_expired_title`, `link_expired_body`, `link_expired_home`)
- FOUND: public/locales/es.json (contains placeholder entries for the same 3 keys)
- FOUND: 82105be2c (Task 1 commit)
- FOUND: 0a8fb3aaa (Task 2 commit)
- FOUND: e5c55a873 (Task 3 commit)

## Post-review fix (Codex dual-reviewer pass, 2026-07-11)

`/review-pr`'s Codex senior-dev pass flagged (P2/Medium): the `model()` `.catch` mapped
EVERY `findRecord` rejection to `LINK_EXPIRED_MODEL`, so a genuinely missing or
nonce-mismatched lesson (a real 404 from `Api::LessonsController#show`'s `exists?` guard)
would have been mislabeled "this link has expired, request a new one" -- misleading, since
asking for a new link never helps a deleted/nonexistent lesson.

Fix: added `isNotFoundError(err)`, checking the two error shapes this codebase's own
`persistence.js` already uses elsewhere for other status codes (`err.errors[0].status`,
JSON:API/Ember-Data shape; `err.fakeXHR.status`, raw-XHR fallback shape) -- verified against
`app/frontend/app/utils/persistence.js:4338-4354`, not guessed. A genuine 404 now re-throws
and bubbles to the normal not-found error path; any other rejection shape still falls back
to `link_expired` (unchanged defensive behavior for the belt-and-suspenders case). Did NOT
attempt to trace the full custom `findRecord`/local-persistence-cache wrapper in
`persistence.js` beyond confirming this specific error-shape convention -- that file is
large, shared, and offline-sync-critical, and doing so was unnecessary once the existing
status-check convention gave a verified, low-risk hook to key off.

New test (`genuinely missing lesson: a real 404 rejection is NOT relabeled as link_expired`)
proves the distinction. Full `lesson expired` suite: 6/6 pass (was 5/5). Commit: `41a348841`.

## Second post-review round (adversary review of the shipped diff, 2026-07-11)

A second adversary-review pass (this time against the actual diff, not the plan) found the
Codex fix above had two gaps of its own:

1. **The fix's own test exercised the wrong error shape.** `isNotFoundError` already checked
   both `err.errors[0].status` (synthetic JSON:API shape) and `err.fakeXHR.status` (this app's
   real production shape, from `adapters/application.js`'s custom `ajax` override +
   `utils/extras.js`'s `$.ajax` wrapper), but the new test only exercised the former --
   meaning the fix could have silently never fired against a real browser 404 while tests
   stayed green. Added a `fakeXhrNotFoundError()` test proving the production-accurate path.
2. **5xx / offline failures were still silently relabeled "link expired."** Misleading for a
   valid link hitting a transient backend hiccup, and it removed the failure from Ember's
   normal error path where client-side error reporting hooks in. Added
   `isTransientOrServerError(err)`, mirroring `persistence.js`'s own existing 5xx/offline
   detection convention (`.substring(0,1) == '5'`, `fakeXHR.status === 0`), and a 500-error
   test proving it now bubbles instead of being masked.

Full `lesson expired` suite: 8/8 pass (was 6/6). Full `ember test` regression re-run after all
fixes: 1708 tests, 1668 pass, 40 skip, 0 fail. Commit: `dfaae338c`.
- FOUND: 09405ac31 (Task 4 commit)

## Third post-review round (Codex senior-dev pass on PR #580, High + Medium findings, 2026-07-11)

Codex reviewed the actual PR and returned "Request changes" with a High finding neither review
round above caught: booting the Ember shell unconditionally (Plan 01-01) means `routes/lesson.js`
always calls `findRecord` -> `Api::LessonsController#show`, which renders full lesson content
(title, url, description via `lib/json_api/lesson.rb`'s `build_json` -- only the `user` block is
gated by `extra_user`) regardless of whether the share token resolved. The new copy promises
"for your security, links stop working," but the content was fetched either way, just hidden by
`{{#if this.link_expired}}`. An attacker (or anyone inspecting network traffic) could still
recover the lesson title/description/embed URL from the API response even after "expiry."

**Fix:** `app/views/boards/index.html.erb` now embeds `window.lesson_share_token_valid` (guarded
by `@lesson`, computed server-side from the same `@user`/`find_by_lesson_share_token` result
`boards_controller#lesson` already has). Added `consumeServerSideTokenValidityFlag()` to
`routes/lesson.js`: it reads this ONE-SHOT flag (immediately deleting it so a later same-session
transition to a different lesson URL isn't affected by a stale value) and, when `false`, resolves
the `link_expired` sentinel BEFORE calling `findRecord` at all -- no content-fetching API call
happens for the fresh-navigation entry point.

**Verification approach (documented honestly):** Full Rails view rendering (`render_views`) is not
feasible in this test environment -- a scratch spec attempt failed on a Sprockets
`Sprockets::FileNotFound: couldn't find file 'vendor.js'` error from the asset pipeline (this repo
already avoids `render_views` everywhere except one unrelated spec, for the same reason). Verified
the ERB snippet's logic instead via an isolated `ERB.new(template).result(binding)` render (not
through the Rails view pipeline) covering all three cases: `@lesson` + `@user` nil -> emits
`window.lesson_share_token_valid = false;`; `@lesson` + `@user` present -> emits `= true;`;
`@lesson` nil (the `board`/`user` controller actions, which share this view) -> emits nothing, so
no interference with unrelated actions. 3 new frontend tests added, asserting: `findRecord` is
never invoked when the flag is `false`; the flag is consumed one-shot (a subsequent transition to
an unresolved-token lesson still correctly resolves `link_expired` via the pre-existing detection,
unaffected by the first transition's now-cleared flag); and the existing resolve-with-no-user
detection is unaffected when no flag is present at all (client-side SPA transitions, which never
had a server-rendered flag to begin with).

Also fixed the accompanying Medium finding: removed a dead unused `uid` variable in
`routes/lesson.js` that Codex flagged since the route was already being materially edited.

**Explicitly NOT fixed (out of scope, flagged for Scot):** `Api::LessonsController#show`'s guard
is `lesson.nonce == lesson_code || allowed?(lesson, 'view')` -- token validity has never gated
that path, in this plan or before it. Anyone who independently knows a lesson's nonce can still
fetch full content via a direct API call, regardless of share-token validity. That is a separate,
pre-existing architectural question (should the nonce alone permanently grant content visibility,
or should token expiry also gate it, which would touch `Api::LessonsController#show` and
`lib/json_api/lesson.rb` more broadly and needs its own design decision) -- it exceeds this
UX-polish phase's scope and was not decided unilaterally here.

Threat model updated in both plans: 01-01-PLAN.md's T-01-03 corrected (it originally, incorrectly,
implied "boots the shell, grants no data" covered lesson content -- it didn't), new T-01-05 added;
01-02-PLAN.md gets new T-02-06. Full `lesson expired` suite: 11/11 pass (was 8/8). RSpec
`boards_controller_spec.rb`: 26/26 pass (unchanged -- `render_views` isn't enabled there, so the
view-rendering path wasn't exercised by that suite either way). Commits: `2738f8358`, `2f6ef07fd`.

## Fourth post-review round (Codex round 2 on PR #580, High, 2026-07-11)

Codex re-reviewed after the round-3 fix landed and correctly found it incomplete: the
`window.lesson_share_token_valid` flag only closes the fresh-navigation entry point. A
client-side SPA transition to a DIFFERENT lesson's unresolved-token URL has no server-rendered
page to carry a flag through, so `findRecord` -> `api/lessons#show` still ran and returned full
content whenever the nonce matched, with no token check at all (`lesson.nonce == lesson_code ||
allowed?(lesson, 'view')`).

Scot decided (asked directly, given this touches shared serializer/controller code beyond this
plan's original locked boundary): extend the fix now for full closure rather than document as a
residual.

**Fix (T-02-07 in 01-02-PLAN.md, T-01-05 update in 01-01-PLAN.md):** closed at the source instead
of client-side. `Api::LessonsController#show` computes `independently_authorized` via the model's
pure `lesson.allows?(@api_user, 'view', api_permission_scopes)` predicate -- verified via the
`permissable-coughdrop` gem source (`Permissable::InstanceMethods#allows?`) to have NO render
side effect, unlike the controller's `allowed?` wrapper, which renders a 400 on failure and would
have double-rendered for the common anonymous nonce-match case. Passes
`withhold_content: !independently_authorized && !user` to `JsonApi::Lesson.as_json`, which now
gates `title`/`url`/`original_url`/`description`/`due_at`/`due_ts`/`time_estimate`/`past_cutoff`/
`badge`/`noframe` (and the youtube-URL rewrite) behind `unless args[:withhold_content]`.
`id`/`lesson_code`/`required`/`completed_users` stay unconditional (metadata, not content).

Verified every OTHER `JsonApi::Lesson.as_json` call site (grepped): index/paginate, create,
update, complete, `lib/json_api/user.rb`, `lib/json_api/unit.rb` never pass `withhold_content` --
defaults falsy, zero behavior change. 3 new RSpec examples added to
`spec/controllers/api/lessons_controller_spec.rb`: content withheld for anonymous + unresolved
token; content still shown when the token resolves (regression); content still shown for an
independently-authorized viewer (e.g. lesson owner) even with no resolved token (the legitimate
admin-preview case, regression). Full run across `lessons_controller_spec.rb` +
`lib/json_api/lesson_spec.rb` + `models/lesson_spec.rb` + `boards_controller_spec.rb`: 134
examples, 0 failures. Commit: `0195c148e`.

This closes the disclosure for both entry points (fresh navigation and client-side transition) --
no remaining known content-disclosure gap for the unresolved-share-token case.
