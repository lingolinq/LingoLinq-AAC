---
phase: 01-expired-link-ux
plan: 01
subsystem: api
tags: [rails, controller, rspec, boards_controller, lesson_share_token]

# Dependency graph
requires: []
provides:
  - "boards_controller#lesson boots the Ember app shell (render :index) whenever the requested lesson exists and its nonce matches, regardless of whether the share token resolves"
  - "boards_controller#lesson still redirects to /404 only when the lesson is missing or the nonce mismatches"
  - "controller-spec coverage proving expired/malformed/missing/mismatched/valid outcomes, including a genuinely-expired token built from the real verifier"
affects: [01-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "404 decision gated solely on the resource (lesson), never on an auxiliary auth/token lookup, to avoid distinguishing failure reasons at the controller layer (token-validity oracle avoidance, UX-05)"

key-files:
  created: []
  modified:
    - app/controllers/boards_controller.rb
    - spec/controllers/boards_controller_spec.rb

key-decisions:
  - "No feature flag added for this change (Scot, confirmed 2026-07-11) — this is error-state polish on an already-broken path (expired tokens currently 404 or throw), not a new user-facing capability, so CLAUDE.md's new-feature-flag rule does not apply."
  - "Nil-safe nonce guard (@lesson && @lesson.nonce == ...) added as in-scope hardening to prevent a NoMethodError->500 on a genuinely missing lesson; this was implicit in the plan's Task 1 acceptance criteria, not a separate ask."
  - "Retained the now-branch-irrelevant User.find_by_lesson_share_token call, documented inline, solely to preserve legacy-token telemetry logging for LL-310b464be4 sunset tracking (adversary-review condition)."
  - "Left Lesson#nonce's pre-existing unauthenticated write-on-read untouched per adversary-review finding — switching to reading settings['nonce'] directly was explicitly rejected as an out-of-scope 'fix' that could break first-time share-link opens."

patterns-established:
  - "When a controller action's 404 decision depends on two lookups, gate the redirect on only the resource whose absence should legitimately be indistinguishable from an invalid-auxiliary-credential case, to avoid creating a validity oracle for the auxiliary credential."

requirements-completed: [UX-01, UX-05]

# Metrics
duration: ~20min
completed: 2026-07-11
---

# Phase 01 Plan 01: Expired Lesson Link Renders Ember Shell Instead of 404 Summary

**`boards_controller#lesson` now boots the Ember app shell for any existing, nonce-matched lesson even when its `lesson_share_token` is expired, malformed, or unresolvable — 404 is reserved for a genuinely missing or nonce-mismatched lesson — with controller specs pinning the real response shape for a genuinely-expired token.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-11T04:49:50Z
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments
- `def lesson` no longer branches on `@user` (the share-token lookup) when deciding whether to 404; the redirect is gated solely on `@lesson` being present and nonce-matched.
- Added a nil-safe nonce guard so a genuinely missing lesson 404s cleanly instead of raising `NoMethodError` (calling `.nonce` on `nil`).
- Retained (with an explanatory comment) the now-functionally-unused `User.find_by_lesson_share_token` call so legacy permanent-token acceptances still log `[lesson_share_legacy_token]` for LL-310b464be4 sunset telemetry.
- Added a `describe "lesson"` block to `spec/controllers/boards_controller_spec.rb` with 5 examples covering expired-token (built from a real, correctly-signed but past-`expires_at` token, not a stub), malformed-token, missing-lesson, nonce-mismatch, and valid-unexpired-token outcomes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Render the Ember shell for an unresolved token when the lesson exists** - `d64fef846` (fix)
2. **Task 2: Controller specs — expired renders index, missing 404s, valid renders (real response shape)** - `4ddc6f9c6` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `app/controllers/boards_controller.rb` - `def lesson` rewritten so the `/404` redirect depends only on `@lesson` (nil-safe nonce guard, early return); `render :index` is now reached unconditionally once the lesson is confirmed, independent of `@user`/token resolution. Explanatory comments added above the retained `@user` finder call and above `render :index`.
- `spec/controllers/boards_controller_spec.rb` - New `describe "lesson"` block: 5 examples (expired->render index, malformed->render index, missing-lesson->/404, nonce-mismatch->/404, valid-token->render index, regression guard).

## Decisions Made
- No feature flag for this change (Scot, 2026-07-11) — error-state polish on an already-broken path, not a new capability; documented inline in the plan and carried into the implementation. See `key-decisions` above for the full rationale and the other three decisions carried over from the plan-checker/adversary-review passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reset a stale `encryption_hash` Setting row in the local test DB**
- **Found during:** Task 2 (running the new controller specs)
- **Issue:** `bundle exec rspec` failed to boot at all (`OpenSSL::Cipher::CipherError: bad decrypt` from `Setting.get('encryption_hash')`, called by `GoSecure.validate_encryption_key` during `config/environment.rb` load) — this blocked every spec in the file, including pre-existing `describe "board"`/`"user"` examples I never touched, confirming it was an environment/test-DB issue unrelated to this plan's code changes (the worktree's `SECURE_ENCRYPTION_KEY` no longer matched the key that encrypted the `settings.data` row stored in `lingolinq-test` from before this worktree's recreation, per the STATE.md note about the worktree being unexpectedly deleted and recreated mid-session).
- **Fix:** Ran the reset path the codebase itself documents for exactly this scenario (`GoSecure.validate_encryption_key`'s raise message: "If this is intentional you can try DELETE FROM settings WHERE key='encryption_hash' to reset"): `DELETE FROM settings WHERE key='encryption_hash';` against the local `lingolinq-test` database only (never production/staging; this row is regenerated automatically on next boot from the current `SECURE_ENCRYPTION_KEY`).
- **Files modified:** None (test database row only, not tracked in git).
- **Verification:** `DB_USER=scotw RAILS_ENV=test bundle exec rspec spec/controllers/boards_controller_spec.rb` now boots and runs; full file passes (26 examples, 0 failures, 1 pre-existing pending).
- **Committed in:** N/A (database-only change, not a file change).

---

**Total deviations:** 1 auto-fixed (1 blocking test-infra issue, environment-only, no code change).
**Impact on plan:** No scope creep — this was a local test-database artifact blocking the entire spec file's boot, not something introduced by this plan's code. No application code or committed file was touched to work around it.

## Issues Encountered
None beyond the blocking test-infra deviation documented above.

## User Setup Required

None - no external service configuration required. (The test-DB `encryption_hash` reset above was applied automatically during execution to this worktree's local test database only; no action needed from Scot.)

## Next Phase Readiness
- Plan 01-02 (the SPA-side `routes/lesson.js` handling, per PROJECT.md's Active requirements) can now assume `boards_controller#lesson` reliably boots the Ember shell for an expired/malformed-token-but-valid-lesson request, giving the frontend a live `findRecord` rejection or nil-user model to handle instead of never reaching the SPA at all.
- Finding LL-90045bb29c remains OPEN as intended — nothing in this diff implies or marks it closed.
- No blockers for Plan 02.

---
*Phase: 01-expired-link-ux*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: app/controllers/boards_controller.rb
- FOUND: spec/controllers/boards_controller_spec.rb
- FOUND: .planning/phases/01-expired-link-ux/01-01-SUMMARY.md
- FOUND: d64fef846 (Task 1 commit)
- FOUND: 4ddc6f9c6 (Task 2 commit)

## Post-review fix (Codex senior-dev pass on the PR, High finding, 2026-07-11)

Codex reviewed PR #580 and found (High, "Request changes"): this plan's own fix (booting the
Ember shell unconditionally for a valid-lesson/unresolved-token request) means the browser then
calls `findRecord` -> `Api::LessonsController#show`, which renders full lesson content (title,
url, description via `lib/json_api/lesson.rb`) regardless of token validity -- only the `user`
block is gated. The new "for your security, links stop working" copy did not match this reality;
the content was fetched either way, just hidden client-side.

Fix (shared with Plan 01-02, implemented together since it spans both layers):
`app/views/boards/index.html.erb` now embeds `window.lesson_share_token_valid` (guarded by
`@lesson`, set from the same `@user`/`find_by_lesson_share_token` result this action already
computes) so `routes/lesson.js` can skip `findRecord` entirely -- and thus never fetch lesson
content -- when the token is known invalid. See `01-02-SUMMARY.md` for the frontend half, the
verification approach (full view rendering isn't feasible in this test env due to a Sprockets
asset-pipeline dependency; verified instead via an isolated `ERB.new(...).result` render of just
the new snippet for all three cases), and the explicitly out-of-scope residual (content remains
reachable by anyone who knows the lesson's nonce directly, independent of token validity -- a
separate, pre-existing design question, not fixed here). Threat model updated: T-01-03 corrected,
new T-01-05 added. Commits: `2738f8358`, `2f6ef07fd` (also removes a Codex Medium finding, a dead
unused variable).
